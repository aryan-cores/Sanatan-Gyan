require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Notification model — models/Notification.js mein move kar diya gaya hai
const Notification = require('./models/Notification');

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Contact = require('./models/Contact');
const Thought = require('./models/Thought');
const User = require('./models/User');
const Post = require('./models/Post');
const Message = require('./models/Message');
const EmailOtp = require('./models/EmailOtp');

const cloudinary = require('./config/cloudinary');
const { uploadProfilePic, uploadPost } = require('./config/multer');
const { sendOtpEmail } = require('./config/mailer');

// ── Allowed CORS origins ─────────────────────────────────────────────
// Supports a comma-separated list in ALLOWED_ORIGIN (e.g.
// "http://localhost:5000,https://sanatan-gyan.onrender.com") so local dev
// and the Render production domain both work without editing code.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'http://localhost:5000,https://sanatan-gyan.onrender.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();

// Render (aur zyada tar PaaS) app ko reverse proxy ke peeche run karte hain
// aur X-Forwarded-For header set karte hain. Ye batao ki sirf 1 proxy hop
// trust karo — isse express-rate-limit har user ka sahi real IP pehchanta
// hai (warna "ValidationError: X-Forwarded-For header is set but trust
// proxy is false" wala warning aata hai aur rate limiting sahi se kaam
// nahi karti).
app.set('trust proxy', 1);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true }
});

// ── Startup environment validation ──────────────────────────────────
// Ye variables REQUIRED hain — agar .env mein nahi hain toh server
// immediately crash karega taaki silent insecure fallback na ho.
const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error('   .env.example file dekho aur .env mein proper values set karo.');
    process.exit(1);
  }
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sanatan_gyan';
const ADMIN_KEY = process.env.ADMIN_KEY;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ------------------- Middleware -------------------
// CORS — sirf allowed origins se requests accept karo
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ------------------- Rate Limiting -------------------
// Auth routes par — brute force attacks se bachao
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 requests per 15 min per IP
  message: { success: false, message: 'Bahut zyada attempts. 15 minute baad try karo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Comment/like routes par — spam se bachao
const actionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { success: false, message: 'Bahut zyada requests. Thodi der ruko.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP requests par extra-tight limit — email spam/bombing se bachao
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 OTP requests per 15 min per IP
  message: { success: false, message: 'Bahut zyada OTP requests. 15 minute baad try karo.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api/auth/send-otp', otpLimiter);
app.use('/api/contact', authLimiter);

// ------------------- MongoDB Connection -------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ------------------- Admin Auth Middleware -------------------
const adminAuthAttempts = new Map();
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const ADMIN_BLOCK_MS = 30 * 1000;

function sanitizeAdminKey(rawKey) {
  const value = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').trim().slice(0, 256);
}

function verifyAdmin(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const attempt = adminAuthAttempts.get(ip);

  if (attempt && attempt.blockedUntil && attempt.blockedUntil > Date.now()) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed admin login attempts. Please wait before trying again.'
    });
  }

  const key = sanitizeAdminKey(req.headers['x-admin-key']);
  const expected = ADMIN_KEY;

  const isValid = key.length > 0 &&
    key.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));

  if (!isValid) {
    const now = Date.now();
    if (!attempt || now - attempt.firstAttemptAt > ADMIN_ATTEMPT_WINDOW_MS) {
      adminAuthAttempts.set(ip, { count: 1, firstAttemptAt: now, blockedUntil: null });
    } else {
      attempt.count += 1;
      if (attempt.count >= ADMIN_MAX_ATTEMPTS) {
        attempt.blockedUntil = now + ADMIN_BLOCK_MS;
      }
      adminAuthAttempts.set(ip, attempt);
    }
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing admin key'
    });
  }

  adminAuthAttempts.delete(ip);
  next();
}

// ------------------- User Auth Middleware -------------------

// In-progress Google signups (profileComplete === false) sirf inn routes ko
// hit kar sakte hain jab tak mandatory username/password setup complete nahi ho jaata.
const PROFILE_SETUP_EXEMPT_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/complete-profile',
  '/api/auth/check-username'
]);

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, name, username, email, profileComplete }

    // Mandatory setup gate: Google se first-time sign-in karne wale user ka
    // profile jab tak complete (username + password set) nahi hota, tab tak
    // wo baaki protected routes access nahi kar sakta — sirf apna profile
    // complete karne / khud ko check karne wale routes allow hain.
    if (decoded.profileComplete === false && !PROFILE_SETUP_EXEMPT_PATHS.has(req.path)) {
      return res.status(403).json({
        success: false,
        code: 'PROFILE_INCOMPLETE',
        message: 'Please finish setting up your username and password before continuing.'
      });
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    req.user = null;
  }
  next();
}

async function areFriends(userIdA, userIdB) {
  const a = await User.findById(userIdA).select('friendRequests');
  if (!a) return false;
  return a.friendRequests.some(
    (r) => r.from.toString() === userIdB.toString() && r.status === 'accepted'
  ) || (await User.findById(userIdB).select('friendRequests').then(
    (b) => !!b && b.friendRequests.some((r) => r.from.toString() === userIdA.toString() && r.status === 'accepted')
  ));
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      // undefined/null (legacy docs) => true, taaki purane users kabhi lock-out na ho
      profileComplete: user.profileComplete !== false
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// 6-digit numeric OTP, cryptographically random
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ── Online users tracking ────────────────────────────────────────────
// Maps userId -> Set of connected socket ids. A Set (not a single string)
// is required because one user can have multiple sockets open at once
// (two browser tabs, phone + laptop, etc.) — every connected socket also
// joins a room named after its userId via socket.join(userId), so emitting
// to a user is just io.to(userId).emit(...) regardless of how many tabs
// they have open.
const onlineUsers = new Map();

function addOnlineSocket(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}
function removeOnlineSocket(userId, socketId) {
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlineUsers.delete(userId);
}
function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

async function sendNotification(recipientId, senderId, type, message, postId = null) {
  try {
    if (recipientId.toString() === senderId.toString()) return;

    // Always save the notification so it shows up in the bell panel later —
    // "mute" only suppresses the live real-time push/toast, not the record itself.
    const recipientUser = await User.findById(recipientId).select('notificationsMuted');
    const isMuted = !!recipientUser?.notificationsMuted;

    const notif = await Notification.create({ recipient: recipientId, sender: senderId, type, message, postId });

    // Muted → skip the real-time socket push entirely. The notification still exists in the
    // DB and will be picked up next time the recipient calls GET /api/notifications (bell open).
    if (isMuted) return;

    const populated = await Notification.findById(notif._id).populate('sender', 'name username avatarColor profilePicture');
    if (isUserOnline(recipientId.toString())) {
      io.to(recipientId.toString()).emit('notification', {
        _id: populated._id,
        type: populated.type,
        message: populated.message,
        postId: populated.postId,
        sender: {
          id: populated.sender._id,
          name: populated.sender.name,
          username: populated.sender.username,
          avatarColor: populated.sender.avatarColor,
          profilePicture: populated.sender.profilePicture?.url || null
        },
        read: false,
        createdAt: populated.createdAt
      });
    }
  } catch (err) {
    console.error('sendNotification error:', err.message);
  }
}

function emitFriendStatusUpdate(userIdA, userIdB, statusForA, statusForB) {
  const idA = userIdA.toString();
  const idB = userIdB.toString();
  if (isUserOnline(idA)) io.to(idA).emit('friend_status_update', { withUserId: idB, status: statusForA });
  if (isUserOnline(idB)) io.to(idB).emit('friend_status_update', { withUserId: idA, status: statusForB });
}

// ------------------- Authentication Routes -------------------

// POST /api/auth/send-otp — signup se pehle email verify karne ke liye OTP bhejta hai
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await EmailOtp.findOneAndUpdate(
      { email },
      { email, otpHash, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendOtpEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: `A verification code has been sent to ${email}. It expires in 10 minutes.`
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, message: 'Could not send verification code. Please try again.' });
  }
});

// POST /api/auth/verify-otp — explicit verify step so the frontend can confirm
// the code is correct BEFORE the user finishes filling the rest of the form.
// Signup still independently re-checks the same OTP record — this is a
// fast-feedback pre-check, not a replacement for that server-side check.
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const otp = (req.body.otp || '').toString().trim();

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required.' });
    }

    const otpRecord = await EmailOtp.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'No verification code was requested for this email. Please request one first.' });
    }
    if (otpRecord.expiresAt < new Date()) {
      await otpRecord.deleteOne();
      return res.status(400).json({ success: false, message: 'This verification code has expired. Please request a new one.' });
    }
    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new verification code.' });
    }
    if (otpRecord.otpHash !== hashOtp(otp)) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }

    otpRecord.verified = true;
    await otpRecord.save();

    return res.status(200).json({ success: true, message: 'Email verified.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: 'Could not verify the code. Please try again.' });
  }
});

// POST /api/auth/signup (requires a verified email OTP — call /api/auth/send-otp first)
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, username, email, password, otp } = req.body;

    if (!name || !username || !email || !password || !otp) {
      return res.status(400).json({ success: false, message: 'Name, username, email, password, and the emailed OTP are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      return res.status(400).json({ success: false, message: 'Username must be 3–30 characters long.' });
    }
    if (!/^[a-z0-9_.]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain lowercase letters, numbers, underscores, and dots.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    // ---- Verify the emailed OTP ----
    const otpRecord = await EmailOtp.findOne({ email: cleanEmail });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'No verification code was requested for this email. Please request one first.' });
    }
    if (otpRecord.expiresAt < new Date()) {
      await otpRecord.deleteOne();
      return res.status(400).json({ success: false, message: 'This verification code has expired. Please request a new one.' });
    }
    if (otpRecord.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new verification code.' });
    }
    if (otpRecord.otpHash !== hashOtp(String(otp).trim())) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({ success: false, message: 'Incorrect verification code.' });
    }

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const existingUsername = await User.findOne({ username: cleanUsername });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'This username is already taken. Please choose another one.' });
    }

    const newUser = new User({
      name: name.trim(),
      username: cleanUsername,
      email: cleanEmail,
      password,
      emailVerified: true,
      profileComplete: true
    });
    await newUser.save();

    // OTP consumed — clean it up so it can't be reused
    await otpRecord.deleteOne();

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: `Welcome to Sanatan Gyan, ${newUser.name}!`,
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        email: newUser.email,
        avatarColor: newUser.avatarColor,
        profilePicture: newUser.profilePicture?.url || null,
        isAdmin: !!ADMIN_EMAIL && newUser.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `This ${field} is already in use.` });
    }
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Server error during signup. Please try again.' });
  }
});

// POST /api/auth/login (Dual Login: Email OR @username)
// POST /api/auth/login (Dual Login: Email OR @username)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const identifier = (email || username || '').trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Email/Username and password are required.' });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Google-first-time user jisne abhi tak password set hi nahi kiya —
    // clearer message do instead of a generic "Invalid credentials."
    if (user.googleId && !user.profileComplete) {
      return res.status(401).json({
        success: false,
        code: 'GOOGLE_SETUP_REQUIRED',
        message: 'This account was created with Google. Please continue with Google to finish setting up your username and password.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (isMatch !== true) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        notificationsMuted: !!user.notificationsMuted,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
  }
});
// POST /api/auth/google - Google OAuth Login
// POST /api/auth/google - Google OAuth Login
app.post('/api/auth/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ success: false, message: 'Google ID Token is required.' });
        }

        // Verify token with Google
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Google account has no email associated.' });
        }

        // Check if user exists by googleId or email
        let user = await User.findOne({
            $or: [{ googleId }, { email: email.toLowerCase() }]
        });

        let isNewUser = false;

        if (user) {
            let updated = false;
            if (!user.googleId) {
                user.googleId = googleId;
                updated = true;
            }
            if (!user.profilePicture || !user.profilePicture.url) {
                user.profilePicture = { url: picture, publicId: null };
                updated = true;
            }
            if (updated) await user.save();
        } else {
            isNewUser = true;
            // Temporary placeholder username — sirf DB uniqueness ke liye.
            // User ko mandatory setup step mein apna real username choose karna hoga.
            const baseUsername = ('user' + name.replace(/[^a-zA-Z0-9_]/g, '')).toLowerCase().slice(0, 15) || 'user';
            let uniqueUsername = baseUsername;
            let count = 1;
            while (await User.findOne({ username: uniqueUsername })) {
                uniqueUsername = `${baseUsername}${Math.floor(100 + Math.random() * 900)}`;
                count++;
                if (count > 10) break;
            }

            user = new User({
                name: name,
                username: uniqueUsername,
                email: email.toLowerCase(),
                googleId: googleId,
                profilePicture: { url: picture, publicId: null },
                emailVerified: true, // Google ne already email verify kar diya hai
                profileComplete: false // Mandatory Signup/Profile-completion step abhi baaki hai
            });
            await user.save();
        }

        // Generate Token
        const token = generateToken(user);
        const needsSetup = !user.profileComplete;

        // Set Cookie (Taaki page refresh hone par login state bani rahe)
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        return res.status(200).json({
            success: true,
            message: needsSetup
              ? `Welcome ${user.name}! Please finish setting up your account.`
              : `Welcome ${user.name || user.username}!`,
            token,
            isNewUser,
            // Frontend: agar true hai toh mandatory Signup/Profile-completion
            // page par redirect karo, koi aur protected route call mat karo —
            // server bhi enforce karta hai (requireAuth middleware).
            needsSetup,
            user: {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatarColor: user.avatarColor,
                profilePicture: user.profilePicture?.url || null,
                notificationsMuted: !!user.notificationsMuted,
                profileComplete: user.profileComplete,
                isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
            }
        });
    } catch (error) {
        console.error('Google Login Error:', error);
        return res.status(401).json({ success: false, message: 'Google authentication failed. Invalid token.' });
    }
});

// POST /api/auth/complete-profile — mandatory step for first-time Google users
// to set a unique username + password. Exempt from the profile-completion gate
// in requireAuth so an incomplete-profile token can actually call this route.
app.post('/api/auth/complete-profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.googleId) {
      return res.status(400).json({ success: false, message: 'This step only applies to accounts created via Google.' });
    }
    if (user.profileComplete) {
      return res.status(400).json({ success: false, message: 'Your profile is already complete.' });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      return res.status(400).json({ success: false, message: 'Username must be 3–30 characters long.' });
    }
    if (!/^[a-z0-9_.]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain lowercase letters, numbers, underscores, and dots.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    if (cleanUsername !== user.username) {
      const existingUsername = await User.findOne({ username: cleanUsername });
      if (existingUsername) {
        return res.status(409).json({ success: false, message: 'This username is already taken. Please choose another one.' });
      }
      user.username = cleanUsername;
    }

    user.password = password; // pre('save') hook hashes it
    user.profileComplete = true;
    await user.save();

    // Naya token — ab profileComplete: true carry karega, gate hat jaayega
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: `All set, ${user.name}! Your account is ready.`,
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        notificationsMuted: !!user.notificationsMuted,
        profileComplete: user.profileComplete,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({ success: false, message: `This ${field} is already in use.` });
    }
    console.error('Complete profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error while completing profile.' });
  }
});
// GET /api/auth/me - verify token & fetch current user
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.status(200).json({
      success: true,
      needsSetup: !user.profileComplete,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        notificationsMuted: !!user.notificationsMuted,
        profileComplete: user.profileComplete,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Auth /me error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/auth/check-username (Real-time availability)
app.get('/api/auth/check-username', async (req, res) => {
  try {
    const username = (req.query.username || '').trim().toLowerCase();
    if (!username || username.length < 3) {
      return res.json({ available: false, message: 'Username must be at least 3 characters.' });
    }
    if (!/^[a-z0-9_.]+$/.test(username)) {
      return res.json({ available: false, message: 'Only letters, numbers, dot & underscore allowed.' });
    }
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.json({ available: false, message: '❌ This username is already taken.' });
    }
    return res.json({ available: true, message: '✅ Username is available!' });
  } catch (err) {
    return res.status(500).json({ available: false, message: 'Error checking username.' });
  }
});

// PATCH /api/auth/change-password
app.patch('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation password do not match.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const isMatch = await user.comparePassword(currentPassword);
    if (isMatch !== true) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password.' });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Server error while changing password.' });
  }
});

// ------------------- User & Profile Routes -------------------

// GET /api/users/:id/profile
app.get('/api/users/:id/profile', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name username avatarColor profilePicture followers following friendRequests');
    
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const posts = await Post.find({ author: req.params.id })
      .sort({ createdAt: -1 })
      .select('mediaType mediaUrl caption createdAt likes comments');

    const currentUserId = req.user ? req.user.id : null;
    const isFollowing = currentUserId
      ? (user.followers || []).some(id => id && id.toString() === currentUserId)
      : false;
    const isOwnProfile = currentUserId === req.params.id;

    const followerUsers = await User.find({ _id: { $in: user.followers || [] } })
      .select('name username avatarColor profilePicture');
    const followingUsers = await User.find({ _id: { $in: user.following || [] } })
      .select('name username avatarColor profilePicture');

    let friendStatus = 'none';
    if (currentUserId && !isOwnProfile) {
      const me = await User.findById(currentUserId).select('friendRequests');
      const myReq = me?.friendRequests?.find(r => r.from.toString() === req.params.id);
      const theirReq = user.friendRequests?.find(r => r.from.toString() === currentUserId);
      
      if (myReq && myReq.status === 'pending') friendStatus = 'pending_received';
      else if (theirReq && theirReq.status === 'pending') friendStatus = 'pending_sent';
      else if (theirReq && theirReq.status === 'accepted') friendStatus = 'friends';
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        username: user.username,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        followerCount: (user.followers || []).length,
        followingCount: (user.following || []).length,
        followers: followerUsers.map(u => ({
          id: u._id, name: u.name, username: u.username, avatarColor: u.avatarColor,
          profilePicture: u.profilePicture?.url || null
        })),
        following: followingUsers.map(u => ({
          id: u._id, name: u.name, username: u.username, avatarColor: u.avatarColor,
          profilePicture: u.profilePicture?.url || null
        })),
        isFollowing,
        isOwnProfile,
        friendStatus,
        posts: posts.map(p => ({
          _id: p._id,
          mediaType: p.mediaType,
          mediaUrl: p.mediaUrl,
          caption: p.caption,
          createdAt: p.createdAt,
          likeCount: (p.likes || []).length,
          commentCount: (p.comments || []).length,
        }))
      }
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/users/profile (Update Name & Username with 30-day limit)
app.patch('/api/users/profile', requireAuth, async (req, res) => {
  try {
    const { name, username } = req.body;
    if (!name || !username) {
      return res.status(400).json({ success: false, message: 'Name and username are required.' });
    }
    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 50 characters.' });
    }
    if (!/^[a-z0-9_.]{3,30}$/.test(trimmedUsername)) {
      return res.status(400).json({ success: false, message: 'Username must be 3–30 characters (letters, numbers, _ or .).' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const now = new Date();
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    if (trimmedUsername !== user.username) {
      if (user.lastUsernameChange && (now - new Date(user.lastUsernameChange)) < THIRTY_DAYS_MS) {
        const remainingDays = Math.ceil((THIRTY_DAYS_MS - (now - new Date(user.lastUsernameChange))) / (1000 * 60 * 60 * 24));
        return res.status(429).json({
          success: false,
          message: `Username can only be changed once every 30 days. Please wait ${remainingDays} more day(s).`
        });
      }
      const existing = await User.findOne({ username: trimmedUsername, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'This username is already taken.' });
      }
      user.username = trimmedUsername;
      user.lastUsernameChange = now;
    }

    if (trimmedName !== user.name) {
      user.name = trimmedName;
      user.lastNameChange = now;
    }

    await user.save();
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        notificationsMuted: !!user.notificationsMuted,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating profile.' });
  }
});

// DELETE /api/users/profile-picture (Remove Profile Picture)
app.delete('/api/users/profile-picture', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.profilePicture?.publicId && typeof cloudinary !== 'undefined') {
      try {
        await cloudinary.uploader.destroy(user.profilePicture.publicId);
      } catch (destroyErr) {
        console.error('Cloudinary destroy error:', destroyErr.message);
      }
    }

    user.profilePicture = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile picture removed successfully!',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: null,
        notificationsMuted: !!user.notificationsMuted,
        profileComplete: user.profileComplete,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (err) {
    console.error('Remove profile picture error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/users/profile-picture (Update Profile Picture)
app.patch('/api/users/profile-picture', requireAuth, uploadProfilePic.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (user.profilePicture?.publicId && typeof cloudinary !== 'undefined') {
      try {
        await cloudinary.uploader.destroy(user.profilePicture.publicId);
      } catch (destroyErr) {
        console.error('Cloudinary destroy error:', destroyErr.message);
      }
    }

    user.profilePicture = {
      url: req.file.path,
      publicId: req.file.filename
    };
    await user.save();

    const pictureUrl = user.profilePicture?.url || null;
    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully!',
      // Top-level URL kept for legacy callers (frontend stores this directly)
      profilePicture: pictureUrl,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: pictureUrl,
        notificationsMuted: !!user.notificationsMuted,
        profileComplete: user.profileComplete,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (err) {
    console.error('Profile picture update error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/users/:id/follow (Follow / Unfollow Toggle)
// POST /api/users/:id/follow (Safe Follow/Unfollow)
app.post('/api/users/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = (req.user?.id || req.user?._id)?.toString();

    if (!targetId || targetId === 'undefined' || !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: 'Invalid target user ID.' });
    }

    if (targetId === myId) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself.' });
    }

    const [me, target] = await Promise.all([
      User.findById(myId),
      User.findById(targetId)
    ]);

    if (!target || !me) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!Array.isArray(me.following)) me.following = [];
    if (!Array.isArray(target.followers)) target.followers = [];

    const isFollowing = me.following.some(id => id && id.toString() === targetId);

    if (isFollowing) {
      me.following = me.following.filter(id => id && id.toString() !== targetId);
      target.followers = target.followers.filter(id => id && id.toString() !== myId);
    } else {
      me.following.push(targetId);
      target.followers.push(myId);
    }

    await Promise.all([me.save(), target.save()]);

    if (!isFollowing) {
      await sendNotification(targetId, myId, 'follow', `${me.name} started following you.`);
    }

    return res.status(200).json({
      success: true,
      isFollowing: !isFollowing,
      following: !isFollowing,
      followerCount: target.followers.length,
      message: !isFollowing ? `Following ${target.name}` : `Unfollowed ${target.name}`
    });
  } catch (err) {
    console.error('Follow API Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error while updating follow status.' });
  }
});
// ------------------- Post (Photo / Reel) Routes -------------------

// POST /api/posts - Create Post
app.post('/api/posts', requireAuth, uploadPost.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No media file was uploaded.' });
    }

    const { caption } = req.body;
    const isVideo = req.file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'reel' : 'photo';
    const duration = isVideo ? Math.round(req.file.duration || 0) : null;

    if (isVideo && duration > 60) {
      await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'video' });
      return res.status(400).json({ success: false, message: 'Reels must be 60 seconds or shorter.' });
    }

    const newPost = new Post({
      author: req.user.id,
      mediaType,
      mediaUrl: req.file.path,
      mediaPublicId: req.file.filename,
      duration,
      caption: caption ? caption.trim() : ''
    });
    await newPost.save();
    await newPost.populate('author', 'name username avatarColor profilePicture');

    // ── Real-time feed broadcast ──────────────────────────────────────
    // Tell every other connected client a fresh post landed, so it can show
    // a "New Post Available" prompt instead of requiring a manual refresh.
    // Shape matches the GET /api/posts feed item format so the frontend can
    // feed this straight into the same card-builder it already uses.
    // NOTE: `followedByMe` is intentionally omitted here — a global io.emit
    // reaches every socket at once, so it can't be personalized per
    // recipient the way the GET /api/posts route can. It defaults to
    // false/undefined on the client and self-corrects on the next natural
    // feed reload.
    const feedBroadcastPost = {
      _id: newPost._id,
      author: {
        id: newPost.author._id,
        name: newPost.author.name,
        username: newPost.author.username,
        avatarColor: newPost.author.avatarColor,
        profilePicture: newPost.author.profilePicture?.url || null
      },
      mediaType: newPost.mediaType,
      mediaUrl: newPost.mediaUrl,
      duration: newPost.duration,
      caption: newPost.caption,
      createdAt: newPost.createdAt,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false
    };
    io.emit('new_feed_post', feedBroadcastPost);

    return res.status(201).json({ success: true, message: 'Post shared successfully!', data: newPost });
  } catch (error) {
    console.error('Post creation error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating post.' });
  }
});

// GET /api/posts - Paginated feed
app.get('/api/posts', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.type === 'photo' || req.query.type === 'reel') {
      filter.mediaType = req.query.type;
    }

    const search = (req.query.search || '').trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const matchingAuthors = await User.find({ $or: [{ name: regex }, { username: regex }] }).select('_id');
      const authorIds = matchingAuthors.map((u) => u._id);
      filter.$or = [{ caption: regex }, { author: { $in: authorIds } }];
    }

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name username avatarColor profilePicture');

    const currentUserId = req.user ? req.user.id : null;

    // Fetch the logged-in user's `following` list ONCE so every post in this
    // page of the feed can carry a `followedByMe` flag — this is what fixes
    // the "Follow" button resetting to unfollowed after a page refresh,
    // since the frontend feed card reads exactly this field.
    let followingIds = [];
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('following');
      followingIds = me && me.following ? me.following.map((id) => id.toString()) : [];
    }

    const formatted = posts.map((p) => ({
      _id: p._id,
      author: {
        id: p.author?._id || p.author,
        name: p.author?.name || 'Seeker',
        username: p.author?.username || null,
        avatarColor: p.author?.avatarColor || '#d4a437',
        profilePicture: p.author?.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      duration: p.duration,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: (p.likes || []).length,
      commentCount: (p.comments || []).length,
      likedByMe: currentUserId ? (p.likes || []).some((id) => id && id.toString() === currentUserId) : false,
      followedByMe: p.author?._id ? followingIds.includes(p.author._id.toString()) : false,
      savedByMe: false
    }));

    if (currentUserId) {
      const me = await User.findById(currentUserId).select('savedPosts');
      if (me && me.savedPosts && me.savedPosts.length) {
        const savedSet = new Set(me.savedPosts.map((id) => id.toString()));
        formatted.forEach((p) => { p.savedByMe = savedSet.has(p._id.toString()); });
      }
    }

    const totalPosts = await Post.countDocuments(filter);

    return res.status(200).json({
      success: true,
      count: formatted.length,
      totalPosts,
      hasMore: skip + formatted.length < totalPosts,
      data: formatted
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching feed.' });
  }
});

// GET /api/posts/most-liked
app.get('/api/posts/most-liked', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const currentUserId = req.user ? req.user.id : null;

    let followingIds = [];
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('following');
      followingIds = me && me.following ? me.following.map(id => id.toString()) : [];
    }

    const topPhotos = await Post.find({ mediaType: 'photo' })
      .sort({ 'likes.length': -1, createdAt: -1 })
      .limit(limit)
      .populate('author', 'name username avatarColor profilePicture');

    const topReels = await Post.find({ mediaType: 'reel' })
      .sort({ 'likes.length': -1, createdAt: -1 })
      .limit(limit)
      .populate('author', 'name username avatarColor profilePicture');

    const format = (p) => ({
      _id: p._id,
      author: {
        id: p.author?._id || p.author,
        name: p.author?.name || 'Seeker',
        username: p.author?.username || null,
        avatarColor: p.author?.avatarColor || '#d4a437',
        profilePicture: p.author?.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: (p.likes || []).length,
      commentCount: (p.comments || []).length,
      likedByMe: currentUserId ? (p.likes || []).some(id => id && id.toString() === currentUserId) : false,
      followedByMe: p.author?._id ? followingIds.includes(p.author._id.toString()) : false
    });

    return res.status(200).json({
      success: true,
      photos: topPhotos.map(format),
      reels: topReels.map(format)
    });
  } catch (err) {
    console.error('Most-liked error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/posts/:id
app.get('/api/posts/:id', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name username avatarColor profilePicture');

    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const currentUserId = req.user ? req.user.id : null;
    let savedByMe = false;
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('savedPosts');
      savedByMe = !!(me && me.savedPosts?.some(id => id.toString() === post._id.toString()));
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: post._id,
        author: {
          id: post.author?._id || post.author,
          name: post.author?.name || 'Seeker',
          username: post.author?.username || null,
          avatarColor: post.author?.avatarColor || '#d4a437',
          profilePicture: post.author?.profilePicture?.url || null
        },
        mediaType: post.mediaType,
        mediaUrl: post.mediaUrl,
        duration: post.duration,
        caption: post.caption,
        createdAt: post.createdAt,
        likeCount: (post.likes || []).length,
        commentCount: (post.comments || []).length,
        likedByMe: currentUserId ? (post.likes || []).some(id => id && id.toString() === currentUserId) : false,
        savedByMe
      }
    });
  } catch (err) {
    return res.status(404).json({ success: false, message: 'Post not found.' });
  }
});

// POST /api/posts/:id/like
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const userId = req.user.id;
    if (!Array.isArray(post.likes)) post.likes = [];

    const idx = post.likes.findIndex((id) => id && id.toString() === userId);
    let liked;

    if (idx === -1) {
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes.splice(idx, 1);
      liked = false;
    }
    await post.save();

    if (liked && post.author.toString() !== userId) {
      const liker = await User.findById(userId).select('name username');
      await sendNotification(
        post.author, userId, 'like',
        `${liker.name} (@${liker.username || 'user'}) liked your post.`,
        post._id
      );
    }

    return res.status(200).json({ success: true, liked, likeCount: post.likes.length });
  } catch (error) {
    console.error('Error toggling post like:', error);
    return res.status(500).json({ success: false, message: 'Server error while processing like.' });
  }
});

// POST /api/posts/:id/save
app.post('/api/posts/:id/save', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('_id');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const me = await User.findById(req.user.id).select('savedPosts');
    if (!me) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!Array.isArray(me.savedPosts)) me.savedPosts = [];

    const idx = me.savedPosts.findIndex((id) => id && id.toString() === post._id.toString());
    let saved;
    if (idx === -1) {
      me.savedPosts.push(post._id);
      saved = true;
    } else {
      me.savedPosts.splice(idx, 1);
      saved = false;
    }
    await me.save();

    return res.status(200).json({ success: true, saved });
  } catch (error) {
    console.error('Error toggling post save:', error);
    return res.status(500).json({ success: false, message: 'Server error while saving post.' });
  }
});

// GET /api/users/me/saved
app.get('/api/users/me/saved', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate({
        path: 'savedPosts',
        populate: { path: 'author', select: 'name username avatarColor profilePicture' }
      })
      .populate('savedThoughts');

    if (!me) return res.status(404).json({ success: false, message: 'User not found.' });

    const currentUserId = req.user.id;

    const formattedPosts = (me.savedPosts || []).map((p) => ({
      _id: p._id,
      author: {
        id: p.author?._id || p.author,
        name: p.author?.name || 'Seeker',
        username: p.author?.username || null,
        avatarColor: p.author?.avatarColor || '#d4a437',
        profilePicture: p.author?.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      duration: p.duration,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: (p.likes || []).length,
      commentCount: (p.comments || []).length,
      likedByMe: (p.likes || []).some((id) => id && id.toString() === currentUserId),
      savedByMe: true
    }));

    const formattedThoughts = (me.savedThoughts || []).map((t) => ({
      _id: t._id,
      authorName: t.authorName,
      title: t.title,
      category: t.category,
      content: t.content,
      createdAt: t.createdAt,
      likeCount: (t.likes || []).length,
      commentCount: (t.comments || []).length,
      likedByMe: (t.likes || []).some((id) => id && id.toString() === currentUserId),
      savedByMe: true
    }));

    return res.status(200).json({
      success: true,
      data: { posts: formattedPosts, thoughts: formattedThoughts }
    });
  } catch (error) {
    console.error('Error fetching saved items:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching saved items.' });
  }
});

// POST /api/posts/:id/comment
app.post('/api/posts/:id/comment', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const user = await User.findById(req.user.id).select('name username avatarColor profilePicture');

    const newComment = {
      userId: req.user.id,
      userName: user.name,
      username: user.username,
      profilePicture: user.profilePicture?.url || null,
      avatarColor: user.avatarColor || '#d4a437',
      text: text.trim(),
      createdAt: new Date()
    };

    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push(newComment);
    await post.save();

    if (post.author.toString() !== req.user.id) {
      await sendNotification(
        post.author, req.user.id, 'comment',
        `@${user.username || user.name} commented on your post.`,
        post._id
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Comment added.',
      data: post.comments[post.comments.length - 1],
      comment: post.comments[post.comments.length - 1],
      commentCount: post.comments.length
    });
  } catch (error) {
    console.error('Error adding post comment:', error);
    return res.status(500).json({ success: false, message: 'Server error while adding comment.' });
  }
});

// GET /api/posts/:id/comments
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .select('comments')
      .populate('comments.userId', 'name username avatarColor profilePicture');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    // Prefer the live populated user (keeps older comments in sync with profile changes);
    // fall back to the snapshot stored on the comment itself for resilience if the user was deleted.
    const formatted = post.comments.map(c => {
      const obj = c.toObject();
      const liveUser = obj.userId && obj.userId.name !== undefined ? obj.userId : null;
      return {
        ...obj,
        userId: liveUser ? liveUser._id : obj.userId,
        userName: liveUser?.name || obj.userName,
        username: liveUser?.username || obj.username,
        profilePicture: liveUser?.profilePicture?.url || obj.profilePicture || null,
        avatarColor: liveUser?.avatarColor || obj.avatarColor || '#d4a437'
      };
    });

    return res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    console.error('Error fetching post comments:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching comments.' });
  }
});

// PATCH /api/posts/:id
app.patch('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const { caption } = req.body;
    if (typeof caption !== 'string') {
      return res.status(400).json({ success: false, message: 'Caption text is required.' });
    }
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own posts.' });
    }

    post.caption = caption.trim();
    await post.save();

    return res.status(200).json({ success: true, message: 'Caption updated.', caption: post.caption });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while editing post.' });
  }
});

// POST /api/posts/:id/report
app.post('/api/posts/:id/report', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    if (post.author.toString() === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot report your own post.' });
    }

    post.reports = post.reports || [];
    const alreadyReported = post.reports.some((r) => r.userId.toString() === req.user.id);
    if (alreadyReported) {
      return res.status(400).json({ success: false, message: 'You have already reported this post.' });
    }

    post.reports.push({
      userId: req.user.id,
      reason: (reason || '').trim().slice(0, 300),
      createdAt: new Date()
    });
    await post.save();

    return res.status(200).json({ success: true, message: 'Post reported. Our team will review it.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while reporting post.' });
  }
});

// DELETE /api/posts/:id
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own posts.' });
    }

    const resourceType = post.mediaType === 'reel' ? 'video' : 'image';
    try {
      await cloudinary.uploader.destroy(post.mediaPublicId, { resource_type: resourceType });
    } catch (cleanupErr) {
      console.error('Failed to delete media from Cloudinary:', cleanupErr.message);
    }

    await Post.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Post deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while deleting post.' });
  }
});

// ------------------- Private Messaging Routes -------------------
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          otherUserId: {
            $cond: [
              { $eq: [{ $toString: '$sender' }, { $toString: userId }] },
              { $toString: '$receiver' },
              { $toString: '$sender' }
            ]
          }
        }
      },
      {
        $group: {
          _id: '$otherUserId',
          lastMessage: { $first: '$text' },
          lastMessageAt: { $first: '$createdAt' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: [{ $toString: '$receiver' }, { $toString: userId }] }, { $eq: ['$read', false] }] }, 1, 0]
            }
          }
        }
      },
      { $sort: { lastMessageAt: -1 } }
    ]);

    const otherUserIds = conversations.map((c) => c._id);
    const users = await User.find({ _id: { $in: otherUserIds } }).select('name username avatarColor profilePicture');
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u; });

    const seen = new Set();
    const formatted = [];
    for (const c of conversations) {
      const key = c._id.toString();
      if (seen.has(key) || !userMap[key]) continue;
      seen.add(key);
      formatted.push({
        userId: key,
        name: userMap[key].name,
        username: userMap[key].username,
        avatarColor: userMap[key].avatarColor,
        profilePicture: userMap[key].profilePicture?.url || null,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount
      });
    }

    return res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while fetching conversations.' });
  }
});

app.get('/api/messages/:otherUserId', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const { otherUserId } = req.params;

    const friends = await areFriends(myId, otherUserId);
    if (!friends) {
      return res.status(403).json({ success: false, message: 'You can only chat with friends.' });
    }

    const messages = await Message.find({
      $or: [
        { sender: myId, receiver: otherUserId },
        { sender: otherUserId, receiver: myId }
      ]
    }).sort({ createdAt: 1 });

    await Message.updateMany(
      { sender: otherUserId, receiver: myId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ success: true, count: messages.length, data: messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while fetching messages.' });
  }
});

// PATCH /api/messages/:otherUserId/read — marks messages from otherUserId as
// read WITHOUT re-fetching the whole thread. Used when a message arrives via
// socket while the recipient already has that thread open on screen, so the
// unread badge doesn't linger until the thread is closed and reopened.
app.patch('/api/messages/:otherUserId/read', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const { otherUserId } = req.params;

    await Message.updateMany(
      { sender: otherUserId, receiver: myId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while marking messages as read.' });
  }
});

// DELETE /api/messages/conversation/:otherUserId — deletes the entire message
// history between the two users. (The Message schema has no per-user
// "hidden" flag, so this is a hard delete for both participants — matches
// what the "Delete Conversation" button in the UI promises.)
app.delete('/api/messages/conversation/:otherUserId', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const { otherUserId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid user id.' });
    }

    await Message.deleteMany({
      $or: [
        { sender: myId, receiver: otherUserId },
        { sender: otherUserId, receiver: myId }
      ]
    });

    return res.status(200).json({ success: true, message: 'Conversation deleted.' });
  } catch (error) {
    console.error('Delete conversation error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while deleting conversation.' });
  }
});

// ------------------- Community Thoughts & Contact Routes -------------------
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, role, message } = req.body;
    if (!name || !email || !phone || !role || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email address required.' });
    }
    // Phone basic validation (minimum 7 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      return res.status(400).json({ success: false, message: 'Valid phone number required.' });
    }
    const newContact = new Contact({ name, email: email.toLowerCase().trim(), phone, role, message });
    await newContact.save();
    return res.status(201).json({ success: true, message: 'Message received!', data: newContact });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.post('/api/thoughts', optionalAuth, async (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title || !category || !content) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    let authorId = null;
    let authorName, username, email;

    if (req.user) {
      // Logged-in user — Name/Email account se liye jate hain, form se nahi maangte
      const user = await User.findById(req.user.id).select('name username email');
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
      }
      authorId = user._id;
      authorName = user.name;
      username = user.username || '';
      email = user.email || '';
    } else {
      // Guest (logged out) — tabhi Name & Email form se chahiye
      authorName = req.body.authorName;
      email = req.body.email;
      username = '';
      if (!authorName || !email) {
        return res.status(400).json({ success: false, message: 'Name and email are required.' });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Valid email address required.' });
      }
    }

    const newThought = new Thought({
      author: authorId,
      authorName,
      username,
      email,
      title,
      category,
      content
    });
    await newThought.save();
    return res.status(201).json({ success: true, message: 'Thought submitted for review!', data: newThought });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/thoughts/approved', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 6));
    const skip = (page - 1) * limit;

    const totalCount = await Thought.countDocuments({ status: 'Approved' });
    const thoughts = await Thought.find({ status: 'Approved' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('author authorName username title category content likes comments createdAt');

    const currentUserId = req.user ? req.user.id : null;

    const formatted = thoughts.map((t) => ({
      _id: t._id,
      authorId: t.author || null,
      authorName: t.authorName,
      username: t.username || '',
      title: t.title,
      category: t.category,
      content: t.content,
      createdAt: t.createdAt,
      likeCount: (t.likes || []).length,
      commentCount: (t.comments || []).length,
      likedByMe: currentUserId ? (t.likes || []).some((id) => id.toString() === currentUserId) : false,
      savedByMe: false
    }));

    if (currentUserId) {
      const me = await User.findById(currentUserId).select('savedThoughts');
      if (me && me.savedThoughts && me.savedThoughts.length) {
        const savedSet = new Set(me.savedThoughts.map((id) => id.toString()));
        formatted.forEach((t) => { t.savedByMe = savedSet.has(t._id.toString()); });
      }
    }

    return res.status(200).json({
      success: true,
      count: formatted.length,
      totalCount,
      page,
      hasMore: skip + formatted.length < totalCount,
      data: formatted
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error while fetching thoughts.' });
  }
});

app.post('/api/thoughts/:id/like', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const thought = await Thought.findById(id);
    if (!thought) return res.status(404).json({ success: false, message: 'Thought not found.' });

    if (!Array.isArray(thought.likes)) thought.likes = [];
    const idx = thought.likes.findIndex((likeId) => likeId && likeId.toString() === userId);
    let liked;

    if (idx === -1) {
      thought.likes.push(userId);
      liked = true;
    } else {
      thought.likes.splice(idx, 1);
      liked = false;
    }
    await thought.save();

    return res.status(200).json({ success: true, message: liked ? 'Liked!' : 'Unliked.', liked, likeCount: thought.likes.length });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.post('/api/thoughts/:id/save', requireAuth, async (req, res) => {
  try {
    const thought = await Thought.findById(req.params.id);
    if (!thought) return res.status(404).json({ success: false, message: 'Thought not found.' });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!Array.isArray(user.savedThoughts)) user.savedThoughts = [];
    let saved;
    if (user.savedThoughts.some((id) => id && id.toString() === thought._id.toString())) {
      user.savedThoughts.pull(thought._id);
      saved = false;
    } else {
      user.savedThoughts.push(thought._id);
      saved = true;
    }
    await user.save();

    return res.status(200).json({ success: true, saved, message: saved ? 'Saved to profile.' : 'Removed from saved.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/thoughts/:id/comments', async (req, res) => {
  try {
    const thought = await Thought.findById(req.params.id)
      .select('comments')
      .populate('comments.userId', 'name username avatarColor profilePicture');
    if (!thought) return res.status(404).json({ success: false, message: 'Thought not found.' });

    // Prefer the live populated user (keeps older comments in sync with profile changes);
    // fall back to the snapshot stored on the comment itself for resilience if the user was deleted.
    const formatted = thought.comments.map(c => {
      const obj = c.toObject();
      const liveUser = obj.userId && obj.userId.name !== undefined ? obj.userId : null;
      return {
        ...obj,
        userId: liveUser ? liveUser._id : obj.userId,
        userName: liveUser?.name || obj.userName,
        username: liveUser?.username || obj.username,
        profilePicture: liveUser?.profilePicture?.url || obj.profilePicture || null,
        avatarColor: liveUser?.avatarColor || obj.avatarColor || '#d4a437'
      };
    });

    return res.status(200).json({ success: true, count: formatted.length, data: formatted });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.post('/api/thoughts/:id/comment', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Comment text is required.' });

    const thought = await Thought.findById(req.params.id);
    if (!thought) return res.status(404).json({ success: false, message: 'Thought not found.' });

    const user = await User.findById(req.user.id).select('name username avatarColor profilePicture');

    const newComment = {
      userId: req.user.id,
      userName: user.name,
      username: user.username,
      profilePicture: user.profilePicture?.url || null,
      avatarColor: user.avatarColor || '#d4a437',
      text: text.trim(),
      createdAt: new Date()
    };

    if (!Array.isArray(thought.comments)) thought.comments = [];
    thought.comments.push(newComment);
    await thought.save();

    return res.status(201).json({
      success: true,
      message: 'Comment added.',
      data: thought.comments[thought.comments.length - 1],
      commentCount: thought.comments.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ------------------- Friend Requests & Notifications -------------------
app.post('/api/users/:id/friend-request', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    if (targetId === myId) return res.status(400).json({ success: false, message: 'Cannot add yourself.' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!Array.isArray(target.friendRequests)) target.friendRequests = [];
    const existing = target.friendRequests.find(r => r.from.toString() === myId);
    if (existing) return res.status(409).json({ success: false, message: 'Friend request already sent.' });

    target.friendRequests.push({ from: myId });
    await target.save();

    await sendNotification(targetId, myId, 'friend_request', `${req.user.name} sent you a friend request.`);
    emitFriendStatusUpdate(myId, targetId, 'pending_sent', 'pending_received');

    return res.status(201).json({ success: true, message: 'Friend request sent!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.patch('/api/users/friend-request/:fromId', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const fromId = req.params.fromId;
    const { action } = req.body;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be accept or reject.' });
    }

    const me = await User.findById(myId);
    const reqIdx = (me?.friendRequests || []).findIndex(r => r.from.toString() === fromId && r.status === 'pending');
    if (reqIdx === -1) return res.status(404).json({ success: false, message: 'Friend request not found.' });

    me.friendRequests[reqIdx].status = action === 'accept' ? 'accepted' : 'rejected';
    await me.save();

    if (action === 'accept') {
      await sendNotification(fromId, myId, 'friend_accept', `${me.name} accepted your friend request.`);
      emitFriendStatusUpdate(myId, fromId, 'friends', 'friends');
    } else {
      emitFriendStatusUpdate(myId, fromId, 'none', 'none');
    }

    return res.status(200).json({ success: true, message: action === 'accept' ? 'Accepted!' : 'Rejected.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/users/friend-requests', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate('friendRequests.from', 'name username avatarColor profilePicture');
    const pending = (me?.friendRequests || [])
      .filter(r => r.status === 'pending')
      .map(r => ({ from: r.from, createdAt: r.createdAt }));
    return res.status(200).json({ success: true, data: pending });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.delete('/api/users/:id/unfriend', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    const [me, target] = await Promise.all([User.findById(myId), User.findById(targetId)]);
    if (!me || !target) return res.status(404).json({ success: false, message: 'User not found.' });

    me.friendRequests = (me.friendRequests || []).filter(r => !(r.from.toString() === targetId && r.status === 'accepted'));
    target.friendRequests = (target.friendRequests || []).filter(r => !(r.from.toString() === myId && r.status === 'accepted'));

    await Promise.all([me.save(), target.save()]);
    emitFriendStatusUpdate(myId, targetId, 'none', 'none');

    return res.status(200).json({ success: true, message: 'Unfriended.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/users/search?q=username — used by the chat "New message" / search feature.
// Returns matching users (by username or name), excluding the caller and blocked users,
// along with each result's friendship status so the frontend can decide whether to
// open a chat thread directly or prompt the searching user to add a friend first.
app.get('/api/users/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(200).json({ success: true, data: [] });

    const myId = req.user.id;
    const me = await User.findById(myId).select('blockedUsers friendRequests');
    if (!me) return res.status(404).json({ success: false, message: 'User not found.' });

    // Escape regex special characters so user input can't break the query.
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(safeQ, 'i');

    const blocked = (me.blockedUsers || []).map(id => id.toString());

    const results = await User.find({
      _id: { $ne: myId, $nin: blocked },
      $or: [{ username: regex }, { name: regex }]
    })
      .select('name username avatarColor profilePicture friendRequests')
      .limit(15);

    const data = results.map(u => {
      const iSentThem = (me.friendRequests || []).some(r => r.from.toString() === u._id.toString() && r.status === 'accepted');
      const theySentMe = (u.friendRequests || []).some(r => r.from.toString() === myId && r.status === 'accepted');
      const isFriend = iSentThem || theySentMe;
      const pendingFromMe = (u.friendRequests || []).some(r => r.from.toString() === myId && r.status === 'pending');
      const pendingFromThem = (me.friendRequests || []).some(r => r.from.toString() === u._id.toString() && r.status === 'pending');

      let friendStatus = 'none';
      if (isFriend) friendStatus = 'friends';
      else if (pendingFromMe) friendStatus = 'pending_sent';
      else if (pendingFromThem) friendStatus = 'pending_received';

      return {
        id: u._id,
        name: u.name,
        username: u.username,
        avatarColor: u.avatarColor,
        profilePicture: u.profilePicture?.url || null,
        friendStatus
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('User search error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error while searching users.' });
  }
});

// Notifications API
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('sender', 'name username avatarColor profilePicture');

    const formatted = notifications.map(n => ({
      _id: n._id,
      type: n.type,
      message: n.message,
      postId: n.postId,
      read: n.read,
      createdAt: n.createdAt,
      sender: {
        id: n.sender?._id,
        name: n.sender?.name,
        username: n.sender?.username,
        avatarColor: n.sender?.avatarColor,
        profilePicture: n.sender?.profilePicture?.url || null
      }
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.patch('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user.id, read: false }, { $set: { read: true } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { read: true } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/notifications/mute-toggle — flips the current user's notificationsMuted flag.
// Optionally accepts { muted: true|false } in the body to set an explicit state instead of toggling.
app.patch('/api/notifications/mute-toggle', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationsMuted');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const nextState = typeof req.body?.muted === 'boolean' ? req.body.muted : !user.notificationsMuted;
    user.notificationsMuted = nextState;
    await user.save();

    return res.status(200).json({ success: true, notificationsMuted: user.notificationsMuted });
  } catch (err) {
    console.error('Notification mute-toggle error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ------------------- Admin API Routes -------------------
app.get('/api/admin/contacts', verifyAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.get('/api/admin/thoughts', verifyAdmin, async (req, res) => {
  try {
    const thoughts = await Thought.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: thoughts.length, data: thoughts });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.patch('/api/admin/thoughts/:id', verifyAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const updatedThought = await Thought.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!updatedThought) return res.status(404).json({ success: false, message: 'Not found.' });
    return res.status(200).json({ success: true, message: `Status updated to ${status}.`, data: updatedThought });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.delete('/api/admin/thoughts/:id', verifyAdmin, async (req, res) => {
  try {
    await Thought.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Thought deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.delete('/api/admin/contacts/:id', verifyAdmin, async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Contact deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});
// ─────────────────────────────────────────────────────────────────
// ADMIN MODERATION: REPORTED POSTS & ALL MEDIA MANAGEMENT
// ─────────────────────────────────────────────────────────────────

// 1. GET /api/admin/reported-posts — Fetch all reported posts with reasons
app.get('/api/admin/reported-posts', verifyAdmin, async (req, res) => {
  try {
    const reportedPosts = await Post.find({ 'reports.0': { $exists: true } })
      .sort({ 'reports.length': -1, createdAt: -1 })
      .populate('author', 'name username email avatarColor profilePicture')
      .populate('reports.userId', 'name username email');

    return res.status(200).json({
      success: true,
      count: reportedPosts.length,
      data: reportedPosts
    });
  } catch (error) {
    console.error('Fetch reported posts error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching reported posts.' });
  }
});

// 2. GET /api/admin/all-posts — Fetch all photos & reels for gallery moderation
app.get('/api/admin/all-posts', verifyAdmin, async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate('author', 'name username email avatarColor profilePicture');

    return res.status(200).json({
      success: true,
      count: posts.length,
      data: posts
    });
  } catch (error) {
    console.error('Fetch all posts error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching all posts.' });
  }
});

// 3. DELETE /api/admin/posts/:id — Admin Force Delete Post (Cloudinary + MongoDB)
app.delete('/api/admin/posts/:id', verifyAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const resourceType = post.mediaType === 'reel' ? 'video' : 'image';
    if (post.mediaPublicId && typeof cloudinary !== 'undefined') {
      try {
        await cloudinary.uploader.destroy(post.mediaPublicId, { resource_type: resourceType });
      } catch (cErr) {
        console.error('Cloudinary delete error:', cErr.message);
      }
    }

    await Post.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Post deleted successfully by Admin.' });
  } catch (error) {
    console.error('Admin delete post error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting post.' });
  }
});

// 4. PATCH /api/admin/posts/:id/dismiss-reports — Clear reports if post is safe
app.patch('/api/admin/posts/:id/dismiss-reports', verifyAdmin, async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, { $set: { reports: [] } }, { new: true });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    return res.status(200).json({ success: true, message: 'Reports dismissed successfully.' });
  } catch (error) {
    console.error('Dismiss reports error:', error);
    return res.status(500).json({ success: false, message: 'Server error dismissing reports.' });
  }
});
// ------------------- Fallback Routes -------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- Socket.io Handler -------------------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required.'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.profileComplete === false) {
      return next(new Error('PROFILE_INCOMPLETE'));
    }
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid or expired session.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;

  // Join a room named after this user's id. Every tab/device this user has
  // open joins the SAME room, so io.to(userId).emit(...) reaches all of
  // them at once — no more "second tab silently overwrites the first"
  // problem that a single-socket Map used to have.
  socket.join(userId);

  const wasOffline = !isUserOnline(userId);
  addOnlineSocket(userId, socket.id);
  if (wasOffline) io.emit('user_online', { userId });

  socket.on('send_message', async ({ receiverId, text, tempId } = {}) => {
    try {
      if (!receiverId || !text || !text.trim()) {
        socket.emit('message_error', { message: 'Message text and receiver are required.', tempId: tempId || null });
        return;
      }

      const friends = await areFriends(userId, receiverId);
      if (!friends) {
        socket.emit('message_error', { message: 'You can only message friends.', tempId: tempId || null });
        return;
      }

      const message = await Message.create({
        sender: userId,
        receiver: receiverId,
        text: text.trim()
      });

      const payload = {
        _id: message._id,
        sender: userId,
        receiver: receiverId,
        text: message.text,
        read: false,
        createdAt: message.createdAt,
        // Echoed back so the sender's own client can reconcile the optimistic
        // bubble it rendered immediately on submit, instead of appending a
        // second (duplicate) bubble once this confirmation arrives.
        tempId: tempId || null
      };

      // Emit to the receiver's ROOM (all of their open tabs/devices at
      // once), not a single cached socket id. If they're offline the room
      // is simply empty and this is a harmless no-op — the message is
      // already safely saved in MongoDB above and will show up next time
      // they open the thread.
      io.to(receiverId).emit('receive_message', payload);

      // The sender gets a distinct 'message_sent' event so a single send
      // never results in the message being appended twice on their own
      // screen (and it reaches every tab the sender has open too).
      io.to(userId).emit('message_sent', payload);
    } catch (err) {
      socket.emit('message_error', { message: 'Failed to send message.', tempId: tempId || null });
    }
  });

  socket.on('typing', ({ receiverId }) => {
    if (!receiverId) return;
    io.to(receiverId).emit('user_typing', { userId });
  });

  socket.on('disconnect', () => {
    removeOnlineSocket(userId, socket.id);
    // Only announce "offline" once ALL of this user's tabs/devices have
    // disconnected — closing one tab shouldn't mark them offline while
    // another tab is still open.
    if (!isUserOnline(userId)) io.emit('user_offline', { userId });
  });
});

// ------------------- Start Server -------------------
httpServer.listen(PORT, () => {
  console.log(`🕉️  Sanatan Gyan server running on http://localhost:${PORT}`);
});