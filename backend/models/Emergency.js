// models/Emergency.js
// One emergency request. The numbers that come from the C++ engine (resources
// needed, priority score, severity, what was assigned) are stored here as a
// record, but the engine is what calculates them and decides the dispatch.

const mongoose = require("mongoose");

// What the engine did for ONE service (ambulance / police / fire)
const assignmentSchema = new mongoose.Schema(
  {
    unitsRequired: Number,
    state: {
      type: String,
      enum: [
        "not_required", // this emergency doesn't need this service
        "waiting", // needed, no free unit yet: waiting in the priority queue
        "assigned", // a unit has been sent
        "unavailable", // can never be served (e.g. more beds needed than any hospital has)
      ],
      default: "not_required",
    },
    provider: { type: String, default: null }, // hospital / station id, e.g. "h4"
    dispatchedBy: { type: String, default: null }, // the control unit that sent it (ambulances)
    route: [String], // node ids from the station to the scene, e.g. ["h4", "sahast", "clock"]
    routeAreas: [String], // readable names for the same route
    distanceKm: Number,
    baseTimeSeconds: Number, // the trip with no traffic
    trafficDelaySeconds: Number,
    totalSeconds: Number, // the ETA shown: base time + traffic delay (min 1 minute, 3 if on site)
    jammedSegmentCount: Number,
    isOnSite: Boolean,
    dispatchedAt: { type: Date, default: null }, // when this unit was sent
  },
  { _id: false }
);

const emergencySchema = new mongoose.Schema(
  {
    // what the person reported. The engine treats "accident" as medical (it
    // sends ambulances) and "other" as police.
    type: {
      type: String,
      enum: ["fire", "police", "medical", "accident", "other"],
      required: true,
    },

    title: { type: String, default: "" }, // short description, e.g. "Shop fire"
    description: { type: String, default: "" }, // optional longer text
    address: { type: String, default: "" }, // street address / landmark

    injuredPeople: { type: Number, required: true, min: 1 }, // "people affected"
    location: { type: String, required: true }, // map node id of the locality, e.g. "clock"
    locationName: { type: String, default: "" }, // e.g. "Clock Tower"
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },

    // calculated by the C++ engine
    ambulancesNeeded: { type: Number, default: 0 },
    policeNeeded: { type: Number, default: 0 },
    fireTrucksNeeded: { type: Number, default: 0 },
    priorityScore: { type: Number, default: 0 },
    severityLevel: { type: Number, default: 1 }, // 1 to 3

    status: {
      type: String,
      enum: [
        "pending", // waiting for units, nothing sent yet
        "partial", // some units sent, the rest still waiting (or not possible)
        "assigned", // everything required has been sent
        "unassigned", // nothing could be sent
        "in-progress", // the unit has arrived (the frontend calls this ON SCENE)
        "resolved",
      ],
      default: "pending",
    },

    assignments: {
      ambulance: { type: assignmentSchema, default: null },
      police: { type: assignmentSchema, default: null },
      fire: { type: assignmentSchema, default: null },
    },

    dispatchedAt: { type: Date, default: null }, // when the first unit was sent
    resolvedAt: { type: Date, default: null },

    reportedBy: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Emergency", emergencySchema);
