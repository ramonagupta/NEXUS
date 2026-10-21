const mongoose = require("mongoose");


const assignmentSchema = new mongoose.Schema(
  {
    unitsRequired: Number,
    state: {
      type: String,
      enum: [
        "not_required",
        "waiting",
        "assigned",
        "unavailable",
      ],
      default: "not_required",
    },
    provider: { type: String, default: null },
    dispatchedBy: { type: String, default: null },
    route: [String],
    routeAreas: [String],
    distanceKm: Number,
    baseTimeSeconds: Number,
    trafficDelaySeconds: Number,
    totalSeconds: Number,
    jammedSegmentCount: Number,
    isOnSite: Boolean,
    dispatchedAt: { type: Date, default: null },
  },
  { _id: false }
);

const emergencySchema = new mongoose.Schema(
  {


    type: {
      type: String,
      enum: ["fire", "police", "medical", "accident", "other"],
      required: true,
    },

    title: { type: String, default: "" },
    description: { type: String, default: "" },
    address: { type: String, default: "" },

    injuredPeople: { type: Number, required: true, min: 1 },
    location: { type: String, required: true },
    locationName: { type: String, default: "" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },


    ambulancesNeeded: { type: Number, default: 0 },
    policeNeeded: { type: Number, default: 0 },
    fireTrucksNeeded: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 },
    severityLevel: { type: Number, default: 1 },

    status: {
      type: String,
      enum: [
        "pending",
        "partial",
        "assigned",
        "unassigned",
        "in-progress",
        "resolved",
      ],
      default: "pending",
    },

    assignments: {
      ambulance: { type: assignmentSchema, default: null },
      police: { type: assignmentSchema, default: null },
      fire: { type: assignmentSchema, default: null },
    },

    dispatchedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },

    reportedBy: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Emergency", emergencySchema);
