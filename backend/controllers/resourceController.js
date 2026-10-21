const Resource = require("../models/Resource");
const engine = require("../utils/cppEngine");
const { cleanName, parseCount } = require("../utils/validators");
const { exclusive, applyUpdates, broadcast } = require("../utils/emergencyService");
const { buildSummary } = require("../utils/resourceSummary");

const MAX = engine.MAX_FACILITY_COUNT;







async function getResources(req, res) {
  try {
    const { type, status } = req.query;

    if (type && !engine.RESOURCE_TYPES.includes(type)) {
      return res.status(400).json({ message: "type must be one of: " + engine.RESOURCE_TYPES.join(", ") });
    }
    if (status && !engine.RESOURCE_STATUSES.includes(status)) {
      return res.status(400).json({ message: "status must be one of: " + engine.RESOURCE_STATUSES.join(", ") });
    }

    const [summary, result] = await Promise.all([buildSummary(), engine.getResources()]);

    let stations = result.stations;
    if (type) stations = stations.filter((r) => r.type === type);
    if (status) stations = stations.filter((r) => r.status === status);

    res.json({
      ...summary,
      hospitals: result.hospitals.map(engine.withNodeId),
      stations: stations.map(engine.withNodeId),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


async function getSummary(req, res) {
  try {
    res.json(await buildSummary());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getResourceByName(req, res) {
  try {
    const result = await engine.getResources();
    const resource = result.stations.find((r) => r.name === req.params.name);
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    res.json(engine.withNodeId(resource));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


async function createResource(req, res) {
  try {
    const name = cleanName(req.body.name);
    const type = String(req.body.type || "").trim().toLowerCase();
    const location = engine.resolveNode(req.body.location ?? req.body.locationNode);
    const capacity = parseCount(req.body.capacity, MAX);
    const status = req.body.status === undefined ? "available" : req.body.status;

    if (!name) {
      return res.status(400).json({ message: "name is required (max 60 characters)" });
    }
    if (!engine.RESOURCE_TYPES.includes(type)) {
      return res.status(400).json({ message: "type must be one of: " + engine.RESOURCE_TYPES.join(", ") });
    }
    if (!location) {
      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });
    }
    if (capacity === null) {
      return res.status(400).json({ message: "capacity must be a whole number from 0 to " + MAX });
    }
    if (status !== "available" && status !== "unavailable") {
      return res.status(400).json({
        message: "status can be set to 'available' or 'unavailable' ('busy' is automatic when all units are out)",
      });
    }
    const outOfService = status === "unavailable";

    const outcome = await exclusive(async () => {
      const result = await engine.stationAdd(type, name, location, capacity, outOfService);
      if (!result.ok) return { result };

      try {
        await Resource.create({ name, type, location, capacity, outOfService });
      } catch (dbError) {
        await engine.stationDelete(name);
        throw dbError;
      }

      return { result, changed: await applyUpdates(result.updates) };
    });

    if (!outcome.result.ok) {
      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);
    res.status(201).json(engine.withNodeId(outcome.result.resource));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}


async function updateResource(req, res) {
  try {
    const existing = await Resource.findOne({ name: req.params.name });
    if (!existing) return res.status(404).json({ message: "Resource not found" });

    if (req.body.name !== undefined && req.body.name !== existing.name) {
      return res.status(400).json({ message: "A resource's name can't be changed" });
    }
    if (req.body.type !== undefined && req.body.type !== existing.type) {
      return res.status(400).json({ message: "A resource's type can't be changed" });
    }

    const newLocation = req.body.location ?? req.body.locationNode;
    const location = newLocation !== undefined ? engine.resolveNode(newLocation) : existing.location;
    const capacity =
      req.body.capacity !== undefined ? parseCount(req.body.capacity, MAX) : existing.capacity;

    let outOfService = existing.outOfService;
    if (req.body.status !== undefined) {
      if (req.body.status !== "available" && req.body.status !== "unavailable") {
        return res.status(400).json({
          message: "status can be set to 'available' or 'unavailable' ('busy' is automatic when all units are out)",
        });
      }
      outOfService = req.body.status === "unavailable";
    }

    if (!location) {
      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });
    }
    if (capacity === null) {
      return res.status(400).json({ message: "capacity must be a whole number from 0 to " + MAX });
    }

    const previous = {
      location: existing.location,
      capacity: existing.capacity,
      outOfService: existing.outOfService,
    };

    const outcome = await exclusive(async () => {
      const result = await engine.stationUpdate(existing.name, location, capacity, outOfService);
      if (!result.ok) return { result };

      try {
        existing.location = location;
        existing.capacity = capacity;
        existing.outOfService = outOfService;
        await existing.save();
      } catch (dbError) {
        await engine.stationUpdate(
          existing.name, previous.location, previous.capacity, previous.outOfService
        );
        throw dbError;
      }

      return { result, changed: await applyUpdates(result.updates) };
    });

    if (!outcome.result.ok) {
      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);
    res.json(engine.withNodeId(outcome.result.resource));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function deleteResource(req, res) {
  try {
    const result = await exclusive(async () => {
      const outcome = await engine.stationDelete(req.params.name);
      if (!outcome.ok) return outcome;


      await Resource.deleteOne({ name: req.params.name });
      return outcome;
    });

    if (!result.ok) {
      return res.status(engine.httpStatus(result)).json({ message: result.error });
    }

    broadcast([]);
    res.json({ message: "Resource deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getResources,
  getSummary,
  getResourceByName,
  createResource,
  updateResource,
  deleteResource,
};
