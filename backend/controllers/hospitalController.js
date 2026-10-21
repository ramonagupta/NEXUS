// controllers/hospitalController.js
// CRUD for hospitals (total beds, ambulances, location).
// The C++ engine owns the live hospital (availability, dispatch); each change
// is applied there first, then saved to MongoDB so it survives a restart.
// New or bigger capacity can let waiting emergencies go straight away, and
// those are saved too.

const Hospital = require("../models/Hospital");
const engine = require("../utils/cppEngine");
const { cleanName, parseCount } = require("../utils/validators");
const { exclusive, applyUpdates, broadcast } = require("../utils/emergencyService");

const MAX = engine.MAX_FACILITY_COUNT;

// List hospitals with live availability
async function getHospitals(req, res) {
  try {
    const result = await engine.getResources();
    res.json(result.hospitals.map(engine.withNodeId));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getHospitalByName(req, res) {
  try {
    const result = await engine.getResources();
    const hospital = result.hospitals.find((h) => h.name === req.params.name);
    if (!hospital) return res.status(404).json({ message: "Hospital not found" });
    res.json(engine.withNodeId(hospital));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function createHospital(req, res) {
  try {
    const name = cleanName(req.body.name);
    const location = engine.resolveNode(req.body.location ?? req.body.locationNode);
    const totalBeds = parseCount(req.body.totalBeds, MAX);
    const totalAmbulances = parseCount(req.body.totalAmbulances, MAX);

    if (!name) {
      return res.status(400).json({ message: "name is required (max 60 characters)" });
    }
    if (!location) {
      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });
    }
    if (totalBeds === null || totalAmbulances === null) {
      return res.status(400).json({
        message: "totalBeds and totalAmbulances must be whole numbers from 0 to " + MAX,
      });
    }

    const outcome = await exclusive(async () => {
      const result = await engine.hospitalAdd(name, location, totalBeds, totalAmbulances);
      if (!result.ok) return { result };

      try {
        await Hospital.create({ name, location, totalBeds, totalAmbulances });
      } catch (dbError) {
        await engine.hospitalDelete(name); // undo, so engine and database agree
        throw dbError;
      }

      return { result, changed: await applyUpdates(result.updates) };
    });

    if (!outcome.result.ok) {
      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);
    res.status(201).json(engine.withNodeId(outcome.result.hospital));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Any of location / totalBeds / totalAmbulances can be sent. The name is the id.
async function updateHospital(req, res) {
  try {
    const existing = await Hospital.findOne({ name: req.params.name });
    if (!existing) return res.status(404).json({ message: "Hospital not found" });

    if (req.body.name !== undefined && req.body.name !== existing.name) {
      return res.status(400).json({ message: "A hospital's name can't be changed" });
    }

    const newLocation = req.body.location ?? req.body.locationNode;
    const location = newLocation !== undefined ? engine.resolveNode(newLocation) : existing.location;
    const totalBeds =
      req.body.totalBeds !== undefined ? parseCount(req.body.totalBeds, MAX) : existing.totalBeds;
    const totalAmbulances =
      req.body.totalAmbulances !== undefined
        ? parseCount(req.body.totalAmbulances, MAX)
        : existing.totalAmbulances;

    if (!location) {
      return res.status(400).json({ message: "location must be a valid city node (see GET /api/city/map)" });
    }
    if (totalBeds === null || totalAmbulances === null) {
      return res.status(400).json({
        message: "totalBeds and totalAmbulances must be whole numbers from 0 to " + MAX,
      });
    }

    const previous = {
      location: existing.location,
      totalBeds: existing.totalBeds,
      totalAmbulances: existing.totalAmbulances,
    };

    const outcome = await exclusive(async () => {
      const result = await engine.hospitalUpdate(existing.name, location, totalBeds, totalAmbulances);
      if (!result.ok) return { result };

      try {
        existing.location = location;
        existing.totalBeds = totalBeds;
        existing.totalAmbulances = totalAmbulances;
        await existing.save();
      } catch (dbError) {
        await engine.hospitalUpdate(
          existing.name, previous.location, previous.totalBeds, previous.totalAmbulances
        );
        throw dbError;
      }

      return { result, changed: await applyUpdates(result.updates) };
    });

    if (!outcome.result.ok) {
      return res.status(engine.httpStatus(outcome.result)).json({ message: outcome.result.error });
    }

    broadcast(outcome.changed);
    res.json(engine.withNodeId(outcome.result.hospital));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function deleteHospital(req, res) {
  try {
    const result = await exclusive(async () => {
      const outcome = await engine.hospitalDelete(req.params.name);
      if (!outcome.ok) return outcome;

      // if this fails the hospital comes back on the next restart (MongoDB still has it)
      await Hospital.deleteOne({ name: req.params.name });
      return outcome;
    });

    if (!result.ok) {
      return res.status(engine.httpStatus(result)).json({ message: result.error });
    }

    broadcast([]);
    res.json({ message: "Hospital deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  getHospitals,
  getHospitalByName,
  createHospital,
  updateHospital,
  deleteHospital,
};
