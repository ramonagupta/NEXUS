// models/ControlUnit.js
// The control units, one for each kind of emergency:
//   medical  Central Medical Control  ambulances and beds of ALL the hospitals
//   fire     Central Fire Control     fire engines of ALL the fire stations
//   police   Central Police Control   police units of ALL the police stations
// Each one sends every dispatch of its kind. This stores their settings; the C++
// engine (CentralControl) does the dispatching and is reloaded from this on every startup.
// Records saved before there were three have no `kind`: they are the medical unit.

const mongoose = require("mongoose");

const controlUnitSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["medical", "fire", "police"], default: "medical" },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true }, // city node code where the control room sits
    online: { type: Boolean, default: true }, // offline = none of its vehicles is sent, requests wait
  },
  { timestamps: true }
);

// the saved unit of one kind (an old record without a kind is the medical one)
controlUnitSchema.statics.findOneOfKind = function (kind) {
  if (kind === "medical") return this.findOne({ $or: [{ kind: "medical" }, { kind: { $exists: false } }] });
  return this.findOne({ kind });
};

module.exports = mongoose.model("ControlUnit", controlUnitSchema);
