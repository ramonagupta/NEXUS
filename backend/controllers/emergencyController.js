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


    const lat = finite(body.lat) ? body.lat : engine.latLngOf(location).lat;
    const lng = finite(body.lng) ? body.lng : engine.latLngOf(location).lng;


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



async function deleteEmergency(req, res) {
  try {
    const outcome = await resolveEmergency(req.params.id);
    if (!outcome) return res.status(404).json({ message: "Emergency not found" });
    await sendResolved(res, outcome);
  } catch (error) {
    fail(res, error);
  }
}




async function resetEmergencies(req, res) {
  try {
    const open = await Emergency.find({ status: { $ne: "resolved" } });
    let resolved = 0;


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
