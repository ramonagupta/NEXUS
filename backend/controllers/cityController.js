// controllers/cityController.js
// The city map, its traffic and fastest routes all come from the C++ engine.
// (The map itself is the frontend's: see scripts/generate-city-data.mjs.)

const engine = require("../utils/cppEngine");
const cityMap = require("../utils/cityMap");

// Everything the frontend needs to DRAW the city: nodes, roads (with their curve and live
// traffic: load, level, colour), rivers, area names, station styles and the map size.
async function getCityMap(req, res) {
  try {
    const city = await engine.getCity();
    const shapes = await cityMap.load();

    res.json({
      mapSize: shapes.mapSize,
      geo: city.geo, // how x / y convert to lat / lng
      stationTypes: shapes.stationTypes, // label, colour and letter for each kind of station
      rivers: shapes.rivers,
      areas: shapes.areas,
      nodes: city.nodes, // id, name, x, y, kind (junction / station), stationType
      roads: city.roads.map((r) => ({ ...r, ...shapes.roadShapes.get(r.id) })), // + d, pts (the curve)
      trafficLevels: city.trafficLevels,
      maxTrafficRatio: city.maxTrafficRatio,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Traffic on every road: load, capacity, ratio, level and how much it slows units
async function getTraffic(req, res) {
  try {
    const city = await engine.getCity();
    res.json(
      city.roads.map((r) => ({
        id: r.id,
        from: r.from,
        to: r.to,
        load: r.load,
        capacity: r.capacity,
        ratio: r.ratio,
        level: r.level, // free / full / light / medium / heavy
        speedFactor: r.speedFactor, // 1 = free flow, higher = slower
      }))
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Fastest route between two nodes with the current traffic (the engine's Dijkstra).
// GET /api/city/fastest-route?start=h4&end=clock
async function getFastestRoute(req, res) {
  try {
    const start = engine.resolveNode(req.query.start);
    const end = engine.resolveNode(req.query.end);
    const vehicle = String(req.query.vehicle || "ambulance").trim().toLowerCase();

    if (!start || !end) {
      return res.status(400).json({ message: "start and end must be valid map nodes" });
    }
    if (!engine.VEHICLES.includes(vehicle)) {
      return res.status(400).json({
        message: "vehicle must be one of: " + engine.VEHICLES.join(", "),
      });
    }

    const result = await engine.getRoute(start, end, vehicle);

    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }
    if (!result.found) {
      return res.status(404).json({ message: "No route found" });
    }

    res.json({
      vehicle: result.vehicle,
      route: result.route,
      routeAreas: result.routeAreas,
      distanceKm: result.distanceKm,
      baseTimeSeconds: result.baseTimeSeconds,
      trafficDelaySeconds: result.trafficDelaySeconds,
      totalSeconds: result.totalSeconds,
      jammedSegmentCount: result.jammedSegmentCount,
      isOnSite: result.isOnSite,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = { getCityMap, getTraffic, getFastestRoute };
