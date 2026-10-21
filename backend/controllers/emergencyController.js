// controllers/emergencyController.js
// Registers emergencies in MongoDB and hands the real work (resource calculation,
// priority queue, matching, Dijkstra, waiting for free units) to the C++ engine.
// An emergency is dispatched as soon as it is registered if units are free;
// otherwise it waits in the engine's priority queue.

const Emergency = require("../models/Emergency");
const engine = require("../utils/cppEngine");
const { parsePeople } = require("../utils/validators");
const service = require("../utils/emergencyService");

const STATUSES = ["pending", "partial", "assigned", "unassigned", "in-progress", "resolved"];

function fail(res, error) {
  if (error.name === "CastError") {
    return res.status(404).json({ message: "Emergency not found" });
  }
  res.status(500).json({ message: error.message });
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// Register an emergency. Accepts what the frontend sends:
//   { title, type, locationNode, address, peopleCount, lat, lng, ... }
// and also { description, injuredPeople, location, reportedBy }.
// severityLevel, priorityScore, unitsNeeded and dispatchedAt may be sent but are
// ignored: the engine works them out and the server decides when units are sent.
async function createEmergency(req, res) {
  try {
    const body = req.body;
    const type = String(body.type || "").trim().toLowerCase();
    const injuredPeople = parsePeople(body.peopleCount ?? body.injuredPeople ?? body.people, engine.MAX_PEOPLE);
    const location = engine.resolveNode(body.locationNode ?? body.location);

    if (!engine.EMERGENCY_TYPES.includes(type)) {
      return res.status(400).json({ message: "type must be one of: " + engine.EMERGENCY_TYPES.join(", ") });
    }
    if (injuredPeople === null) {
      return res.status(400).json({
        message: "peopleCount must be a number from 1 to " + engine.MAX_PEOPLE,
      });
    }
    if (!location) {
      return res.status(400).json({ message: "locationNode must be a valid map node (see GET /api/city/map)" });
    }

    // the map position: sent by the frontend, otherwise worked out from the node
    const lat = finite(body.lat) ? body.lat : engine.latLngOf(location).lat;
    const lng = finite(body.lng) ? body.lng : engine.latLngOf(location).lng;

    // save first, so a database failure never leaves a ghost entry in the engine queue
    const doc = await Emergency.create({
      type,
      title: String(body.title ?? "").trim(),
      description: String(body.description ?? "").trim(),
      address: String(body.address ?? "").trim(),
      injuredPeople,
      location,
      lat,
      lng,
      reportedBy: body.reportedBy,
      status: "pending",
    });

    let others;
    try {
      others = await service.exclusive(async () => {
        const updates = await service.registerInEngine(doc);
        return service.applyUpdates(updates);
      });
    } catch (engineError) {
      await Emergency.findByIdAndDelete(doc._id);
      throw engineError;
    }

    const positions = await service.loadPositions();
    service.broadcast([doc, ...others]);

    res.status(201).json(service.toView(doc, positions.get(String(doc._id)) ?? null));
  } catch (error) {
    fail(res, error);
  }
}

// List emergencies. By default only the open ones (everything not resolved), which
// is what the map shows.
//   ?status=all | pending | partial | assigned | unassigned | ON SCENE | resolved
//   ?sort=priority (default) | status | newest
async function getEmergencies(req, res) {
  try {
    const { sort = "priority" } = req.query;
    const asked = req.query.status;

    let filter = () => true;
    if (asked === undefined) {
      filter = (e) => e.status !== "resolved";
    } else if (asked !== "all") {
      const wanted = service.normalizeStatus(asked);
      if (!wanted) {
        return res.status(400).json({
          message: "status must be all, or one of: " + STATUSES.join(", ") + ", ON SCENE",
        });
      }
      filter = (e) => e.status === wanted;
    }
    if (!["priority", "status", "newest"].includes(sort)) {
      return res.status(400).json({ message: "sort must be one of: priority, status, newest" });
    }

    const docs = (await Emergency.find({})).filter(filter);
    const positions = await service.loadPositions();
    const views = docs.map((d) => ({
      stored: d.status,
      view: service.toView(d, positions.get(String(d._id)) ?? null),
    }));

    const byNewest = (a, b) => new Date(b.view.createdAt) - new Date(a.view.createdAt);
    if (sort === "priority") {
      views.sort((a, b) => b.view.priorityScore - a.view.priorityScore || -byNewest(a, b));
    } else if (sort === "status") {
      views.sort((a, b) => STATUSES.indexOf(a.stored) - STATUSES.indexOf(b.stored) || byNewest(a, b));
    } else {
      views.sort(byNewest);
    }

    res.json(views.map((v) => v.view));
  } catch (error) {
    fail(res, error);
  }
}

async function getEmergencyById(req, res) {
  try {
    const doc = await Emergency.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Emergency not found" });

    const positions = await service.loadPositions();
    res.json(service.toView(doc, positions.get(String(doc._id)) ?? null));
  } catch (error) {
    fail(res, error);
  }
}

// The emergencies still waiting for units, in the engine's priority order.
// Position 1 gets the next free unit.
async function getPriorityQueue(req, res) {
  try {
    const result = await engine.getQueue();
    const views = [];

    for (const item of result.queue) {
      const mongoId = service.engineIdToMongoId.get(item.engineId);
      const doc = mongoId ? await Emergency.findById(mongoId) : null;
      if (doc) views.push(service.toView(doc, item.position));
    }

    res.json(views);
  } catch (error) {
    fail(res, error);
  }
}

// Run the waiting queue again. This already happens whenever something changes
// (a new emergency, a resolved one, a hospital or resource added / edited), so it
// is only needed as a manual "try again".
async function dispatchWaiting(req, res) {
  try {
    const changed = await service.exclusive(async () => {
      const result = await engine.dispatch();
      if (!result.ok) throw new Error(result.error);
      return service.applyUpdates(result.updates);
    });

    const positions = await service.loadPositions();
    service.broadcast(changed);

    res.json({
      updated: changed.map((d) => service.toView(d, positions.get(String(d._id)) ?? null)),
    });
  } catch (error) {
    fail(res, error);
  }
}

// ---------------------------------------------------------------------------
// Closing an emergency (resolved): its units go back to their station and the
// freed units go to the highest priority emergency that is waiting.
// Returns { emergency, dispatchedFromQueue }, or null if it doesn't exist.
// ---------------------------------------------------------------------------
async function resolveEmergency(id) {
  const doc = await Emergency.findById(id);
  if (!doc) return null;

  if (doc.status === "resolved") {
    return { doc, others: [], alreadyResolved: true };
  }

  const key = String(doc._id);
  const others = await service.exclusive(async () => {
    let updates = [];

    const engineId = service.mongoIdToEngineId.get(key);
    if (engineId !== undefined) {
      const result = await engine.release(engineId);
      if (!result.ok) throw new Error(result.error);
      updates = result.updates;
      service.unlink(key);
    }

    doc.status = "resolved";
    doc.resolvedAt = new Date();
    await doc.save();

    return service.applyUpdates(updates);
  });

  service.broadcast([doc, ...others]);
  return { doc, others, alreadyResolved: false };
}

async function sendResolved(res, outcome) {
  const positions = await service.loadPositions();
  res.json({
    message: outcome.alreadyResolved ? "Already resolved" : "Resolved",
    emergency: service.toView(outcome.doc),
    dispatchedFromQueue: outcome.others.map((d) => service.toView(d, positions.get(String(d._id)) ?? null)),
  });
}

// Move an emergency on by hand. Body: { status }
//   "ON SCENE" (or in-progress): the unit has arrived. Only once units were sent.
//   "resolved":                  it is over (same as DELETE).
// Used as PATCH /api/emergencies/:id (what the frontend calls) and
// PATCH /api/emergencies/:id/status.
async function updateEmergencyStatus(req, res) {
  try {
    const status = service.normalizeStatus(req.body.status);

    if (status !== "in-progress" && status !== "resolved") {
      return res.status(400).json({ message: "status must be ON SCENE or resolved" });
    }

    if (status === "resolved") {
      const outcome = await resolveEmergency(req.params.id);
      if (!outcome) return res.status(404).json({ message: "Emergency not found" });
      return sendResolved(res, outcome);
    }

    const doc = await Emergency.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Emergency not found" });

    if (doc.status === "resolved") {
      return res.status(409).json({ message: "This emergency is already resolved" });
    }
    if (!["assigned", "partial", "in-progress"].includes(doc.status)) {
      return res.status(409).json({
        message: "Only an emergency that has had units sent can be set to ON SCENE",
      });
    }

    if (doc.status !== "in-progress") {
      doc.status = "in-progress";
      await doc.save();
      service.broadcast([doc]);
    }

    res.json({ emergency: service.toView(doc), dispatchedFromQueue: [] });
  } catch (error) {
    fail(res, error);
  }
}

// DELETE /api/emergencies/:id  "Mark resolved": the record is kept (as resolved,
// so the dispatch history stays) and no longer shows in the open list.
async function deleteEmergency(req, res) {
  try {
    const outcome = await resolveEmergency(req.params.id);
    if (!outcome) return res.status(404).json({ message: "Emergency not found" });
    await sendResolved(res, outcome);
  } catch (error) {
    fail(res, error);
  }
}

// POST /api/emergencies/reset   resolve EVERY open emergency: all units go back to their
// stations and the waiting queue is emptied. Used to start a demo from a clean state.
// The records stay (as resolved).
async function resetEmergencies(req, res) {
  try {
    const open = await Emergency.find({ status: { $ne: "resolved" } });
    let resolved = 0;

    // lowest priority first, so units freed on the way are not handed to reports that are about to close
    open.sort((a, b) => a.priorityScore - b.priorityScore);
    for (const doc of open) {
      await resolveEmergency(doc._id);
      resolved++;
    }

    res.json({ message: "All open emergencies resolved", resolved });
  } catch (error) {
    fail(res, error);
  }
}

module.exports = {
  resetEmergencies,
  createEmergency,
  getEmergencies,
  getEmergencyById,
  getPriorityQueue,
  dispatchWaiting,
  updateEmergencyStatus,
  deleteEmergency,
};
