// utils/cppEngine.js
//
// Bridge between the Node backend and the C++ engine (engine/nexus_engine.cpp).
// This file contains NO algorithm logic. It only starts the C++ program,
// sends it one command per line, and reads back one JSON line per command.
// The queue, Dijkstra, traffic and station availability all live in C++.

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

// the report types the frontend sends. "accident" is handled as medical and
// "other" as police (the engine knows all five).
const EMERGENCY_TYPES = ["fire", "police", "medical", "accident", "other"];
const VEHICLES = ["ambulance", "police", "fire"];
const RESOURCE_TYPES = ["police", "fire"];
const TRAFFIC_LEVELS = ["free", "full", "light", "medium", "heavy", "custom"];
const RESOURCE_STATUSES = ["available", "busy", "unavailable"];
const MAX_PEOPLE = 100000; // keep in sync with MAX_PEOPLE in nexus_engine.cpp
const MAX_FACILITY_COUNT = 1000; // keep in sync with MAX_FACILITY_COUNT in nexus_engine.cpp

const DEFAULT_BINARY = path.join(
  __dirname,
  "..",
  "engine",
  process.platform === "win32" ? "nexus_engine.exe" : "nexus_engine"
);

let child = null;
let stopping = false;
let startPromise = null;
let waiting = []; // FIFO: replies come back in the same order commands were sent
let nodes = new Map(); // node id -> { id, name, x, y, kind, stationType }  (the frontend's map)
let roadIds = new Set(); // road ids, "<from>-<to>"
let geo = null; // how map x / y convert to lat / lng

function failAllWaiting(error) {
  waiting.forEach((w) => w.reject(error));
  waiting = [];
}

function start() {
  if (startPromise) return startPromise;

  startPromise = new Promise((resolve, reject) => {
    const binary = process.env.ENGINE_PATH || DEFAULT_BINARY;

    if (!fs.existsSync(binary)) {
      return reject(
        new Error(
          "C++ engine not found at " + binary + ". Run: npm run build:engine"
        )
      );
    }

    child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] });

    let ready = false;
    const lines = readline.createInterface({ input: child.stdout });

    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (err) {
        console.error("Engine sent invalid JSON:", line);
        return;
      }

      if (!ready) {
        ready = true;
        return resolve();
      }

      const waiter = waiting.shift();
      if (waiter) waiter.resolve(message);
    });

    child.on("error", (err) => {
      failAllWaiting(err);
      reject(err);
    });

    child.on("exit", (code) => {
      const err = new Error("C++ engine exited (code " + code + ")");
      failAllWaiting(err);
      if (!ready) return reject(err);

      // The engine keeps the live state (queue, traffic, availability), so
      // if it dies we stop the server instead of silently running without it.
      if (stopping) return;
      console.error(err.message + ". Stopping server, restart it.");
      process.exit(1);
    });

    process.on("exit", () => {
      if (child) child.kill();
    });
  }).then(async () => {
    // cache the map so inputs can be validated before they are sent
    const city = await send("CITY");
    nodes = new Map(city.nodes.map((n) => [n.id, n]));
    roadIds = new Set(city.roads.map((r) => r.id));
    geo = city.geo;
  });

  return startPromise;
}

function send(command) {
  return new Promise((resolve, reject) => {
    if (!child) return reject(new Error("Engine not started"));
    waiting.push({ resolve, reject });
    child.stdin.write(command + "\n");
  });
}

// shut the engine down (used by the tests)
function stop() {
  stopping = true;
  if (child) child.stdin.write("QUIT\n");
}

function isValidNode(id) {
  return nodes.has(id);
}

// Accepts a node id ("clock", "h4"), in any letter case. Returns the id, or null.
function resolveNode(value) {
  const id = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  return nodes.has(id) ? id : null;
}

function isValidRoad(id) {
  return roadIds.has(id);
}

// latitude / longitude of a node, converted the same way the frontend does
function latLngOf(nodeId) {
  const node = nodes.get(nodeId);
  if (!node || !geo) return { lat: null, lng: null };
  return {
    lat: geo.refLat - (node.y - geo.refY) * geo.latPerPx,
    lng: geo.refLng + (node.x - geo.refX) * geo.lngPerPx,
  };
}

// the node's display name, e.g. "clock" -> "Clock Tower"
function nodeName(id) {
  const node = nodes.get(id);
  return node ? node.name : null;
}

// adds locationNode next to location on a hospital / resource (the same node id)
function withNodeId(item) {
  return { ...item, locationNode: item.location };
}

// HTTP status for a failed engine reply
function httpStatus(result) {
  if (result.code === "NOT_FOUND") return 404;
  if (result.code === "CONFLICT") return 409;
  return 400;
}

// names can contain spaces, so they are percent-encoded for the command line
function enc(name) {
  return encodeURIComponent(name);
}

// ---- one small function per engine command ----

function addEmergency(type, injuredPeople, location) {
  return send("ADD " + type + " " + injuredPeople + " " + location);
}

function getQueue() {
  return send("QUEUE");
}

// run the waiting queue again (this already happens on every change)
function dispatch() {
  return send("DISPATCH");
}

// the emergency is over: free its units and give them to whoever is waiting
function release(engineId) {
  return send("RELEASE " + engineId);
}

function getRoute(start, end, vehicle) {
  return send("ROUTE " + start + " " + end + " " + vehicle);
}

function getCity() {
  return send("CITY");
}

function getResources() {
  return send("RESOURCES");
}

// ---- traffic ----

// { "<road id>": vehicles on the road }
function getTraffic() {
  return send("TRAFFIC");
}

// Replaces the whole traffic. Only known roads with a whole-number load of 0 or
// more are sent, anything else is dropped. Returns the roads that were kept.
async function setTraffic(traffic) {
  const clean = {};
  for (const [id, value] of Object.entries(traffic || {})) {
    const load = Math.round(Number(value));
    if (roadIds.has(id) && Number.isFinite(load) && load >= 0 && load < 1e9) clean[id] = load;
  }

  const command = "TRAFFIC_SET " + Object.entries(clean).map(([id, load]) => id + "=" + load).join(" ");
  const result = await send(command.trim());
  if (!result.ok) throw new Error(result.error);
  return clean;
}

// The city's starting traffic, generated by the engine (a seed makes it repeatable)
async function randomTraffic(seed) {
  const result = await send("TRAFFIC_RANDOM" + (Number.isFinite(seed) ? " " + Math.trunc(seed) : ""));
  if (!result.ok) throw new Error(result.error);
  return result.traffic;
}

// Set ONE road: level = free | full | light | medium | heavy | custom (custom takes a ratio,
// 1.2 = 120% of the road's capacity). The engine works out the vehicle count.
function setRoadTraffic(roadId, level, ratio) {
  return send("TRAFFIC_ROAD " + roadId + " " + level + (level === "custom" ? " " + Number(ratio) : ""));
}

// Traffic changed: every unit on its way takes the fastest route under the new traffic.
function reroute() {
  return send("REROUTE");
}

// ---- Central Medical Control ----

function getControlUnit() {
  return send("CONTROL");
}

function setControlUnit(name, location, online) {
  return send("CONTROL_SET " + enc(name) + " " + location + " " + (online ? 1 : 0));
}

// ---- hospitals ----

function hospitalAdd(name, location, beds, ambulances) {
  return send("HOSPITAL_ADD " + enc(name) + " " + location + " " + beds + " " + ambulances);
}

function hospitalUpdate(name, location, beds, ambulances) {
  return send("HOSPITAL_UPDATE " + enc(name) + " " + location + " " + beds + " " + ambulances);
}

function hospitalDelete(name) {
  return send("HOSPITAL_DELETE " + enc(name));
}

// ---- stations (resources) ----

function stationAdd(type, name, location, capacity, outOfService) {
  return send(
    "STATION_ADD " + type + " " + enc(name) + " " + location + " " + capacity + " " + (outOfService ? 1 : 0)
  );
}

function stationUpdate(name, location, capacity, outOfService) {
  return send(
    "STATION_UPDATE " + enc(name) + " " + location + " " + capacity + " " + (outOfService ? 1 : 0)
  );
}

function stationDelete(name) {
  return send("STATION_DELETE " + enc(name));
}

function clearFacilities() {
  return send("FACILITIES_CLEAR");
}

module.exports = {
  EMERGENCY_TYPES,
  VEHICLES,
  RESOURCE_TYPES,
  TRAFFIC_LEVELS,
  RESOURCE_STATUSES,
  MAX_PEOPLE,
  MAX_FACILITY_COUNT,
  start,
  stop,
  isValidNode,
  resolveNode,
  isValidRoad,
  latLngOf,
  nodeName,
  withNodeId,
  httpStatus,
  addEmergency,
  getQueue,
  dispatch,
  release,
  getRoute,
  getCity,
  getTraffic,
  setTraffic,
  randomTraffic,
  setRoadTraffic,
  reroute,
  getResources,
  getControlUnit,
  setControlUnit,
  hospitalAdd,
  hospitalUpdate,
  hospitalDelete,
  stationAdd,
  stationUpdate,
  stationDelete,
  clearFacilities,
};
