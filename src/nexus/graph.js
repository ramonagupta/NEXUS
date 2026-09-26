import { NODES, NODE_MAP, GRAPH_EDGES, BASE_UNIT_SPEED, TRAFFIC_JAM_FACTOR, TYPE_BASE_SEVERITY, TYPE_PRIORITY_WEIGHT } from './data';

export function formatDuration(totalSec) {
  if (totalSec === 0) return '0m 00s';
  if (!totalSec || totalSec < 0) return '0m 00s';
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function calculateBackendPriority(type, severityLevel, peopleCount) {
  const weight = TYPE_PRIORITY_WEIGHT[type] ?? 1;
  return weight * 10 + severityLevel * 5 + Math.min(peopleCount || 1, 20);
}

export function computeShortestPath(startNodeId, targetNodeId, jammedEdgeIds = new Set()) {
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

    const currentEdges = GRAPH_EDGES.filter((e) => e.u === current || e.v === current);
    for (const edge of currentEdges) {
      const neighbor = edge.u === current ? edge.v : edge.u;
      if (unvisited.has(neighbor)) {
        const isJammed = jammedEdgeIds.has(edge.id);
        const segmentTime = (edge.weight / BASE_UNIT_SPEED) * (isJammed ? TRAFFIC_JAM_FACTOR : 1.0);
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
    const u = path[i];
    const v = path[i + 1];
    const edge = GRAPH_EDGES.find((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u));
    if (edge) {
      const isJammed = jammedEdgeIds.has(edge.id);
      totalDistanceUnits += edge.weight;
      const segBaseTime = edge.weight / BASE_UNIT_SPEED;
      normalTimeSec += segBaseTime;
      if (isJammed) {
        actualTimeSec += segBaseTime * TRAFFIC_JAM_FACTOR;
        jammedSegmentCount++;
      } else {
        actualTimeSec += segBaseTime;
      }
    }
  }

  const distanceKm = (totalDistanceUnits * 0.045).toFixed(1);

  return {
    path,
    totalDistanceKm: distanceKm,
    totalDistanceUnits,
    baseTimeSeconds: Math.round(normalTimeSec),
    totalSeconds: isOnSite ? 300 : Math.max(180, Math.round(actualTimeSec)),
    trafficDelaySeconds: Math.round(Math.max(0, actualTimeSec - normalTimeSec)),
    jammedSegmentCount,
    hops: Math.max(0, path.length - 1),
    isOnSite,
  };
}

export function getPositionAlongPath(pathNodeIds, progressRatio) {
  if (!pathNodeIds || pathNodeIds.length === 0) return { x: 0, y: 0 };
  if (pathNodeIds.length === 1) {
    const only = NODE_MAP[pathNodeIds[0]];
    return only ? { x: only.x, y: only.y } : { x: 0, y: 0 };
  }

  const segments = [];
  let totalDist = 0;
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const p1 = NODE_MAP[pathNodeIds[i]];
    const p2 = NODE_MAP[pathNodeIds[i + 1]];
    if (p1 && p2) {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      segments.push({ p1, p2, dist });
      totalDist += dist;
    }
  }

  const targetDist = totalDist * Math.min(1, Math.max(0, progressRatio));
  let accumulated = 0;

  for (const seg of segments) {
    if (accumulated + seg.dist >= targetDist) {
      const segRatio = seg.dist === 0 ? 0 : (targetDist - accumulated) / seg.dist;
      return {
        x: seg.p1.x + (seg.p2.x - seg.p1.x) * segRatio,
        y: seg.p1.y + (seg.p2.y - seg.p1.y) * segRatio,
      };
    }
    accumulated += seg.dist;
  }

  const last = NODE_MAP[pathNodeIds[pathNodeIds.length - 1]];
  return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };
}

export function calculateOptimalDispatch(emergencyNodeId, type, jammedEdgeIds) {
  let reqType = 'fire';
  if (type === 'medical' || type === 'accident') reqType = 'hospital';
  if (type === 'other') reqType = 'police';

  const candidateStations = NODES.filter((n) => n.stationType === reqType);
  let bestStation = candidateStations[0] || NODES[0];
  let bestRoute = computeShortestPath(bestStation.id, emergencyNodeId, jammedEdgeIds);

  for (let i = 1; i < candidateStations.length; i++) {
    const route = computeShortestPath(candidateStations[i].id, emergencyNodeId, jammedEdgeIds);
    if (route.totalSeconds < bestRoute.totalSeconds) {
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

export function nodeForAddress(address) {
  if (!address) return NODES[0].id;
  let hash = 0;
  for (let i = 0; i < address.length; i++) hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  return NODES[hash % NODES.length].id;
}

export function hydrateEmergency(raw, jammedEdgeIds = new Set()) {
  const locationNode = raw.locationNode || nodeForAddress(raw.address || raw.location);
  const type = raw.type || 'other';
  const peopleCount = raw.peopleCount ?? raw.people ?? 1;
  const severityLevel = raw.severityLevel ?? deriveSeverity(type, peopleCount);
  const priorityScore = raw.priorityScore ?? calculateBackendPriority(type, severityLevel, peopleCount);
  const { dispatchNodeId, route } = calculateOptimalDispatch(locationNode, type, jammedEdgeIds);
  const isOnSite = dispatchNodeId === locationNode;

  return {
    id: raw.id ?? raw._id ?? `local-${Date.now()}`,
    title: raw.title ?? raw.name ?? 'Untitled emergency',
    type,
    locationNode,
    address: raw.address ?? raw.location ?? '',
    peopleCount,
    severityLevel,
    priorityScore,
    dispatchNode: dispatchNodeId,
    routePath: route.path,
    totalDistanceKm: route.totalDistanceKm,
    totalDistanceUnits: route.totalDistanceUnits,
    baseTimeSeconds: route.baseTimeSeconds,
    trafficDelaySeconds: route.trafficDelaySeconds,
    jammedSegmentCount: route.jammedSegmentCount,
    totalSeconds: isOnSite ? 300 : (raw.totalSeconds ?? route.totalSeconds),
    elapsedSeconds: raw.elapsedSeconds ?? 0,
    status: raw.status ?? 'DISPATCH',
    unitName: raw.unitName ?? `${type.toUpperCase()} Unit-0${Math.floor(Math.random() * 8) + 1}`,
    savedToBackend: raw.savedToBackend ?? true,
    isOnSite,
  };
}

export function rerouteEmergency(e, jammedEdgeIds) {
  const { dispatchNodeId, route } = calculateOptimalDispatch(e.locationNode, e.type, jammedEdgeIds);
  const isOnSite = dispatchNodeId === e.locationNode;
  return {
    ...e,
    dispatchNode: dispatchNodeId,
    routePath: route.path,
    totalDistanceKm: route.totalDistanceKm,
    totalDistanceUnits: route.totalDistanceUnits,
    baseTimeSeconds: route.baseTimeSeconds,
    trafficDelaySeconds: route.trafficDelaySeconds,
    jammedSegmentCount: route.jammedSegmentCount,
    totalSeconds: isOnSite ? 300 : route.totalSeconds,
    isOnSite,
  };
}