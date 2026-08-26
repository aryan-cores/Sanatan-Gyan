const mongoose = require('mongoose');

// Saarthi AI Chatbot — conversation history (Point 6).
// Stored per-user (or per-anonymous session id for guests) so returning
// visitors see their previous conversation instead of a blank widget.
const chatMessageSchema = new mongoose.Schema(
  {
    // Logged-in owner of this message thread. Null for guest/anonymous chats,
    // in which case `sessionId` is used instead.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    // Stable client-generated id (stored in localStorage) so guests keep a
    // conversation across page reloads without needing an account.
    sessionId: {
      type: String,
      default: null,
      index: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { versionKey: false }
);

// Compound indexes for the two lookup patterns used by /api/chatbot routes —
// keeps history fetches fast (Point 5: lean, indexed queries) even once a
// user has thousands of stored messages.
chatMessageSchema.index({ user: 1, createdAt: 1 });
chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

// Auto-expire guest (sessionId-only) chat history after 30 days to keep the
// collection lean. Logged-in user history (user != null) is kept indefinitely.
chatMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { user: null } }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
