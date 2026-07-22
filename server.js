require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const jwt = require('jsonwebtoken');

const Contact = require('./models/Contact');
const Thought = require('./models/Thought');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sanatan_gyan';
const ADMIN_KEY = process.env.ADMIN_KEY || 'sanatan_admin_2026';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const JWT_SECRET = process.env.JWT_SECRET || 'sanatan_gyan_super_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });


function verifyAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or missing admin key'
    });
  }

  next();
}


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

function generateToken(user) {
  return jwt.sign(
    { id: user._id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
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
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
  }
});


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
        isAdmin: !!ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Auth /me error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});


app.patch('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
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

    user.password = newPassword;
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

app.get('/api/thoughts/approved', optionalAuth, async (req, res) => {
  try {
    const thoughts = await Thought.find({ status: 'Approved' })
      .sort({ createdAt: -1 })
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
      likedByMe: currentUserId ? t.likes.some((id) => id.toString() === currentUserId) : false
    }));

    return res.status(200).json({ success: true, count: formatted.length, data: formatted });
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


app.get('/api/admin/contacts', verifyAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching contacts.' });
  }
});


app.get('/api/admin/thoughts', verifyAdmin, async (req, res) => {
  try {
    const thoughts = await Thought.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: thoughts.length, data: thoughts });
  } catch (error) {
    console.error('Error fetching thoughts:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching thoughts.' });
  }
});


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


app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`🕉️  Sanatan Gyan server running on http://localhost:${PORT}`);
});