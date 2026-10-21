const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["police", "fire"], required: true },
    location: { type: String, required: true },
    capacity: { type: Number, required: true, min: 0 },
    outOfService: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Resource", resourceSchema);
