// Traffic model: every road has a capacity (vehicles). Load vs capacity decides the colour
// and how much slower units travel on that road.
//   < 90%        free flow  (normal road)
//   90 - 100%    at capacity  -> grey
//   over 100%    over capacity -> light orange, then orange, then red as the margin grows
//                  light  = up to +15%,  medium = +15..35%,  heavy = +35% and beyond
// Pure client-side state, so it behaves the same with or without a backend.
import { GRAPH_EDGES } from './data';

export const TRAFFIC_LEVELS = {
  free:   { label: 'Free flow',   color: null,      factor: 1,   ratio: 0.15 },
  full:   { label: 'At capacity', color: '#9AA3B2', factor: 1.8, ratio: 1.0 },
  light:  { label: 'Light',       color: '#F6C27A', ratio: 1.1 },
  medium: { label: 'Medium',      color: '#EE8A2A', ratio: 1.25 },
  heavy:  { label: 'Heavy',       color: '#E0363C', ratio: 1.5 },
};

export const MAX_RATIO = 1.6; // the hover-card slider goes up to 160% of capacity

export const getLoad = (edgeId, traffic) => traffic?.[edgeId] ?? 0;

export function getRatio(edge, traffic) {
  return getLoad(edge.id, traffic) / (edge.capacity || 1);
}

// how far over capacity (0 when at or under)
export function overMargin(edge, traffic) {
  return Math.max(0, getRatio(edge, traffic) - 1);
}

export function getLevel(edge, traffic) {
  const r = getRatio(edge, traffic);
  if (r > 1.35) return 'heavy';
  if (r > 1.15) return 'medium';
  if (r > 1) return 'light';
  if (r >= 0.9) return 'full';
  return 'free';
}

// colour stops once a road is over capacity: light orange -> orange -> red
const OVER_STOPS = [
  [0.0, [246, 194, 122]],
  [0.2, [238, 138, 42]],
  [0.45, [224, 54, 60]],
  [0.7, [168, 18, 42]],
];

function overColor(margin) {
  if (margin <= OVER_STOPS[0][0]) return `rgb(${OVER_STOPS[0][1].join(',')})`;
  for (let i = 1; i < OVER_STOPS.length; i++) {
    const [m1, c1] = OVER_STOPS[i];
    const [m0, c0] = OVER_STOPS[i - 1];
    if (margin <= m1) {
      const t = (margin - m0) / (m1 - m0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * t)).join(',')})`;
    }
  }
  return `rgb(${OVER_STOPS[OVER_STOPS.length - 1][1].join(',')})`;
}

// Colour for a road, or null for free flow
export function getTrafficColor(edge, traffic) {
  const level = getLevel(edge, traffic);
  if (level === 'free') return null;
  if (level === 'full') return TRAFFIC_LEVELS.full.color;
  return overColor(overMargin(edge, traffic));
}

// travel-time multiplier used by the router.
// Once a road is over capacity the slowdown grows with the margin, so light / medium / heavy
// feel clearly different. [margin over capacity, slowdown multiplier]; linear in between.
const SLOW_STOPS = [
  [0,    2],   // just over capacity
  [0.15, 3],   // end of "light"
  [0.35, 5],   // end of "medium"
  [0.6,  8],   // heavy, at the slider maximum
];

export function trafficSpeedFactor(edge, traffic) {
  const level = getLevel(edge, traffic);
  if (level === 'free') return 1;
  if (level === 'full') return TRAFFIC_LEVELS.full.factor;

  const m = Math.min(overMargin(edge, traffic), SLOW_STOPS[SLOW_STOPS.length - 1][0]);
  for (let i = 1; i < SLOW_STOPS.length; i++) {
    const [m1, f1] = SLOW_STOPS[i];
    const [m0, f0] = SLOW_STOPS[i - 1];
    if (m <= m1) return f0 + ((m - m0) / (m1 - m0)) * (f1 - f0);
  }
  return SLOW_STOPS[SLOW_STOPS.length - 1][1];
}

export function generateRandomTraffic(edges = GRAPH_EDGES) {
  const next = {};
  for (const e of edges) {
    const roll = Math.random();
    let ratio;
    if (roll < 0.72) ratio = 0.1 + Math.random() * 0.75;        // free
    else if (roll < 0.82) ratio = 0.9 + Math.random() * 0.1;    // at capacity
    else if (roll < 0.9) ratio = 1.02 + Math.random() * 0.13;   // light
    else if (roll < 0.96) ratio = 1.16 + Math.random() * 0.18;  // medium
    else ratio = 1.36 + Math.random() * 0.24;                   // heavy
    if (e.isMajor && ratio < 1) ratio += Math.random() * 0.15;
    next[e.id] = Math.round(ratio * e.capacity);
  }
  return next;
}

export function setRoadTrafficLevel(traffic, edge, level, ratio) {
  const r = typeof ratio === 'number' ? ratio : (TRAFFIC_LEVELS[level] ?? TRAFFIC_LEVELS.free).ratio;
  return { ...traffic, [edge.id]: Math.max(0, Math.round(r * edge.capacity)) };
}