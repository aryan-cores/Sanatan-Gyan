const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
   name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true, // Ek hi username 2 logo ka nahi ho sakta
    lowercase: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true, // Same email se 2 account nahi ban sakte
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function () {
      // Normal (non-Google) signup: password hamesha mandatory hai.
      // Google signup: password sirf tab mandatory nahi jab tak profile setup
      // (username + password) complete nahi hota — uske baad ye bhi required ho jaata hai.
      return !this.googleId || this.profileComplete;
    },
    select: false
  },
  googleId: {
    type: String,
    sparse: true
  },
  // False sirf naye Google-first-time users ke liye jab tak wo mandatory
  // Signup/Profile-completion step mein apna username + password set nahi karte.
  // Normal email/password signups ke liye ye hamesha true hota hai.
  profileComplete: {
    type: Boolean,
    default: true
  },
  // Normal signup mein email OTP verify hone ke baad true hota hai.
  // Google signup mein email already Google se verified maana jaata hai, so true.
  emailVerified: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String,
    default: ''
  },
  avatarColor: {
    type: String,
    default: function () {
      const colors = ['#d4a437', '#ff7e0a', '#c74a02', '#e8bd5e', '#b3862a', '#f06200'];
      return colors[Math.floor(Math.random() * colors.length)];
    }
  },
  profilePicture: {
    url: { type: String, default: null },
    publicId: { type: String, default: null }
  },
  // 30-day cooldown tracking dates:
  lastUsernameChange: {
    type: Date,
    default: null
  },
  lastNameChange: {
    type: Date,
    default: null
  },
    createdAt: {
      type: Date,
      default: Date.now
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [
      {
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    // NEW: blocked users list
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Notification mute preference — when true, no new notifications are created/pushed for this user
    notificationsMuted: { type: Boolean, default: false },
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    savedThoughts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Thought' }]
  },
  { versionKey: false }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password) return false;
  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  return isMatch === true;
};

module.exports = mongoose.model('User', userSchema);