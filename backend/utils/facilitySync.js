// utils/facilitySync.js
// Keeps the C++ engine and MongoDB in step for the things that are saved:
// hospitals, resources (police / fire stations), the control unit and the traffic.
// The engine starts with the built-in hospitals / stations from nexus.cpp.
//
//  - First run (nothing saved yet): save the engine's built-in ones to MongoDB.
//  - Later runs: load whatever is saved in MongoDB into the engine, so what you
//    created / edited / deleted is still there after a restart.
//
// Live availability (beds / vehicles in use) is not saved, it resets on restart.
// Saved records that point at a node the map doesn't have (for example from an
// older version of the map) are skipped, and removed so they don't come back.

const Hospital = require("../models/Hospital");
const Resource = require("../models/Resource");
const ControlUnit = require("../models/ControlUnit");
const Traffic = require("../models/Traffic");
const engine = require("./cppEngine");
const trafficService = require("./trafficService");

// keeps the records that sit on a node of this map, removes the others
async function dropStale(Model, docs, label) {
  const usable = [];
  for (const doc of docs) {
    if (engine.isValidNode(doc.location)) {
      usable.push(doc);
    } else {
      console.log("Removing " + label + " '" + doc.name + "': its location '" + doc.location + "' is not on this map");
      await Model.deleteOne({ _id: doc._id });
    }
  }
  return usable;
}

async function syncFacilities() {
  const hospitals = await dropStale(Hospital, await Hospital.find(), "hospital");
  const resources = await dropStale(Resource, await Resource.find(), "resource");

  if (hospitals.length === 0 && resources.length === 0) {
    const builtIn = await engine.getResources();

    await Hospital.insertMany(
      builtIn.hospitals.map((h) => ({
        name: h.name,
        location: h.location,
        totalBeds: h.totalBeds,
        totalAmbulances: h.totalAmbulances,
      }))
    );
    await Resource.insertMany(
      builtIn.stations.map((s) => ({
        name: s.name,
        type: s.type,
        location: s.location,
        capacity: s.capacity,
        outOfService: s.status === "unavailable",
      }))
    );

    console.log(
      "Saved built-in facilities: " +
        builtIn.hospitals.length + " hospitals, " +
        builtIn.stations.length + " resources"
    );
    return;
  }

  await engine.clearFacilities();

  for (const h of hospitals) {
    const r = await engine.hospitalAdd(h.name, h.location, h.totalBeds, h.totalAmbulances);
    if (!r.ok) console.log("Could not load hospital " + h.name + ": " + r.error);
  }
  for (const s of resources) {
    const r = await engine.stationAdd(s.type, s.name, s.location, s.capacity, s.outOfService);
    if (!r.ok) console.log("Could not load resource " + s.name + ": " + r.error);
  }

  console.log(
    "Loaded " + hospitals.length + " hospitals and " + resources.length + " resources into the engine"
  );
}

// Same idea for the Central Medical Control unit: the first run saves the
// engine's default one, later runs load the saved settings into the engine.
async function syncControlUnit() {
  const saved = await ControlUnit.findOne({});
  const current = (await engine.getControlUnit()).controlUnit;

  if (!saved) {
    await ControlUnit.create({
      name: current.name,
      location: current.location,
      online: current.online,
    });
    console.log("Saved default control unit: " + current.name);
    return;
  }

  // a saved location that isn't on this map goes back to the default one
  if (!engine.isValidNode(saved.location)) {
    console.log("Control unit location '" + saved.location + "' is not on this map, using '" + current.location + "'");
    saved.location = current.location;
    await saved.save();
  }

  const result = await engine.setControlUnit(saved.name, saved.location, saved.online);
  if (!result.ok) console.log("Could not load control unit: " + result.error);
  else console.log("Loaded control unit: " + saved.name + (saved.online ? " (online)" : " (OFFLINE)"));
}

// The shared traffic is initialised HERE, by the backend (the frontend never generates any).
//   TRAFFIC_ON_START=saved   (default) load the saved traffic; if there is none yet, generate random traffic
//   TRAFFIC_ON_START=random  generate fresh random traffic on every start
//   TRAFFIC_ON_START=none    start with no traffic at all
// Whatever is chosen is saved in MongoDB, so every screen reads the same traffic.
async function syncTraffic() {
  const mode = String(process.env.TRAFFIC_ON_START || "saved").toLowerCase();
  const saved = await Traffic.findOne({});

  if (mode === "none") {
    await engine.setTraffic({});
    await trafficService.persist({});
    console.log("Traffic: started with no traffic (TRAFFIC_ON_START=none)");
    return;
  }

  if (mode === "saved" && saved && saved.loads) {
    const kept = await engine.setTraffic(saved.loads);
    console.log("Traffic: loaded the saved traffic for " + Object.keys(kept).length + " roads");

    // roads this map doesn't have (an older map) are dropped from the saved copy too
    if (Object.keys(kept).length !== Object.keys(saved.loads).length) await trafficService.persist(kept);
    return;
  }

  const generated = await engine.randomTraffic();
  await trafficService.persist(generated);
  console.log("Traffic: generated random traffic for " + Object.keys(generated).length + " roads");
}

module.exports = { syncFacilities, syncControlUnit, syncTraffic };
