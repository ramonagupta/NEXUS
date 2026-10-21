const mongoose = require("mongoose");

const controlUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true },
    online: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ControlUnit", controlUnitSchema);
