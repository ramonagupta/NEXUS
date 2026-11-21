// models/OtpRequest.js
// The one-time code sent to a phone number. One document per phone number.
// Only a hash of the code is stored, never the code itself.
// MongoDB removes the document by itself once `purgeAt` has passed.

const mongoose = require("mongoose");

const otpRequestSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },

  codeHash: { type: String, default: null }, // null once the code has been used
  otpExpiresAt: { type: Date, required: true }, // the code stops working at this time
  attempts: { type: Number, default: 0 }, // wrong (and right) tries used on the current code

  lastSentAt: { type: Date, required: true }, // for the "wait before asking again" rule
  windowStart: { type: Date, required: true }, // start of the current hour
  sentInWindow: { type: Number, default: 1 }, // codes sent in this hour (capped)

  purgeAt: { type: Date, required: true, index: { expires: 0 } }, // TTL: document deleted after this
});

module.exports = mongoose.model("OtpRequest", otpRequestSchema);
