const mongoose = require('mongoose');

// Signup se pehle email verify karne ke liye short-lived OTP record.
// Ek email ka sirf ek active OTP hota hai (naya bhejne par purana overwrite ho jaata hai).
const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    otpHash: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    // Galat OTP baar baar try karne se rokne ke liye
    attempts: {
      type: Number,
      default: 0
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// TTL index — expire hone ke ~10 min baad Mongo khud hi document delete kar dega
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
