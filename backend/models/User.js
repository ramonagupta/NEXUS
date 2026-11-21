// models/User.js
// A person who signed in with their phone number + OTP.

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true }, // E.164, e.g. "+919876543210"
    name: { type: String, default: "", trim: true }, // given when signing up

    // the prank warning: the last time this person was shown it and accepted it when signing in
    warningAcceptedAt: { type: Date, default: null },

    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },

    // raised by "logout": every token issued before that stops working
    tokenVersion: { type: Number, default: 0 },

    // set by an admin (in the database) for someone who sends false reports: they can't sign in
    blocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
