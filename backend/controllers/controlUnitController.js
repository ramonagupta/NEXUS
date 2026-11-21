// controllers/controlUnitController.js
// The three control units, one for each kind of emergency:
//   medical  Central Medical Control  the ambulances and beds of all the hospitals
//   fire     Central Fire Control     the fire engines of all the fire stations
//   police   Central Police Control   the police units of all the police stations
// Each one sends every dispatch of its kind.
//
//  - The C++ engine (CentralControl) does the dispatching.
//  - Switching a unit offline means none of ITS vehicles is sent: those requests wait in
//    the priority queue (the other two units are not affected). Switching it back online
//    sends the waiting ones, highest priority first.
//  - The dispatch register is built from the emergency records, so there is only
//    one place where dispatches are stored.
//
// /api/control-unit (no kind) is still the medical unit, as before.

const ControlUnit = require("../models/ControlUnit");
const Emergency = require("../models/Emergency");
const engine = require("../utils/cppEngine");
const events = require("../utils/events");
const { cleanName } = require("../utils/validators");
const { exclusive, applyUpdates, broadcast } = require("../utils/emergencyService");

const plain = (doc) => (typeof doc.toObject === "function" ? doc.toObject() : doc);

// which service of an emergency each unit sends
const SERVICE_OF = { medical: "ambulance", fire: "fire", police: "police" };

const kindOf = (req) => (req.params && req.params.kind ? String(req.params.kind).toLowerCase() : "medical");
const knownKind = (kind) => engine.CONTROL_KINDS.includes(kind);

function unknownKind(res, kind) {
  return res.status(404).json({
    message: "Unknown control unit '" + kind + "'. Use one of: " + engine.CONTROL_KINDS.join(", "),
  });
}

// the unit, the fleet it controls, and its dispatch numbers
async function buildOverview(kind) {
  const service = SERVICE_OF[kind];
  const [unit, resources, emergencies] = await Promise.all([
    engine.getControlUnit(kind),
    engine.getResources(),
    Emergency.find({}),
  ]);
  const c = unit.controlUnit;

  let totalDispatches = 0;
  let activeDispatches = 0;
  let waitingForDispatch = 0;

  for (const e of emergencies.map(plain)) {
    const a = e.assignments && e.assignments[service];
    if (!a) continue;

    const open = e.status !== "resolved";
    if (a.state === "assigned") {
      totalDispatches++;
      if (open) activeDispatches++;
    } else if (a.state === "waiting" && open) {
      waitingForDispatch++;
    }
  }

  const overview = {
    kind,
    name: c.name,
    location: c.location,
    locationNode: c.location,
    area: engine.nodeName(c.location),
    status: c.online ? "online" : "offline",
    fleet: c.fleet, // medical: hospitals, ambulances, beds. fire / police: stations and units
    stats: {
      totalDispatches, // every dispatch ever made by this unit
      activeDispatches, // emergencies with its vehicles out right now
      waitingForDispatch, // emergencies waiting for this unit to send a vehicle
    },
  };

  if (kind === "medical") {
    overview.hospitals = resources.hospitals.map(engine.withNodeId); // every hospital, with its beds
    overview.stats.waitingForAmbulance = waitingForDispatch; // the old name
  } else {
    overview.stations = resources.stations.filter((s) => s.type === kind).map(engine.withNodeId);
  }

  return overview;
}

async function getControlUnit(req, res) {
  try {
    const kind = kindOf(req);
    if (!knownKind(kind)) return unknownKind(res, kind);
    res.json(await buildOverview(kind));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// the three units at once
async function getAllControlUnits(req, res) {
  try {
    const all = {};
    for (const kind of engine.CONTROL_KINDS) all[kind] = await buildOverview(kind);
    res.json(all);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// body: any of { name, location (or locationNode), status: "online" | "offline" }
async function updateControlUnit(req, res) {
  try {
    const kind = kindOf(req);
    if (!knownKind(kind)) return unknownKind(res, kind);

    const existing = await ControlUnit.findOneOfKind(kind);
    if (!existing) return res.status(404).json({ message: "Control unit is not set up yet" });

    const name = req.body.name !== undefined ? cleanName(req.body.name) : existing.name;
    const newLocation = req.body.location ?? req.body.locationNode;
    const location = newLocation !== undefined ? engine.resolveNode(newLocation) : existing.location;

    let online = existing.online;
    if (req.body.status !== undefined) {
      if (req.body.status !== "online" && req.body.status !== "offline") {
        return res.status(400).json({ message: "status must be 'online' or 'offline'" });
      }
      online = req.body.status === "online";
    }

    if (!name) {
      return res.status(400).json({ message: "name can't be empty (max 60 characters)" });
    }
    if (!location) {
      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });
    }

    const previous = { name: existing.name, location: existing.location, online: existing.online };

    const outcome = await exclusive(async () => {
      const result = await engine.setControlUnit(name, location, online, kind);
      if (!result.ok) return { result };

      try {
        existing.kind = kind;
        existing.name = name;
        existing.location = location;
        existing.online = online;
        await existing.save();
      } catch (dbError) {
        await engine.setControlUnit(previous.name, previous.location, previous.online, kind);
        throw dbError;
      }

      // switching on sends the requests that were waiting
      return { result, changed: await applyUpdates(result.updates) };
    });

    if (!outcome.result.ok) {
      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);

    const overview = await buildOverview(kind);
    events.publish("control-unit", overview);
    res.json(overview);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// The dispatch register: every dispatch the unit has made, newest first.
// ?active=true  only emergencies that are still open
async function getDispatches(req, res) {
  try {
    const kind = kindOf(req);
    if (!knownKind(kind)) return unknownKind(res, kind);
    const service = SERVICE_OF[kind];

    const emergencies = await Emergency.find({});
    const onlyActive = req.query.active === "true";

    const rows = [];
    for (const e of emergencies.map(plain)) {
      const a = e.assignments && e.assignments[service];
      if (!a || a.state !== "assigned") continue;

      const active = e.status !== "resolved";
      if (onlyActive && !active) continue;

      const legs = a.allocations || [];

      rows.push({
        emergencyId: String(e._id),
        title: e.title || "",
        emergencyType: e.type,
        locationNode: e.location,
        locationName: e.locationName || "",
        injuredPeople: e.injuredPeople,
        priorityScore: e.priorityScore,

        unitsSent: a.unitsSent ?? a.unitsRequired,
        ambulancesSent: kind === "medical" ? a.unitsSent ?? a.unitsRequired : undefined, // the old name
        hospital: kind === "medical" ? a.provider : undefined, // the old name
        provider: a.provider, // the nearest station used
        hospitalArea: (a.routeAreas || [])[0] || null,
        // every station that sent units, nearest first (more than one when the nearest ran short)
        stations: legs.map((l) => ({
          provider: l.provider,
          area: (l.routeAreas || [])[0] || null,
          units: l.units,
          beds: l.beds,
          totalSeconds: l.totalSeconds,
        })),
        routePath: a.route || [],
        distanceKm: a.distanceKm,
        totalSeconds: a.totalSeconds,

        dispatchedBy: a.dispatchedBy,
        dispatchedAt: a.dispatchedAt,
        emergencyStatus: e.status,
        active,
      });
    }

    rows.sort((x, y) => new Date(y.dispatchedAt) - new Date(x.dispatchedAt));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getControlUnit, getAllControlUnits, updateControlUnit, getDispatches };
