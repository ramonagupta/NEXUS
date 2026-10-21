// geometry.js
// Drawing helpers only. The road curves come from the backend (GET /api/city/map);
// these functions just follow them to place the moving unit on the map.
// roadIndex: Map of "<from>|<to>" -> road (both directions), built from the backend's roads.

export function getPathPoints(pathNodeIds, roadIndex) {
  if (!pathNodeIds || pathNodeIds.length < 2) return [];
  const points = [];
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const a = pathNodeIds[i];
    const b = pathNodeIds[i + 1];
    const road = roadIndex.get(`${a}|${b}`);
    if (!road) continue;
    const seg = road.from === a ? road.pts : [...road.pts].reverse();
    points.push(...(points.length ? seg.slice(1) : seg));
  }
  return points;
}

// returns a function: ratio 0..1 along the route -> { x, y }
export function makePathSampler(pathNodeIds, roadIndex) {
  const pts = getPathPoints(pathNodeIds, roadIndex);
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
