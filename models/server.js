require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// ── Notification Schema (inline — no separate file needed) ──────────
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, enum: ['like', 'comment', 'follow', 'friend_request', 'friend_accept'], required: true },
  postId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  message:   { type: String, required: true },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });
notificationSchema.index({ recipient: 1, createdAt: -1 });
const Notification = mongoose.model('Notification', notificationSchema);

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Contact = require('./models/Contact');
const Thought = require('./models/Thought');
const User = require('./models/User');
const Post = require('./models/Post');
const Message = require('./models/Message');

const cloudinary = require('./config/cloudinary');
const { uploadProfilePic, uploadPost } = require('./config/multer');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sanatan_gyan';
const ADMIN_KEY = process.env.ADMIN_KEY || 'sanatan_admin_2026';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || 'sanatan_gyan_super_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ------------------- Middleware -------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ------------------- MongoDB Connection -------------------
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ------------------- Admin Auth Middleware -------------------

// In-memory brute-force guard: tracks failed admin-key attempts per client
// IP so repeated wrong-key guesses get throttled with a 429 instead of being
// retried indefinitely against the raw header comparison.
const adminAuthAttempts = new Map(); // ip -> { count, firstAttemptAt, blockedUntil }
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ADMIN_BLOCK_MS = 30 * 1000; // 30s lockout, matches the client-side cooldown

// Basic sanitization for the x-admin-key header: only ever trust a single
// string value (headers can arrive as an array if sent more than once),
// strip non-printable/control characters (defends against header/CRLF
// injection or null-byte bypass attempts), trim stray whitespace, and cap
// the length so an oversized header can't be used to probe the comparison
// logic or exhaust memory.
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

  // Constant-time comparison (only when lengths already match) so a wrong
  // key can't be distinguished from a right-length-but-wrong key via
  // response-timing side channels.
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

  // Successful auth clears any tracked failures for this IP.
  adminAuthAttempts.delete(ip);
  next();
}
// ------------------- User Auth Middleware -------------------

// Requires a valid token; blocks the request if missing/invalid
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, name, email }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }
}

// Attaches req.user if a valid token is present, but never blocks the request
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

// Returns true only if both users have an accepted friend relationship
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
    { id: user._id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── Online users map: userId → socketId ─────────────────────────────
const onlineUsers = new Map();

// ── Helper: create a notification and push it via socket if online ──
async function sendNotification(recipientId, senderId, type, message, postId = null) {
  try {
    if (recipientId.toString() === senderId.toString()) return;
    const notif = await Notification.create({ recipient: recipientId, sender: senderId, type, message, postId });
    const populated = await Notification.findById(notif._id).populate('sender', 'name avatarColor profilePicture');
    const socketId = onlineUsers.get(recipientId.toString());
    if (socketId) {
      io.to(socketId).emit('notification', {
        _id: populated._id,
        type: populated.type,
        message: populated.message,
        postId: populated.postId,
        sender: {
          id: populated.sender._id,
          name: populated.sender.name,
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

// ── Helper: emit real-time friend status update to both parties ─────
function emitFriendStatusUpdate(userIdA, userIdB, statusForA, statusForB) {
  const socketA = onlineUsers.get(userIdA.toString());
  const socketB = onlineUsers.get(userIdB.toString());
  if (socketA) io.to(socketA).emit('friend_status_update', { withUserId: userIdB.toString(), status: statusForA });
  if (socketB) io.to(socketB).emit('friend_status_update', { withUserId: userIdA.toString(), status: statusForB });
}

// ------------------- Authentication Routes -------------------

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const newUser = new User({ name, email, password });
    await newUser.save();

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: `Welcome to Sanatan Gyan, ${newUser.name}!`,
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
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
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Server error during signup. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (isMatch !== true) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Auth /me error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/auth/change-password - Change logged-in user's password
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
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (isMatch !== true) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current password.' });
    }

    user.password = newPassword; // pre-save hook will hash it automatically
    await user.save();

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Server error while changing password.' });
  }
});

// ... (existing code above this line remains same)

// ------------------- NEW ENDPOINT: Most Liked Posts -------------------
app.get('/api/posts/most-liked', optionalAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const currentUserId = req.user ? req.user.id : null;

    // Fetch the current user's following list once (used to flag/boost followed authors)
    let followingIds = [];
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('following');
      followingIds = me ? me.following.map(id => id.toString()) : [];
    }

    // Top Photos
    const topPhotos = await Post.find({ mediaType: 'photo' })
      .sort({ 'likes.length': -1, createdAt: -1 })
      .limit(limit)
      .populate('author', 'name avatarColor profilePicture');

    // Top Reels
    const topReels = await Post.find({ mediaType: 'reel' })
      .sort({ 'likes.length': -1, createdAt: -1 })
      .limit(limit)
      .populate('author', 'name avatarColor profilePicture');

    const format = (p) => ({
      _id: p._id,
      author: {
        id: p.author._id,
        name: p.author.name,
        avatarColor: p.author.avatarColor,
        profilePicture: p.author.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: p.likes.length,
      commentCount: p.comments.length,
      likedByMe: currentUserId ? p.likes.some(id => id.toString() === currentUserId) : false,
      followedByMe: followingIds.includes(p.author._id.toString())
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

// ------------------- NEW ENDPOINT: Single Post by ID -------------------
// Used for exact deep-linking (e.g. opening the specific post a notification refers to)
app.get('/api/posts/:id', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'name avatarColor profilePicture');

    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const currentUserId = req.user ? req.user.id : null;
    let savedByMe = false;
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('savedPosts');
      savedByMe = !!(me && me.savedPosts.some(id => id.toString() === post._id.toString()));
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: post._id,
        author: {
          id: post.author._id,
          name: post.author.name,
          avatarColor: post.author.avatarColor,
          profilePicture: post.author.profilePicture?.url || null
        },
        mediaType: post.mediaType,
        mediaUrl: post.mediaUrl,
        duration: post.duration,
        caption: post.caption,
        createdAt: post.createdAt,
        likeCount: post.likes.length,
        commentCount: post.comments.length,
        likedByMe: currentUserId ? post.likes.some(id => id.toString() === currentUserId) : false,
        savedByMe
      }
    });
  } catch (err) {
    // Malformed ObjectId also lands here — treat as not found rather than a 500
    return res.status(404).json({ success: false, message: 'Post not found.' });
  }
});


// ------------------- UPDATED PROFILE ROUTE -------------------
// Replace your existing /api/users/:id/profile with this one
app.get('/api/users/:id/profile', optionalAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name avatarColor profilePicture followers following friendRequests');
    
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const posts = await Post.find({ author: req.params.id })
      .sort({ createdAt: -1 })
      .select('mediaType mediaUrl caption createdAt likes comments');

    const currentUserId = req.user ? req.user.id : null;
    const isFollowing = currentUserId
      ? user.followers.some(id => id.toString() === currentUserId)
      : false;
    const isOwnProfile = currentUserId === req.params.id;

    // Get basic info of followers/following
    const followerUsers = await User.find({ _id: { $in: user.followers } })
      .select('name avatarColor profilePicture');
    const followingUsers = await User.find({ _id: { $in: user.following } })
      .select('name avatarColor profilePicture');

    // Friend request status
    let friendStatus = 'none';
    if (currentUserId && !isOwnProfile) {
      const me = await User.findById(currentUserId).select('friendRequests');
      const myReq = me.friendRequests.find(r => r.from.toString() === req.params.id);
      const theirReq = user.friendRequests.find(r => r.from.toString() === currentUserId);
      
      if (myReq && myReq.status === 'pending') friendStatus = 'pending_received';
      else if (theirReq && theirReq.status === 'pending') friendStatus = 'pending_sent';
      else if (theirReq && theirReq.status === 'accepted') friendStatus = 'friends';
    }

    return res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        avatarColor: user.avatarColor,
        profilePicture: user.profilePicture?.url || null,
        followerCount: user.followers.length,
        followingCount: user.following.length,
        followers: followerUsers.map(u => ({
          id: u._id, name: u.name, avatarColor: u.avatarColor,
          profilePicture: u.profilePicture?.url || null
        })),
        following: followingUsers.map(u => ({
          id: u._id, name: u.name, avatarColor: u.avatarColor,
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
          likeCount: p.likes.length,
          commentCount: p.comments.length,
        }))
      }
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// UPDATE PROFILE PICTURE
// PATCH /api/users/profile-picture
// ─────────────────────────────────────────────────────────────────
app.patch('/api/users/profile-picture', requireAuth, uploadProfilePic.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Remove the old Cloudinary image, if one exists
    if (user.profilePicture && user.profilePicture.publicId) {
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

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully!',
      profilePicture: user.profilePicture.url
    });
  } catch (err) {
    console.error('Profile picture update error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ... (rest of the code below remains same)
// ------------------- Post (Photo / Reel) Routes -------------------

// POST /api/posts - Create a new photo or reel post
app.post('/api/posts', requireAuth, uploadPost.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No media file was uploaded.' });
    }

    const { caption } = req.body;
    const isVideo = req.file.mimetype.startsWith('video/');
    const mediaType = isVideo ? 'reel' : 'photo';

    // req.file.duration is populated by Cloudinary for video uploads
    const duration = isVideo ? Math.round(req.file.duration || 0) : null;

    // Enforce reel length limit (max 60 seconds) — reject and clean up if too long
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
    await newPost.populate('author', 'name avatarColor profilePicture');

    return res.status(201).json({ success: true, message: 'Post shared successfully!', data: newPost });
  } catch (error) {
    console.error('Post creation error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating post.' });
  }
});

// GET /api/posts - Paginated feed of all posts (newest first)
app.get('/api/posts', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};

    // Filter by media type (photo / reel)
    if (req.query.type === 'photo' || req.query.type === 'reel') {
      filter.mediaType = req.query.type;
    }

    // Search by caption text or author name
    const search = (req.query.search || '').trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      const matchingAuthors = await User.find({ name: regex }).select('_id');
      const authorIds = matchingAuthors.map((u) => u._id);

      filter.$or = [{ caption: regex }, { author: { $in: authorIds } }];
    }

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('author', 'name avatarColor profilePicture');

    const currentUserId = req.user ? req.user.id : null;

    const formatted = posts.map((p) => ({
      _id: p._id,
      author: {
        id: p.author._id,
        name: p.author.name,
        avatarColor: p.author.avatarColor,
        profilePicture: p.author.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      duration: p.duration,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: p.likes.length,
      commentCount: p.comments.length,
      likedByMe: currentUserId ? p.likes.some((id) => id.toString() === currentUserId) : false,
      savedByMe: false // filled in below once we know which posts the user has saved
    }));

    // Attach savedByMe using the current user's savedPosts list (single extra query, not N+1)
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

// POST /api/posts/:id/like - Toggle like on a post
app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const userId = req.user.id;
    const idx = post.likes.findIndex((id) => id.toString() === userId);
    let liked;

    if (idx === -1) {
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes.splice(idx, 1);
      liked = false;
    }
    await post.save();

    // Notify post author when someone likes (not when unliking)
    if (liked && post.author.toString() !== userId) {
      const liker = await User.findById(userId).select('name');
      await sendNotification(
        post.author, userId, 'like',
        `${liker.name} liked your post.`,
        post._id
      );
    }

    return res.status(200).json({ success: true, liked, likeCount: post.likes.length });
  } catch (error) {
    console.error('Error toggling post like:', error);
    return res.status(500).json({ success: false, message: 'Server error while processing like.' });
  }
});

// POST /api/posts/:id/save - Toggle save/bookmark on a post for the logged-in user
app.post('/api/posts/:id/save', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('_id');
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    const me = await User.findById(req.user.id).select('savedPosts');
    if (!me) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const idx = me.savedPosts.findIndex((id) => id.toString() === post._id.toString());
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

// GET /api/users/me/saved - Get all posts AND thoughts the logged-in user has saved
// (replaces the old GET /api/posts/saved/mine route — powers the Profile "Saved" tab)
app.get('/api/users/me/saved', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate({
        path: 'savedPosts',
        populate: { path: 'author', select: 'name avatarColor profilePicture' }
      })
      .populate('savedThoughts');

    if (!me) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentUserId = req.user.id;

    const formattedPosts = me.savedPosts.map((p) => ({
      _id: p._id,
      author: {
        id: p.author._id,
        name: p.author.name,
        avatarColor: p.author.avatarColor,
        profilePicture: p.author.profilePicture?.url || null
      },
      mediaType: p.mediaType,
      mediaUrl: p.mediaUrl,
      duration: p.duration,
      caption: p.caption,
      createdAt: p.createdAt,
      likeCount: p.likes.length,
      commentCount: p.comments.length,
      likedByMe: p.likes.some((id) => id.toString() === currentUserId),
      savedByMe: true
    }));

    const formattedThoughts = me.savedThoughts.map((t) => ({
      _id: t._id,
      authorName: t.authorName,
      title: t.title,
      category: t.category,
      content: t.content,
      createdAt: t.createdAt,
      likeCount: t.likes.length,
      commentCount: t.comments.length,
      likedByMe: t.likes.some((id) => id.toString() === currentUserId),
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

// POST /api/posts/:id/comment - Add a comment to a post
app.post('/api/posts/:id/comment', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }

    post.comments.push({ userId: req.user.id, userName: req.user.name, text: text.trim() });
    await post.save();

    // Notify post author when someone comments
    if (post.author.toString() !== req.user.id) {
      await sendNotification(
        post.author, req.user.id, 'comment',
        `${req.user.name} commented on your post.`,
        post._id
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Comment added.',
      data: post.comments[post.comments.length - 1],
      commentCount: post.comments.length
    });
  } catch (error) {
    console.error('Error adding post comment:', error);
    return res.status(500).json({ success: false, message: 'Server error while adding comment.' });
  }
});

// GET /api/posts/:id/comments - Fetch all comments for a post
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('comments');
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    return res.status(200).json({ success: true, count: post.comments.length, data: post.comments });
  } catch (error) {
    console.error('Error fetching post comments:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching comments.' });
  }
});

// PATCH /api/posts/:id - Edit caption on own post
app.patch('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const { caption } = req.body;
    if (typeof caption !== 'string') {
      return res.status(400).json({ success: false, message: 'Caption text is required.' });
    }
    if (caption.length > 500) {
      return res.status(400).json({ success: false, message: 'Caption cannot exceed 500 characters.' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own posts.' });
    }

    post.caption = caption.trim();
    await post.save();

    return res.status(200).json({ success: true, message: 'Caption updated.', caption: post.caption });
  } catch (error) {
    console.error('Error editing post caption:', error);
    return res.status(500).json({ success: false, message: 'Server error while editing post.' });
  }
});

// POST /api/posts/:id/report - Report a post (any user except the author)
app.post('/api/posts/:id/report', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
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
    console.error('Error reporting post:', error);
    return res.status(500).json({ success: false, message: 'Server error while reporting post.' });
  }
});

// DELETE /api/posts/:id - Delete own post
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found.' });
    }
    if (post.author.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only delete your own posts.' });
    }

    const resourceType = post.mediaType === 'reel' ? 'video' : 'image';
    try {
      await cloudinary.uploader.destroy(post.mediaPublicId, { resource_type: resourceType });
    } catch (cleanupErr) {
      console.error('Failed to delete post media from Cloudinary:', cleanupErr.message);
    }

    await Post.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: 'Post deleted successfully.' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting post.' });
  }
});

// ------------------- Private Messaging Routes -------------------

// GET /api/messages/conversations - List of people the logged-in user has chatted with
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Message.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        // Normalize to string BEFORE grouping — comparing raw ObjectId fields with
        // $eq/$cond can silently produce two different group keys for the same user
        // if a document's sender/receiver was ever stored as a string vs ObjectId
        // (e.g. from an older code path). Converting both sides to string first
        // guarantees a single, stable group key per other-user, fixing the
        // "same friend appears twice in the sidebar" bug.
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
    const users = await User.find({ _id: { $in: otherUserIds } }).select('name avatarColor profilePicture');
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u; });

    // Defensive de-dupe: even though the aggregation now groups on a normalized
    // string key, collapse by userId again here so a friend can never render twice.
    const seen = new Set();
    const formatted = [];
    for (const c of conversations) {
      const key = c._id.toString();
      if (seen.has(key) || !userMap[key]) continue; // skip dupes and deleted users
      seen.add(key);
      formatted.push({
        userId: key,
        name: userMap[key].name,
        avatarColor: userMap[key].avatarColor,
        profilePicture: userMap[key].profilePicture?.url || null,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount
      });
    }

    return res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching conversations.' });
  }
});

// GET /api/messages/:otherUserId - Message history with a specific user
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

    // Mark all messages sent TO me as read
    await Message.updateMany(
      { sender: otherUserId, receiver: myId, read: false },
      { $set: { read: true } }
    );

    return res.status(200).json({ success: true, count: messages.length, data: messages });
  } catch (error) {
    console.error('Error fetching message history:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching messages.' });
  }
});

// ------------------- Public API Routes -------------------

// POST /api/contact - Save a contact/join request
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, role, message } = req.body;

    if (!name || !email || !phone || !role || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields (name, email, phone, role, message) are required.'
      });
    }

    const newContact = new Contact({ name, email, phone, role, message });
    await newContact.save();

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your message has been received. We will reach out to you soon.',
      data: newContact
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Error saving contact:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});

// POST /api/thoughts - Save a submitted thought/article
app.post('/api/thoughts', async (req, res) => {
  try {
    const { authorName, email, title, category, content } = req.body;

    if (!authorName || !email || !title || !category || !content) {
      return res.status(400).json({
        success: false,
        message: 'All fields (authorName, email, title, category, content) are required.'
      });
    }

    const newThought = new Thought({ authorName, email, title, category, content });
    await newThought.save();

    return res.status(201).json({
      success: true,
      message: 'Your thought has been submitted for review. Thank you for contributing!',
      data: newThought
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Error saving thought:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
});
// GET /api/thoughts/approved - Public feed of approved community thoughts
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
      .select('authorName title category content likes comments createdAt');

    const currentUserId = req.user ? req.user.id : null;

    const formatted = thoughts.map((t) => ({
      _id: t._id,
      authorName: t.authorName,
      title: t.title,
      category: t.category,
      content: t.content,
      createdAt: t.createdAt,
      likeCount: t.likes.length,
      commentCount: t.comments.length,
      likedByMe: currentUserId ? t.likes.some((id) => id.toString() === currentUserId) : false,
      savedByMe: false // filled in below once we know which thoughts the user has saved
    }));

    // Attach savedByMe using the current user's savedThoughts list (single extra query, not N+1)
    if (currentUserId) {
      const me = await User.findById(currentUserId).select('savedThoughts');
      if (me && me.savedThoughts && me.savedThoughts.length) {
        const savedSet = new Set(me.savedThoughts.map((id) => id.toString()));
        formatted.forEach((t) => { t.savedByMe = savedSet.has(t._id.toString()); });
      }
    }

    const hasMore = skip + formatted.length < totalCount;

    return res.status(200).json({
      success: true,
      count: formatted.length,
      totalCount,
      page,
      hasMore,
      data: formatted
    });
  } catch (error) {
    console.error('Error fetching approved thoughts:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching thoughts.' });
  }
});

// POST /api/thoughts/:id/like - Toggle like (like/unlike) - requires auth
app.post('/api/thoughts/:id/like', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const thought = await Thought.findById(id);
    if (!thought) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }

    const alreadyLikedIndex = thought.likes.findIndex((likeId) => likeId.toString() === userId);
    let liked;

    if (alreadyLikedIndex === -1) {
      thought.likes.push(userId);
      liked = true;
    } else {
      thought.likes.splice(alreadyLikedIndex, 1);
      liked = false;
    }

    await thought.save();

    return res.status(200).json({
      success: true,
      message: liked ? 'Thought liked!' : 'Like removed.',
      liked,
      likeCount: thought.likes.length
    });
  } catch (error) {
    console.error('Error toggling like:', error);
    return res.status(500).json({ success: false, message: 'Server error while processing like.' });
  }
});

// POST /api/thoughts/:id/save - Toggle save/bookmark on a thought for the logged-in user
app.post('/api/thoughts/:id/save', requireAuth, async (req, res) => {
  try {
    const thought = await Thought.findById(req.params.id);
    if (!thought) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Defensive init — handles documents from before savedThoughts existed on the schema
    if (!user.savedThoughts) {
      user.savedThoughts = [];
    }

    let saved;
    if (user.savedThoughts.some((id) => id.toString() === thought._id.toString())) {
      user.savedThoughts.pull(thought._id);
      saved = false;
    } else {
      user.savedThoughts.push(thought._id);
      saved = true;
    }
    await user.save();

    return res.status(200).json({
      success: true,
      saved,
      message: saved ? 'Saved to your profile.' : 'Removed from saved.'
    });
  } catch (error) {
    console.error('Error toggling thought save:', error);
    return res.status(500).json({ success: false, message: 'Server error while saving thought.' });
  }
});

// GET /api/thoughts/:id/comments - Fetch comments for a thought (public)
app.get('/api/thoughts/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const thought = await Thought.findById(id).select('comments');

    if (!thought) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }

    const sortedComments = [...thought.comments].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.status(200).json({ success: true, count: sortedComments.length, data: sortedComments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching comments.' });
  }
});

// POST /api/thoughts/:id/comment - Add a comment (requires auth)
app.post('/api/thoughts/:id/comment', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'Comment cannot exceed 1000 characters.' });
    }

    const thought = await Thought.findById(id);
    if (!thought) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }

    const newComment = {
      userId: req.user.id,
      userName: req.user.name,
      text: text.trim(),
      createdAt: new Date()
    };

    thought.comments.push(newComment);
    await thought.save();

    const savedComment = thought.comments[thought.comments.length - 1];

    return res.status(201).json({
      success: true,
      message: 'Comment added successfully.',
      data: savedComment,
      commentCount: thought.comments.length
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ success: false, message: 'Server error while adding comment.' });
  }
});

// ------------------- Admin API Routes -------------------

// GET /api/admin/contacts - Retrieve all contact submissions
app.get('/api/admin/contacts', verifyAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching contacts.' });
  }
});

// GET /api/admin/thoughts - Retrieve all submitted thoughts
app.get('/api/admin/thoughts', verifyAdmin, async (req, res) => {
  try {
    const thoughts = await Thought.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: thoughts.length, data: thoughts });
  } catch (error) {
    console.error('Error fetching thoughts:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching thoughts.' });
  }
});

// PATCH /api/admin/thoughts/:id - Approve/Reject a thought
app.patch('/api/admin/thoughts/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['Pending', 'Approved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "Pending" or "Approved".'
      });
    }

    const updatedThought = await Thought.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedThought) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }

    return res.status(200).json({
      success: true,
      message: `Thought status updated to ${status}.`,
      data: updatedThought
    });
  } catch (error) {
    console.error('Error updating thought:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating thought.' });
  }
});

// DELETE /api/admin/thoughts/:id - Delete a thought (bonus utility)
app.delete('/api/admin/thoughts/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Thought.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Thought not found.' });
    }
    return res.status(200).json({ success: true, message: 'Thought deleted successfully.' });
  } catch (error) {
    console.error('Error deleting thought:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting thought.' });
  }
});

// DELETE /api/admin/contacts/:id - Delete a contact (bonus utility)
app.delete('/api/admin/contacts/:id', verifyAdmin, async (req, res) => {
  try {
    const deleted = await Contact.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Contact not found.' });
    }
    return res.status(200).json({ success: true, message: 'Contact deleted successfully.' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting contact.' });
  }
});
// (duplicate profile route removed — canonical version is above)

// ─────────────────────────────────────────────────────────────────
// FOLLOW / UNFOLLOW
// POST /api/users/:id/follow
// ─────────────────────────────────────────────────────────────────
app.post('/api/users/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    if (targetId === myId) return res.status(400).json({ success: false, message: 'Cannot follow yourself.' });

    const [me, target] = await Promise.all([
      User.findById(myId),
      User.findById(targetId)
    ]);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    const alreadyFollowing = me.following.some(id => id.toString() === targetId);
    if (alreadyFollowing) {
      me.following.pull(targetId);
      target.followers.pull(myId);
    } else {
      me.following.push(targetId);
      target.followers.push(myId);
    }
    await Promise.all([me.save(), target.save()]);

    // Notify target when followed (not unfollowed)
    if (!alreadyFollowing) {
      await sendNotification(targetId, myId, 'follow', `${me.name} started following you.`);
    }

    return res.status(200).json({
      success: true,
      following: !alreadyFollowing,
      followerCount: target.followers.length
    });
  } catch (err) {
    console.error('Follow error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// SEND FRIEND REQUEST
// POST /api/users/:id/friend-request
// ─────────────────────────────────────────────────────────────────
app.post('/api/users/:id/friend-request', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    if (targetId === myId) return res.status(400).json({ success: false, message: 'Cannot add yourself.' });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });

    const existing = target.friendRequests.find(r => r.from.toString() === myId);
    if (existing) return res.status(409).json({ success: false, message: 'Friend request already sent.' });

    target.friendRequests.push({ from: myId });
    await target.save();

    // Send notification and real-time socket events
    await sendNotification(targetId, myId, 'friend_request', `${req.user.name} sent you a friend request.`);

    // Legacy friend_request event (kept for toast UI)
    const targetSocketId = onlineUsers.get(targetId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request', { from: { id: myId, name: req.user.name } });
    }

    // Emit status updates to both parties instantly
    emitFriendStatusUpdate(myId, targetId, 'pending_sent', 'pending_received');

    return res.status(201).json({ success: true, message: 'Friend request sent!' });
  } catch (err) {
    console.error('Friend request error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ACCEPT / REJECT FRIEND REQUEST
// PATCH /api/users/friend-request/:fromId  — body: { action: 'accept'|'reject' }
// ─────────────────────────────────────────────────────────────────
app.patch('/api/users/friend-request/:fromId', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const fromId = req.params.fromId;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Action must be accept or reject.' });
    }

    const me = await User.findById(myId);
    const reqIdx = me.friendRequests.findIndex(r => r.from.toString() === fromId && r.status === 'pending');
    if (reqIdx === -1) return res.status(404).json({ success: false, message: 'Friend request not found.' });

    me.friendRequests[reqIdx].status = action === 'accept' ? 'accepted' : 'rejected';
    await me.save();

    if (action === 'accept') {
      // Notify the original sender that request was accepted
      await sendNotification(fromId, myId, 'friend_accept', `${me.name} accepted your friend request.`);
      // Update both UIs instantly: both are now 'friends'
      emitFriendStatusUpdate(myId, fromId, 'friends', 'friends');
    } else {
      // Rejected: sender goes back to 'none', receiver stays 'none' 
      emitFriendStatusUpdate(myId, fromId, 'none', 'none');
    }

    return res.status(200).json({ success: true, message: action === 'accept' ? 'Friend request accepted!' : 'Request rejected.' });
  } catch (err) {
    console.error('Friend request action error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/users/friend-requests — get my pending incoming requests
app.get('/api/users/friend-requests', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate('friendRequests.from', 'name avatarColor profilePicture');
    const pending = me.friendRequests
      .filter(r => r.status === 'pending')
      .map(r => ({ from: r.from, createdAt: r.createdAt }));
    return res.status(200).json({ success: true, data: pending });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});
// ─────────────────────────────────────────────────────────────────
// NOTIFICATION ROUTES
// ─────────────────────────────────────────────────────────────────

// GET /api/notifications — get recent 30 notifications for logged-in user
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('sender', 'name avatarColor profilePicture');

    const formatted = notifications.map(n => ({
      _id: n._id,
      type: n.type,
      message: n.message,
      postId: n.postId,
      read: n.read,
      createdAt: n.createdAt,
      sender: {
        id: n.sender._id,
        name: n.sender.name,
        avatarColor: n.sender.avatarColor,
        profilePicture: n.sender.profilePicture?.url || null
      }
    }));

    return res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
app.patch('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user.id, read: false }, { $set: { read: true } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id }, { $set: { read: true } });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// UNFRIEND
// DELETE /api/users/:id/unfriend
// ─────────────────────────────────────────────────────────────────
app.delete('/api/users/:id/unfriend', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    if (targetId === myId) return res.status(400).json({ success: false, message: 'Invalid request.' });

    const [me, target] = await Promise.all([
      User.findById(myId),
      User.findById(targetId)
    ]);
    if (!me || !target) return res.status(404).json({ success: false, message: 'User not found.' });

    // Remove accepted friend request entries on both sides
    me.friendRequests = me.friendRequests.filter(
      r => !(r.from.toString() === targetId && r.status === 'accepted')
    );
    target.friendRequests = target.friendRequests.filter(
      r => !(r.from.toString() === myId && r.status === 'accepted')
    );

    await Promise.all([me.save(), target.save()]);

    // Notify both parties via socket
    emitFriendStatusUpdate(myId, targetId, 'none', 'none');

    return res.status(200).json({ success: true, message: 'Unfriended successfully.' });
  } catch (err) {
    console.error('Unfriend error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// UNFOLLOW FROM LIST (by target ID)
// DELETE /api/users/:id/unfollow
// ─────────────────────────────────────────────────────────────────
app.delete('/api/users/:id/unfollow', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    const [me, target] = await Promise.all([User.findById(myId), User.findById(targetId)]);
    if (!me || !target) return res.status(404).json({ success: false, message: 'User not found.' });

    me.following.pull(targetId);
    target.followers.pull(myId);
    await Promise.all([me.save(), target.save()]);

    return res.status(200).json({ success: true, message: 'Unfollowed.', followerCount: target.followers.length });
  } catch (err) {
    console.error('Unfollow error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// REMOVE A FOLLOWER (owner edits their own followers list)
// DELETE /api/users/followers/:followerId
// ─────────────────────────────────────────────────────────────────
app.delete('/api/users/followers/:followerId', requireAuth, async (req, res) => {
  try {
    const followerId = req.params.followerId;
    const myId = req.user.id;
    const [me, follower] = await Promise.all([User.findById(myId), User.findById(followerId)]);
    if (!me || !follower) return res.status(404).json({ success: false, message: 'User not found.' });

    me.followers.pull(followerId);
    follower.following.pull(myId);
    await Promise.all([me.save(), follower.save()]);

    return res.status(200).json({ success: true, message: 'Follower removed.', followerCount: me.followers.length });
  } catch (err) {
    console.error('Remove follower error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// BLOCK / UNBLOCK USER
// POST /api/users/:id/block
// POST /api/users/:id/unblock
// ─────────────────────────────────────────────────────────────────
app.post('/api/users/:id/block', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;
    if (targetId === myId) return res.status(400).json({ success: false, message: 'Cannot block yourself.' });

    const me = await User.findById(myId);
    if (me.blockedUsers.some(id => id.toString() === targetId)) {
      return res.status(409).json({ success: false, message: 'User is already blocked.' });
    }
    me.blockedUsers.push(targetId);
    await me.save();

    return res.status(200).json({ success: true, message: 'User blocked.' });
  } catch (err) {
    console.error('Block error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

app.post('/api/users/:id/unblock', requireAuth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const myId = req.user.id;

    const me = await User.findById(myId);
    me.blockedUsers = me.blockedUsers.filter(id => id.toString() !== targetId);
    await me.save();

    return res.status(200).json({ success: true, message: 'User unblocked.' });
  } catch (err) {
    console.error('Unblock error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE CONVERSATION
// DELETE /api/messages/conversation/:otherUserId
// ─────────────────────────────────────────────────────────────────
app.delete('/api/messages/conversation/:otherUserId', requireAuth, async (req, res) => {
  try {
    const myId = req.user.id;
    const { otherUserId } = req.params;

    await Message.deleteMany({
      $or: [
        { sender: myId, receiver: otherUserId },
        { sender: otherUserId, receiver: myId }
      ]
    });

    return res.status(200).json({ success: true, message: 'Conversation deleted.' });
  } catch (err) {
    console.error('Delete conversation error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET BLOCKED USERS STATUS — check if target is blocked by me
// GET /api/users/:id/block-status
// ─────────────────────────────────────────────────────────────────
app.get('/api/users/:id/block-status', requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('blockedUsers');
    const isBlocked = me.blockedUsers.some(id => id.toString() === req.params.id);
    return res.status(200).json({ success: true, isBlocked });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ------------------- Fallback Routes -------------------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authenticate every socket connection using the same JWT used for REST requests
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required.'));
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded; // { id, name, email }
    next();
  } catch (err) {
    next(new Error('Invalid or expired session.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  io.emit('user_online', { userId });

  // Client asks to send a message to another user
  socket.on('send_message', async ({ receiverId, text } = {}) => {
    try {
      if (!receiverId || !text || !text.trim()) {
        socket.emit('message_error', { message: 'Message text and receiver are required.' });
        return;
      }

      // Check if receiver has blocked sender
      const receiver = await User.findById(receiverId).select('blockedUsers');
      if (receiver && receiver.blockedUsers.some(id => id.toString() === userId)) {
        socket.emit('message_error', { message: 'Unable to send message.' });
        return;
      }

      // Chat is friends-only
      const friends = await areFriends(userId, receiverId);
      if (!friends) {
        socket.emit('message_error', { message: 'You can only message friends.' });
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
        createdAt: message.createdAt
      };

      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', payload);
      }
      socket.emit('message_sent', payload);
    } catch (err) {
      console.error('Socket send_message error:', err);
      socket.emit('message_error', { message: 'Failed to send message.' });
    }
  });

  // Typing indicator
  socket.on('typing', ({ receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('user_typing', { userId });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('user_offline', { userId });
  });
});

// ------------------- Start Server -------------------
httpServer.listen(PORT, () => {
  console.log(`🕉️  Sanatan Gyan server running on http://localhost:${PORT}`);
});