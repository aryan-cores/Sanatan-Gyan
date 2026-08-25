const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: { type: String, required: true, trim: true },
    username: { type: String, trim: true, default: '' },
    // Snapshot of the commenter's avatar at comment time (see Post.js postCommentSchema for rationale)
    profilePicture: { type: String, default: null },
    avatarColor: { type: String, default: '#d4a437' },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      minlength: 1,
      maxlength: 1000
    },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true, versionKey: false }
);

const thoughtSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    authorName: {
      type: String,
      trim: true,
      default: 'Seeker'
    },
    username: {
      type: String,
      trim: true,
      default: ''
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
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
      minlength: 10,
      maxlength: 10000
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved'],
      default: 'Approved' // Auto-approved for verified members
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [commentSchema],
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model('Thought', thoughtSchema);