// models/Resource.js
// Saved definition of an emergency response resource: a police station
// (capacity = response units / jeeps) or a fire station (capacity = fire trucks).
// Ambulances belong to hospitals, see models/Hospital.js.
//
// Live availability and the status (available / busy / unavailable) are
// worked out by the C++ engine, so only the fixed settings are stored here.

const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["police", "fire"], required: true },
    location: { type: String, required: true }, // city node code
    capacity: { type: Number, required: true, min: 0 },
    outOfService: { type: Boolean, default: false }, // admin switch -> status "unavailable"
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resource", resourceSchema);
