// utils/trafficService.js
// Everything that happens when the city's traffic changes. The traffic itself
// (random start, one road's level, the slowdown, the colours) is decided by the
// C++ engine; this file saves it, re-routes the units that are on their way and
// shapes it for the frontend.

const Traffic = require("../models/Traffic");
const engine = require("./cppEngine");
const events = require("./events");
const emergencyService = require("./emergencyService");

// save the loads in MongoDB (one document), so every screen and every restart sees the same traffic
async function persist(loads) {
  let doc = await Traffic.findOne({});
  if (!doc) {
    await Traffic.create({ loads });
    return;
  }
  doc.loads = loads;
  if (doc.markModified) doc.markModified("loads");
  await doc.save();
}

// the traffic as the frontend reads it: one entry per road, all worked out by the engine
async function view() {
  const city = await engine.getCity();
  const roads = city.roads.map((r) => ({
    id: r.id,
    from: r.from,
    to: r.to,
    load: r.load,
    capacity: r.capacity,
    ratio: r.ratio,
    level: r.level,
    levelLabel: r.levelLabel,
    color: r.color,
    speedFactor: r.speedFactor,
  }));

  return {
    roads,
    levels: city.trafficLevels,
    maxRatio: city.maxTrafficRatio,
    overCapacity: roads.filter((r) => r.ratio > 1).length,
    jammed: roads.filter((r) => r.speedFactor > 1).length,
  };
}

// Traffic changed: save it, re-route every unit that is still on its way, tell the screens.
async function afterChange() {
  const traffic = await engine.getTraffic();
  await persist(traffic.traffic);

  const changed = await emergencyService.exclusive(async () => {
    const result = await engine.reroute();
    if (!result.ok) throw new Error(result.error);
    return emergencyService.applyReroute(result.updates);
  });

  if (events.hasClients()) {
    events.publish("traffic", await view());
    emergencyService.broadcast(changed);
  }
  return changed;
}

module.exports = { persist, view, afterChange };
