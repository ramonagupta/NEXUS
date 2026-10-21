// models/Traffic.js
// The shared traffic of the city: how many vehicles are on each road.
// One document, stored as a single object { "<road id>": vehicles }, for example
// { "clock-rail": 125, "rajpur-kaulagarh": 40 }. The map sets it, the C++ engine
// uses it to route units, and it is loaded back into the engine on every startup.

const mongoose = require("mongoose");

const trafficSchema = new mongoose.Schema(
  {
    loads: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false } // minimize: false keeps an empty {} instead of dropping it
);

module.exports = mongoose.model("Traffic", trafficSchema);
