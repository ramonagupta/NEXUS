// controllers/trafficController.js
// The shared traffic of the city. The C++ engine owns it: it generates the
// starting traffic, sets one road's level, works out each road's level, colour and
// slowdown. MongoDB keeps a copy so every screen (and every restart) sees the same.
// Whenever it changes, the units already on their way are re-routed.
//
//   GET    /api/traffic              every road: load, capacity, ratio, level, colour, slowdown
//   PUT    /api/traffic              replace the whole traffic: { "<road id>": vehicles }
//   PATCH  /api/traffic/roads/:id    set ONE road: { level } or { level: "custom", ratio: 1.2 }
//   POST   /api/traffic/randomize    new random traffic for the whole city  (optional { seed })
//   POST   /api/traffic/clear        no traffic anywhere

const engine = require("../utils/cppEngine");
const trafficService = require("../utils/trafficService");

async function respond(res, extra = {}) {
  const traffic = await trafficService.view();
  const changed = await trafficService.afterChange();
  res.json({ ...traffic, ...extra, reroutedEmergencies: changed.length });
}

async function getTraffic(req, res) {
  try {
    res.json(await trafficService.view());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function saveTraffic(req, res) {
  try {
    // the loads object itself; { traffic: {...} } / { data: {...} } also work
    let body = req.body;
    if (body && typeof body.traffic === "object") body = body.traffic;
    else if (body && typeof body.data === "object") body = body.data;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: 'Send the traffic as an object: { "<road id>": vehicles }' });
    }

    // the engine keeps only real roads with a whole number of vehicles (0 or more)
    await engine.setTraffic(body);
    await respond(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function setRoad(req, res) {
  try {
    const roadId = req.params.id;
    const level = String(req.body.level || "").trim().toLowerCase();

    if (!engine.isValidRoad(roadId)) {
      return res.status(404).json({ message: "Unknown road: " + roadId });
    }
    if (!engine.TRAFFIC_LEVELS.includes(level)) {
      return res.status(400).json({ message: "level must be one of: " + engine.TRAFFIC_LEVELS.join(", ") });
    }
    if (level === "custom" && !Number.isFinite(Number(req.body.ratio))) {
      return res.status(400).json({ message: "custom needs a ratio, e.g. 1.2 for 120% of the road's capacity" });
    }

    const result = await engine.setRoadTraffic(roadId, level, req.body.ratio);
    if (!result.ok) return res.status(engine.httpStatus(result)).json({ message: result.error });

    await respond(res, { road: result.road });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function randomizeTraffic(req, res) {
  try {
    const seed = req.body && req.body.seed !== undefined ? Number(req.body.seed) : undefined;
    await engine.randomTraffic(seed);
    await respond(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function clearTraffic(req, res) {
  try {
    await engine.setTraffic({});
    await respond(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getTraffic, saveTraffic, setRoad, randomizeTraffic, clearTraffic };
