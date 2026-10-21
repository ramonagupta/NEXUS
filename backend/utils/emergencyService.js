// utils/emergencyService.js
// Shared by the controllers. It does NOT decide anything about dispatching (the
// C++ engine does that). It keeps MongoDB in step with what the engine decided
// and shapes emergencies into the JSON the frontend reads.

const Emergency = require("../models/Emergency");
const engine = require("./cppEngine");
const events = require("./events");
const { buildSummary } = require("./resourceSummary");

const SERVICES = ["ambulance", "police", "fire"];
const SERVICE_LABEL = { ambulance: "Ambulance", police: "Police", fire: "Fire engine" };

// the unit the tracker follows for each type of report
const PRIMARY_SERVICE = {
  medical: "ambulance",
  accident: "ambulance",
  fire: "fire",
  police: "police",
  other: "police",
};

// ---------------------------------------------------------------------------
// One engine command at a time. A command can change several emergencies, and
// those changes must be saved in the order the engine made them.
// ---------------------------------------------------------------------------
let chain = Promise.resolve();

function exclusive(task) {
  const run = chain.then(task);
  chain = run.catch(() => {});
  return run;
}

// The engine numbers emergencies itself (0, 1, 2 ...) and starts again from 0
// after a restart, so the link to the MongoDB id is kept in memory.
const engineIdToMongoId = new Map();
const mongoIdToEngineId = new Map();

function link(engineId, mongoId) {
  engineIdToMongoId.set(engineId, mongoId);
  mongoIdToEngineId.set(mongoId, engineId);
}

function unlink(mongoId) {
  const engineId = mongoIdToEngineId.get(mongoId);
  mongoIdToEngineId.delete(mongoId);
  if (engineId !== undefined) engineIdToMongoId.delete(engineId);
}

// ---------------------------------------------------------------------------
// Status names. The frontend calls an arrived unit "ON SCENE"; the lifecycle
// keeps it as "in-progress". Both are accepted, the API shows ON SCENE.
// ---------------------------------------------------------------------------

// any spelling of a status -> the stored one, or null if it isn't a status
function normalizeStatus(value) {
  const text = String(value === undefined || value === null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (["on-scene", "in-progress", "arrived"].includes(text)) return "in-progress";
  if (["resolved", "closed", "completed", "cancelled", "canceled"].includes(text)) return "resolved";
  if (["pending", "partial", "assigned", "unassigned"].includes(text)) return text;
  return null;
}

const statusLabel = (status) => (status === "in-progress" ? "ON SCENE" : status);

// ---------------------------------------------------------------------------
// Saving what the engine decided
// ---------------------------------------------------------------------------

// overall status from the three services
function statusFromServices(services) {
  const required = SERVICES.map((n) => services[n]).filter((s) => s.unitsRequired > 0);
  const assigned = required.filter((s) => s.state === "assigned").length;
  const waiting = required.filter((s) => s.state === "waiting").length;

  if (required.length > 0 && assigned === required.length) return "assigned";
  if (assigned > 0) return "partial";
  if (waiting > 0) return "pending";
  return "unassigned";
}

// copy the engine's per-service result onto the document
function applyServices(doc, services) {
  const now = new Date();
  const assignments = {};

  for (const name of SERVICES) {
    const incoming = services[name];
    const before = doc.assignments ? doc.assignments[name] : null;
    const wasAssigned = before && before.state === "assigned";

    let dispatchedAt = null;
    if (incoming.state === "assigned") {
      dispatchedAt = wasAssigned && before.dispatchedAt ? before.dispatchedAt : now;
      if (!doc.dispatchedAt) doc.dispatchedAt = dispatchedAt;
    }

    assignments[name] = { ...incoming, dispatchedAt };
  }

  doc.assignments = assignments;

  // once someone has moved it on by hand, the automatic status stays out of the way
  if (doc.status !== "in-progress" && doc.status !== "resolved") {
    doc.status = statusFromServices(services);
  }
}

// Apply the "updates" an engine command returned (other emergencies whose units
// were assigned because something changed). Returns the changed documents.
async function applyUpdates(updates) {
  const changed = [];

  for (const update of updates || []) {
    const mongoId = engineIdToMongoId.get(update.engineId);
    if (!mongoId) continue;

    const doc = await Emergency.findById(mongoId);
    if (!doc) continue;

    applyServices(doc, update.services);
    await doc.save();
    changed.push(doc);
  }

  return changed;
}

// The traffic changed and the engine gave some units a new route. A unit keeps its
// PROGRESS: one that is 40% of the way is still 40% of the way on the new route,
// only the trip time changes. Units that already arrived are left alone.
// Returns the changed documents. Call inside exclusive().
async function applyReroute(updates) {
  const changed = [];
  const now = Date.now();

  for (const update of updates || []) {
    const mongoId = engineIdToMongoId.get(update.engineId);
    if (!mongoId) continue;

    const doc = await Emergency.findById(mongoId);
    if (!doc || doc.status === "resolved" || doc.status === "in-progress") continue;

    const assignments = {};
    let touched = false;

    for (const name of SERVICES) {
      const incoming = update.services[name];
      const before = doc.assignments ? doc.assignments[name] : null;
      const was = before && typeof before.toObject === "function" ? before.toObject() : before;

      const isSent = was && was.state === "assigned" && was.dispatchedAt;
      if (!isSent || incoming.state !== "assigned") {
        assignments[name] = was ? was : { ...incoming, dispatchedAt: null };
        continue;
      }

      const elapsed = (now - new Date(was.dispatchedAt).getTime()) / 1000;
      if (elapsed >= was.totalSeconds) {
        assignments[name] = was; // already on scene
        continue;
      }

      const progress = Math.max(0, elapsed / was.totalSeconds);
      assignments[name] = { ...incoming, dispatchedAt: new Date(now - progress * incoming.totalSeconds * 1000) };
      touched = true;
    }

    if (!touched) continue;

    doc.assignments = assignments;
    const times = SERVICES.map((n) => assignments[n] && assignments[n].dispatchedAt)
      .filter(Boolean)
      .map((t) => new Date(t).getTime());
    if (times.length) doc.dispatchedAt = new Date(Math.min(...times));

    await doc.save();
    changed.push(doc);
  }

  return changed;
}

// Give a saved emergency to the engine: it is dispatched right away if units are
// free, otherwise it waits in the priority queue. Call inside exclusive().
async function registerInEngine(doc) {
  const result = await engine.addEmergency(doc.type, doc.injuredPeople, doc.location);
  if (!result.ok) throw new Error(result.error);

  link(result.engineId, doc._id.toString());

  const e = result.state.emergency;
  doc.locationName = e.areaName;
  doc.ambulancesNeeded = e.ambulancesNeeded;
  doc.policeNeeded = e.policeNeeded;
  doc.fireTrucksNeeded = e.fireTrucksNeeded;
  doc.priorityScore = e.priorityScore;
  doc.severityLevel = e.severityLevel;
  applyServices(doc, result.state.services);
  await doc.save();

  return result.updates;
}

// At startup the engine is empty. Emergencies that were still waiting for units
// (pending, or only partly sent) go back in, oldest first, and are dispatched
// again from scratch if units are free. A record the engine can't take (for
// example one saved on an older map) is skipped.
async function syncPendingEmergencies() {
  const pending = await Emergency.find({ status: "pending" });
  const partial = await Emergency.find({ status: "partial" });
  const waiting = [...pending, ...partial].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  let requeued = 0;
  await exclusive(async () => {
    for (const doc of waiting) {
      try {
        doc.status = "pending";
        doc.assignments = {};
        doc.dispatchedAt = null;

        const updates = await registerInEngine(doc);
        await applyUpdates(updates);
        requeued++;
      } catch (error) {
        // e.g. it sits on a node the map doesn't have: it can never be dispatched
        console.log("Could not re-queue emergency " + doc._id + " (" + error.message + "), marked unassigned");
        try {
          doc.status = "unassigned";
          await doc.save();
        } catch (saveError) {
          console.log("Could not update emergency " + doc._id + ": " + saveError.message);
        }
      }
    }
  });

  console.log("Re-queued " + requeued + " waiting emergencies in the engine");
}

// ---------------------------------------------------------------------------
// What the frontend reads
// ---------------------------------------------------------------------------

// one unit (ambulance / police / fire) of an emergency
function unitView(service, a, now) {
  if (!a || a.state === "not_required") return null;

  const assigned = a.state === "assigned";
  const route = a.route || [];
  const providerArea = assigned ? (a.routeAreas || [])[0] || a.provider : null;
  const totalSeconds = assigned ? a.totalSeconds : null;
  const dispatchedAt = assigned && a.dispatchedAt ? new Date(a.dispatchedAt) : null;

  let elapsedSeconds = 0;
  if (dispatchedAt) {
    elapsedSeconds = Math.min(totalSeconds, Math.max(0, Math.floor((now - dispatchedAt.getTime()) / 1000)));
  }

  return {
    service,
    unitName: SERVICE_LABEL[service] + (assigned ? " · " + providerArea : " (waiting)"),
    state: a.state, // waiting | assigned | unavailable
    unitsRequired: a.unitsRequired,
    provider: a.provider || null, // hospital / station id, e.g. "h4"
    dispatchedBy: a.dispatchedBy || null, // "Central Medical Control" for every ambulance
    providerArea, // its name, e.g. "Sahastradhara Xing Hospital"
    dispatchNode: assigned ? route[0] : null, // where the unit starts
    routePath: route, // node ids, station first
    routeAreas: a.routeAreas || [],
    totalDistanceKm: assigned ? a.distanceKm : null,
    baseTimeSeconds: assigned ? a.baseTimeSeconds : null,
    trafficDelaySeconds: assigned ? a.trafficDelaySeconds : null,
    jammedSegmentCount: assigned ? a.jammedSegmentCount : null,
    totalSeconds,
    elapsedSeconds,
    dispatchedAt,
    isOnSite: assigned && !!a.isOnSite,
  };
}

// WAITING / DISPATCH / ARRIVING / ON SCENE: the labels the tracker shows
function displayStatus(status, primary) {
  if (status === "resolved") return "RESOLVED";
  if (status === "in-progress") return "ON SCENE";
  if (status === "unassigned") return "UNASSIGNED";
  if (status === "pending" || !primary) return "WAITING";

  if (primary.elapsedSeconds >= primary.totalSeconds) return "ON SCENE";
  if (primary.elapsedSeconds > Math.floor(primary.totalSeconds * 0.4)) return "ARRIVING";
  return "DISPATCH";
}

// An emergency in the shape the frontend reads. `position` = place in the
// waiting queue (1 = next to get a unit), or null if nothing is waiting.
function toView(doc, position = null, now = Date.now()) {
  const e = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const assignments = e.assignments || {};

  const units = SERVICES.map((name) => unitView(name, assignments[name], now)).filter(Boolean);

  // the unit the tracker follows: the main one for this type, else any that was sent
  const sent = units.filter((u) => u.state === "assigned");
  const primary = sent.find((u) => u.service === PRIMARY_SERVICE[e.type]) || sent[0] || null;

  // vehicles this report needs (the frontend shows "3 ambulances")
  const unitsNeeded = e.ambulancesNeeded || e.policeNeeded || e.fireTrucksNeeded || 1;

  return {
    id: String(e._id),
    title: e.title || "",
    description: e.description || "",
    type: e.type, // fire / police / medical / accident / other
    address: e.address || "",

    locationNode: e.location, // map node id of the locality, e.g. "clock"
    location: e.location,
    locationName: e.locationName || "",
    lat: e.lat ?? null,
    lng: e.lng ?? null,

    peopleCount: e.injuredPeople,
    injuredPeople: e.injuredPeople,
    unitsNeeded,
    severityLevel: e.severityLevel,
    priorityScore: e.priorityScore,
    ambulancesNeeded: e.ambulancesNeeded,
    policeNeeded: e.policeNeeded,
    fireTrucksNeeded: e.fireTrucksNeeded,

    status: statusLabel(e.status), // pending / partial / assigned / unassigned / ON SCENE / resolved
    displayStatus: displayStatus(e.status, primary),
    queuePosition: position,

    dispatchedAt: e.dispatchedAt || null,
    resolvedAt: e.resolvedAt || null,

    // the single-unit fields the tracker reads (null while nothing is sent)
    unitName: primary ? primary.unitName : null,
    dispatchedBy: primary ? primary.dispatchedBy : null,
    dispatchNode: primary ? primary.dispatchNode : null,
    routePath: primary ? primary.routePath : [],
    totalDistanceKm: primary ? primary.totalDistanceKm : null,
    baseTimeSeconds: primary ? primary.baseTimeSeconds : null,
    trafficDelaySeconds: primary ? primary.trafficDelaySeconds : null,
    jammedSegmentCount: primary ? primary.jammedSegmentCount : null,
    totalSeconds: primary ? primary.totalSeconds : null,
    elapsedSeconds: primary ? primary.elapsedSeconds : 0,
    isOnSite: primary ? primary.isOnSite : false,

    // every unit of this emergency
    units,

    reportedBy: e.reportedBy,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// mongo id -> place in the waiting queue
async function loadPositions() {
  const result = await engine.getQueue();
  const positions = new Map();

  for (const item of result.queue) {
    const mongoId = engineIdToMongoId.get(item.engineId);
    if (mongoId) positions.set(mongoId, item.position);
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Live updates (Server-Sent Events)
// ---------------------------------------------------------------------------
async function broadcast(docs) {
  if (!events.hasClients()) return;

  try {
    const positions = await loadPositions();

    for (const doc of docs) {
      events.publish("emergency", toView(doc, positions.get(String(doc._id)) ?? null));
    }
    events.publish(
      "queue",
      [...positions].map(([id, position]) => ({ id, position }))
    );
    events.publish("resources", await buildSummary());
  } catch (error) {
    console.log("Could not send live update:", error.message);
  }
}

module.exports = {
  PRIMARY_SERVICE,
  exclusive,
  link,
  unlink,
  engineIdToMongoId,
  mongoIdToEngineId,
  normalizeStatus,
  applyUpdates,
  applyReroute,
  registerInEngine,
  syncPendingEmergencies,
  toView,
  loadPositions,
  broadcast,
};
