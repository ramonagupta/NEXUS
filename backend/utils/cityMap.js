// utils/cityMap.js
// The drawing data of the map (road curves, rivers, area names, station styles).
// The map itself lives in data/cityMap.mjs, the same file the C++ engine's map
// is generated from. The frontend gets it from GET /api/city/map and only draws it.

let cached = null;

async function load() {
  if (cached) return cached;
  const m = await import("../data/cityMap.mjs");

  // road id -> how to draw it
  const roadShapes = new Map(
    m.GRAPH_EDGES.map((e) => [e.id, { d: e.d, pts: e.pts.map((p) => ({ x: p.x, y: p.y })) }])
  );

  cached = {
    mapSize: m.MAP_SIZE,
    stationTypes: m.STATIONS,
    rivers: m.RIVERS,
    areas: m.AREAS,
    roadShapes,
  };
  return cached;
}

module.exports = { load };
