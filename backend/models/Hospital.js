const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    location: { type: String, required: true },
    totalBeds: { type: Number, required: true, min: 0 },
    totalAmbulances: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Hospital", hospitalSchema);
