const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false
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