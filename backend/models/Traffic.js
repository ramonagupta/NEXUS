const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema(
  {
    loads: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Traffic", trafficSchema);
