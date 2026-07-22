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
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);


userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});


userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.password) return false;
  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  return isMatch === true;
};

module.exports = mongoose.model('User', userSchema);