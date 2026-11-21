// utils/arrivalWatcher.js
// Decides when a unit has ARRIVED. Once the time a unit needs (its ETA) has passed
// since it was sent, the emergency is marked ON SCENE and the screens are told.
// This used to be done by the browser; now the server does it, so the status is the
// same on every screen even if nobody has the page open.

const Emergency = require("../models/Emergency");
const events = require("./events");
const service = require("./emergencyService");

const CHECK_EVERY_MS = 1000;

// Have all the units that were sent arrived? A report can have several kinds of unit
// (ambulance, fire engine, police) and each can come from several stations: it is ON SCENE
// when the last of them gets there.
function hasArrived(doc, now) {
  const sent = ["ambulance", "police", "fire"]
    .map((name) => (doc.assignments ? doc.assignments[name] : null))
    .filter((a) => a && a.state === "assigned" && a.dispatchedAt);

  if (sent.length === 0) return false;

  return sent.every((a) => {
    const seconds = (now - new Date(a.dispatchedAt).getTime()) / 1000;
    const legs = a.allocations && a.allocations.length ? a.allocations : [a];
    return legs.every((leg) => seconds >= leg.totalSeconds);
  });
}

async function check() {
  const now = Date.now();
  const open = await Emergency.find({ status: { $in: ["assigned", "partial"] } });
  const arrived = [];

  for (const doc of open) {
    if (!hasArrived(doc, now)) continue;
    // re-read inside the lock: it may have been re-routed or resolved a moment ago
    await service.exclusive(async () => {
      const fresh = await Emergency.findById(doc._id);
      if (fresh && ["assigned", "partial"].includes(fresh.status) && hasArrived(fresh, Date.now())) {
        fresh.status = "in-progress";
        await fresh.save();
        arrived.push(fresh);
      }
    });
  }

  if (arrived.length && events.hasClients()) service.broadcast(arrived);
}

function start() {
  const timer = setInterval(() => {
    check().catch((error) => console.log("Arrival check failed:", error.message));
  }, CHECK_EVERY_MS);
  timer.unref();
}

module.exports = { start, check };
