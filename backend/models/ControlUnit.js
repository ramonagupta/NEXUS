// models/ControlUnit.js
// The Central Medical Control unit. There is exactly one. It controls the
// ambulances and beds of ALL the hospitals and sends every ambulance dispatch.
// This stores its settings; the C++ engine (CentralMedicalControl) does the
// dispatching and is reloaded from this on every startup.

const mongoose = require("mongoose");

const controlUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true }, // city node code where the control room sits
    online: { type: Boolean, default: true }, // offline = no ambulance is sent, requests wait
  },
  { timestamps: true }
);

module.exports = mongoose.model("ControlUnit", controlUnitSchema);
