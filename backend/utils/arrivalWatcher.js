// utils/arrivalWatcher.js
// Decides when a unit has ARRIVED. Once the time a unit needs (its ETA) has passed
// since it was sent, the emergency is marked ON SCENE and the screens are told.
// This used to be done by the browser; now the server does it, so the status is the
// same on every screen even if nobody has the page open.

const Emergency = require("../models/Emergency");
const events = require("./events");
const service = require("./emergencyService");

const CHECK_EVERY_MS = 1000;

// has the unit the tracker follows (the main one for this type of report) arrived?
function hasArrived(doc, now) {
  const sent = ["ambulance", "police", "fire"]
    .map((name) => ({ name, a: doc.assignments ? doc.assignments[name] : null }))
    .filter((x) => x.a && x.a.state === "assigned" && x.a.dispatchedAt);

  if (sent.length === 0) return false;

  const main = sent.find((x) => x.name === service.PRIMARY_SERVICE[doc.type]) || sent[0];
  return (now - new Date(main.a.dispatchedAt).getTime()) / 1000 >= main.a.totalSeconds;
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
