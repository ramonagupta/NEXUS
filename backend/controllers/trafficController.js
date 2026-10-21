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

    let body = req.body;
    if (body && typeof body.traffic === "object") body = body.traffic;
    else if (body && typeof body.data === "object") body = body.data;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: 'Send the traffic as an object: { "<road id>": vehicles }' });
    }


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
