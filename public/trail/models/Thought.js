const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: {
      type: String,
      required: true,
      trim: true
    },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      minlength: 1,
      maxlength: 1000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true, versionKey: false }
);

const thoughtSchema = new mongoose.Schema(
  {
    authorName: {
      type: String,
      required: [true, 'Author name is required'],
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: 3,
      maxlength: 200
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['Philosophy', 'Gita', 'History', 'General'],
        message: 'Category must be Philosophy, Gita, History, or General'
      }
    },
    content: {
      type: String,
      required: [true, 'Content is required'],
      trim: true,
      minlength: 20,
      maxlength: 10000
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved'],
      default: 'Pending'
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    comments: [commentSchema],
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model('Thought', thoughtSchema);