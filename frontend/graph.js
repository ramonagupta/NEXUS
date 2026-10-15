import { NODES, NODE_MAP, GRAPH_EDGES, BASE_UNIT_SPEED, SIM_SPEEDUP, TYPE_BASE_SEVERITY, latLngToXY } from './data';
import { trafficSpeedFactor } from './traffic';

const ON_SITE_SECONDS = Math.max(5, Math.round(180 / SIM_SPEEDUP));    // 3 minutes when the station is already at the scene
const MIN_TRAVEL_SECONDS = Math.max(5, Math.round(60 / SIM_SPEEDUP));  // shortest ETA shown for any trip (1 minute)

export function formatDuration(totalSec) {
  if (totalSec === 0) return '0m 00s';
  if (!totalSec || totalSec < 0) return '0m 00s';
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// priority = injured * 5 + medical * 3 + fire * 2 + police * 2
// medical / fire / police are 1 when the report is of that type, otherwise 0.
export function calculateBackendPriority(type, severityLevel, peopleCount) {
  const injured = Math.max(0, Number(peopleCount) || 0);
  const medical = type === 'medical' || type === 'accident' ? 1 : 0;
  const fire = type === 'fire' ? 1 : 0;
  const police = type === 'police' || type === 'accident' ? 1 : 0;
  return injured * 5 + medical * 3 + fire * 2 + police * 2;
}
// 1 ambulance per 3 people at the scene 
export const PEOPLE_PER_AMBULANCE = 3;

export function unitsNeededFor(type, peopleCount) {
  const people = Math.max(1, Number(peopleCount) || 1);
  return type === 'medical' || type === 'accident' ? Math.ceil(people / PEOPLE_PER_AMBULANCE) : 1;
}

export function unitLabel(type, n = 1) {
  const base = type === 'fire' ? 'fire engine' : type === 'medical' || type === 'accident' ? 'ambulance' : 'police unit';
  return `${n} ${base}${n === 1 ? '' : 's'}`;
}

const ADJ = {};
const EDGE_BY_PAIR = new Map();
GRAPH_EDGES.forEach((e) => {
  (ADJ[e.u] ??= []).push(e);
  (ADJ[e.v] ??= []).push(e);
  EDGE_BY_PAIR.set(`${e.u}|${e.v}`, e);
  EDGE_BY_PAIR.set(`${e.v}|${e.u}`, e);
});

// traffic = { [edgeId]: vehiclesOnRoad } - see traffic.js
export function computeShortestPath(startNodeId, targetNodeId, traffic = {}) {
  const isOnSite = startNodeId === targetNodeId;
  const timeToReach = {};
  const previous = {};
  const unvisited = new Set();

  NODES.forEach((n) => {
    timeToReach[n.id] = Infinity;
    previous[n.id] = null;
    unvisited.add(n.id);
  });

  timeToReach[startNodeId] = 0;

  while (unvisited.size > 0) {
    let current = null;
    let minTime = Infinity;

    for (const id of unvisited) {
      if (timeToReach[id] < minTime) {
        minTime = timeToReach[id];
        current = id;
      }
    }

    if (current === null || current === targetNodeId) break;
    unvisited.delete(current);

    for (const edge of ADJ[current] || []) {
      const neighbor = edge.u === current ? edge.v : edge.u;
      if (unvisited.has(neighbor)) {
        const segmentTime = (edge.weight / BASE_UNIT_SPEED) * trafficSpeedFactor(edge, traffic);
        const altTime = timeToReach[current] + segmentTime;
        if (altTime < timeToReach[neighbor]) {
          timeToReach[neighbor] = altTime;
          previous[neighbor] = current;
        }
      }
    }
  }

  const path = [];
  let curr = targetNodeId;
  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }

  let totalDistanceUnits = 0;
  let normalTimeSec = 0;
  let actualTimeSec = 0;
  let jammedSegmentCount = 0; 

  for (let i = 0; i < path.length - 1; i++) {
    const edge = EDGE_BY_PAIR.get(`${path[i]}|${path[i + 1]}`);
    if (edge) {
      const factor = trafficSpeedFactor(edge, traffic);
      totalDistanceUnits += edge.weight;
      const segBaseTime = edge.weight / BASE_UNIT_SPEED;
      normalTimeSec += segBaseTime;
      actualTimeSec += segBaseTime * factor;
      if (factor > 1) jammedSegmentCount++;
    }
  }

  const distanceKm = (totalDistanceUnits * 0.045).toFixed(1);

  return {
    path,
    totalDistanceKm: distanceKm,
    totalDistanceUnits,
    baseTimeSeconds: Math.round(normalTimeSec),
    rawSeconds: isOnSite ? 0 : actualTimeSec, // only used to compare stations (no minimum clamp)
    totalSeconds: isOnSite ? ON_SITE_SECONDS : Math.max(MIN_TRAVEL_SECONDS, Math.round(actualTimeSec)),
    trafficDelaySeconds: Math.round(Math.max(0, actualTimeSec - normalTimeSec)),
    jammedSegmentCount,
    hops: Math.max(0, path.length - 1),
    isOnSite,
  };
}

// Full polyline (following the curved roads) for a list of node ids
export function getPathPoints(pathNodeIds) {
  if (!pathNodeIds || pathNodeIds.length === 0) return [];
  if (pathNodeIds.length === 1) {
    const only = NODE_MAP[pathNodeIds[0]];
    return only ? [{ x: only.x, y: only.y }] : [];
  }
  const points = [];
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const a = pathNodeIds[i];
    const b = pathNodeIds[i + 1];
    const edge = GRAPH_EDGES.find((e) => (e.u === a && e.v === b) || (e.u === b && e.v === a));
    if (!edge) continue;
    const seg = edge.u === a ? edge.pts : [...edge.pts].reverse();
    points.push(...(points.length ? seg.slice(1) : seg));
  }
  return points;
}

export function makePathSampler(pathNodeIds) {
  const pts = getPathPoints(pathNodeIds);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1] || 0;
  return (ratio) => {
    if (pts.length === 0) return { x: 0, y: 0 };
    if (pts.length === 1 || total === 0) return { x: pts[0].x, y: pts[0].y };
    const target = total * Math.min(1, Math.max(0, ratio));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const seg = cum[i] - cum[i - 1];
    const r = seg === 0 ? 0 : (target - cum[i - 1]) / seg;
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r };
  };
}

export function getPositionAlongPath(pathNodeIds, progressRatio) {
  const pts = getPathPoints(pathNodeIds);
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y };

  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(d);
    total += d;
  }

  const target = total * Math.min(1, Math.max(0, progressRatio));
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    if (acc + lens[i] >= target) {
      const r = lens[i] === 0 ? 0 : (target - acc) / lens[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * r,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * r,
      };
    }
    acc += lens[i];
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}

export function calculateOptimalDispatch(emergencyNodeId, type, traffic) {
  let reqType = 'fire';
  if (type === 'medical' || type === 'accident') reqType = 'hospital';
  if (type === 'other' || type === 'police') reqType = 'police';

  const candidateStations = NODES.filter((n) => n.stationType === reqType);
  let bestStation = candidateStations[0] || NODES[0];
  let bestRoute = computeShortestPath(bestStation.id, emergencyNodeId, traffic);

  for (let i = 1; i < candidateStations.length; i++) {
    const route = computeShortestPath(candidateStations[i].id, emergencyNodeId, traffic);
    if (route.rawSeconds < bestRoute.rawSeconds) {
      bestRoute = route;
      bestStation = candidateStations[i];
    }
  }

  return { dispatchNodeId: bestStation.id, route: bestRoute };
}

export function deriveSeverity(type, peopleCount) {
  const base = TYPE_BASE_SEVERITY[type] ?? 1;
  return peopleCount >= 10 ? 3 : base;
}

const GENERIC_WORDS = new Set([
  'station', 'hospital', 'thana', 'road', 'nagar', 'fire', 'chowk', 'super', 'speciality',
  'institute', 'central', 'hosp', 'town', 'colony', 'pul', 'crossing', 'diversion', 'grant',
]);

const NODE_KEYWORDS = NODES.map((n) => ({
  id: n.id,
  words: n.name.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w)),
}));

// Snap a backend lat/lng to the closest node on the map
export function nearestNodeFromLatLng(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const { x, y } = latLngToXY(lat, lng);
  let best = null;
  let bestDist = Infinity;
  for (const n of NODES) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < bestDist) { bestDist = d; best = n.id; }
  }
  return best;
}

function extractLatLng(raw) {
  const c = raw.coordinates ?? raw.coords ?? raw.geo;
  const lat = raw.lat ?? raw.latitude ?? c?.lat ?? c?.latitude ?? raw.location?.lat ?? raw.location?.latitude;
  const lng = raw.lng ?? raw.lon ?? raw.longitude ?? c?.lng ?? c?.lon ?? c?.longitude ?? raw.location?.lng ?? raw.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
  // GeoJSON: { coordinates: [lng, lat] }
  const arr = Array.isArray(c) ? c : raw.location?.coordinates;
  if (Array.isArray(arr) && arr.length >= 2) return [Number(arr[1]), Number(arr[0])];
  return [null, null];
}

export function nodeForAddress(address) {
  if (!address || typeof address !== 'string') return NODES[0].id;
  const text = ` ${address.toLowerCase().replace(/[^a-z ]/g, ' ')} `;

  // match locality names
  let best = null;
  let bestScore = 0;
  for (const k of NODE_KEYWORDS) {
    const score = k.words.filter((w) => text.includes(` ${w} `) || text.includes(` ${w}`)).length;
    if (score > bestScore) { bestScore = score; best = k.id; }
  }
  if (best) return best;

  // otherwise a stable hash so the same address always lands on the same node
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return NODES[hash % NODES.length].id;
}

// Order: valid node id from backend -> lat/lng -> address text -> hash
export function resolveLocationNode(raw) {
  if (raw.locationNode && NODE_MAP[raw.locationNode]) return raw.locationNode;
  const [lat, lng] = extractLatLng(raw);
  const byGeo = nearestNodeFromLatLng(lat, lng);
  if (byGeo) return byGeo;
  return nodeForAddress(raw.address || (typeof raw.location === 'string' ? raw.location : ''));
}

function stableUnitNumber(id) {
  const str = String(id);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 8) + 1;
}

// backend-shape helpers 
export function normalizeType(value) {
  const t = String(value ?? '').toLowerCase();
  if (t === 'fire' || t === 'accident' || t === 'medical' || t === 'police') return t;
  if (t.includes('fire')) return 'fire';
  if (/accid|collision|crash/.test(t)) return 'accident';
  if (/medic|ambul|health/.test(t)) return 'medical';
  if (/polic|crime|theft|robber/.test(t)) return 'police';
  return 'other';
}

export function normalizeStatus(value) {
  const s = String(value ?? '').toUpperCase().replace(/[_-]+/g, ' ').trim();
  if (/RESOLV|COMPLET|CLOSED|CANCEL/.test(s)) return 'RESOLVED';
  if (/ON SCENE|ARRIVED/.test(s)) return 'ON SCENE';
  return null;
}

function toTime(v) {
  if (v === undefined || v === null || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function statusFor(elapsed, total) {
  if (elapsed >= total) return 'ON SCENE';
  if (elapsed > Math.floor(total * 0.4)) return 'ARRIVING';
  return 'DISPATCH';
}

export function hydrateEmergency(raw, traffic = {}) {
  const locationNode = resolveLocationNode(raw);
  const type = normalizeType(raw.type ?? raw.emergencyType ?? raw.category);
  const peopleCount = Math.max(1, Number(raw.peopleCount ?? raw.people ?? raw.peopleAffected ?? 1) || 1);
  const severityLevel = raw.severityLevel ?? deriveSeverity(type, peopleCount);
  const priorityScore = calculateBackendPriority(type, severityLevel, peopleCount);

  const { dispatchNodeId, route } = calculateOptimalDispatch(locationNode, type, traffic);
  const isOnSite = dispatchNodeId === locationNode;
  const totalSeconds = route.totalSeconds;

  const now = Date.now();
  const dispatchedAt = Math.min(now, toTime(raw.dispatchedAt ?? raw.createdAt ?? raw.created_at ?? raw.timestamp) ?? now);
  const serverStatus = normalizeStatus(raw.status);
  let elapsedSeconds = Math.max(0, Math.floor((now - dispatchedAt) / 1000));
  if (serverStatus === 'ON SCENE') elapsedSeconds = Math.max(elapsedSeconds, totalSeconds);
  const status = serverStatus === 'ON SCENE' ? 'ON SCENE' : statusFor(elapsedSeconds, totalSeconds);
  const id = raw.id ?? raw._id ?? `local-${now}`;

  return {
    id,
    title: raw.title ?? raw.name ?? raw.description ?? 'Untitled emergency',
    type,
    locationNode,
    address: raw.address ?? (typeof raw.location === 'string' ? raw.location : ''),
    peopleCount,
    severityLevel,
    priorityScore,
    unitsNeeded: unitsNeededFor(type, peopleCount),
    dispatchNode: dispatchNodeId,
    routePath: route?.path || [],
    totalDistanceKm: route.totalDistanceKm,
    totalDistanceUnits: route.totalDistanceUnits,
    baseTimeSeconds: route.baseTimeSeconds,
    trafficDelaySeconds: route.trafficDelaySeconds,
    jammedSegmentCount: route.jammedSegmentCount,
    totalSeconds,
    dispatchedAt,
    elapsedSeconds,
    status,
    resolved: serverStatus === 'RESOLVED',
    unitName: raw.unitName ?? `${type.toUpperCase()} Unit-0${stableUnitNumber(id)}`,
    savedToBackend: raw.savedToBackend ?? true,
    isOnSite,
  };
}

export function rerouteEmergency(e, traffic) {
  const { dispatchNodeId, route } = calculateOptimalDispatch(e.locationNode, e.type, traffic);
  // keep the same % progress so the bar and the unit don't jump back when traffic changes
  const exactElapsed = Math.max(0, (Date.now() - e.dispatchedAt) / 1000);
  const progress = e.totalSeconds > 0 ? Math.min(1, exactElapsed / e.totalSeconds) : 0;
  const newElapsed = progress * route.totalSeconds;
  const elapsedSeconds = Math.floor(newElapsed);
  return {
    ...e,
    dispatchNode: dispatchNodeId,
    routePath: route.path || [],
    totalDistanceKm: route.totalDistanceKm,
    totalDistanceUnits: route.totalDistanceUnits,
    baseTimeSeconds: route.baseTimeSeconds,
    trafficDelaySeconds: route.trafficDelaySeconds,
    jammedSegmentCount: route.jammedSegmentCount,
    totalSeconds: route.totalSeconds,
    elapsedSeconds,
    dispatchedAt: Date.now() - newElapsed * 1000,
    isOnSite: dispatchNodeId === e.locationNode,
  };
}