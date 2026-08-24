const mongoose = require('mongoose');

const postCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true, versionKey: false }
);

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    mediaType: {
      type: String,
      enum: ['photo', 'reel'],
      required: true
    },
    mediaUrl: {
      type: String,
      required: [true, 'Media URL is required']
    },
    mediaPublicId: {
      type: String,
      required: true // Cloudinary public_id — needed to delete the post's media later
    },
    duration: {
      type: Number, // seconds — only relevant for reels
      default: null
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    comments: [postCommentSchema],
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
