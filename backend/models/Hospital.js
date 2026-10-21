// models/Hospital.js
// Saved definition of a hospital. MongoDB remembers which hospitals exist and
// their capacity; the C++ engine does the actual work with them (dispatch,
// routing, live availability), and is reloaded from this on every startup.

const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    location: { type: String, required: true }, // map node id, e.g. "h3"
    totalBeds: { type: Number, required: true, min: 0 },
    totalAmbulances: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Hospital", hospitalSchema);
