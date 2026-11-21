// models/Emergency.js
// One emergency request. The numbers that come from the C++ engine (resources
// needed, priority score, severity, what was assigned) are stored here as a
// record, but the engine is what calculates them and decides the dispatch.

const mongoose = require("mongoose");

// One station's share of a service. When the nearest station can't give all the
// units needed, the rest come from the next nearest, so one service can have several.
const allocationSchema = new mongoose.Schema(
  {
    provider: String, // hospital / station id, e.g. "h4"
    units: Number, // ambulances / police units / fire engines it sends
    beds: Number, // beds it keeps for the patients (ambulances only)
    route: [String],
    routeAreas: [String],
    distanceKm: Number,
    baseTimeSeconds: Number,
    trafficDelaySeconds: Number,
    totalSeconds: Number,
    jammedSegmentCount: Number,
    isOnSite: Boolean,
  },
  { _id: false }
);

// What the engine did for ONE service (ambulance / police / fire)
const assignmentSchema = new mongoose.Schema(
  {
    unitsRequired: Number,
    unitsSent: Number, // can be a little higher than required if beds are spread over hospitals
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
    provider: { type: String, default: null }, // the NEAREST hospital / station used, e.g. "h4"
    dispatchedBy: { type: String, default: null }, // the control unit that sent it
    allocations: [allocationSchema], // every station used, nearest first
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
    // what the person reported. "medical" sends ambulances, "fire" fire engines,
    // "police" and "other" a police unit.
    type: {
      type: String,
      enum: ["fire", "police", "medical", "other"],
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

    // additional help asked for on the report: [{ type: "medical", peopleCount: 3 }, { type: "fire" }]
    // Each kind of help is sent by its own control unit (medical / fire / police).
    additionalServices: {
      type: [
        new mongoose.Schema(
          {
            type: { type: String, enum: ["medical", "fire", "police"], required: true },
            peopleCount: { type: Number, default: null }, // medical only: people who need an ambulance
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // who reported it: the signed-in person's phone number (the sign-in warning says it is
    // attached to every report) and name. Only a masked number is ever shown to other people.
    reportedBy: { type: String, default: "anonymous" },
    reporterName: { type: String, default: "" },
    confirmedReal: { type: Boolean, default: false }, // the person confirmed it is happening right now
  },
  { timestamps: true }
);

module.exports = mongoose.model("Emergency", emergencySchema);
