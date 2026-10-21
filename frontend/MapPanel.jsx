import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { makePathSampler, getPathPoints } from './geometry';
import { liveElapsed } from './format';

// The map (nodes, roads and their curves, rivers, area names, station styles) and the traffic
// (every road's load, level and colour) are all sent by the backend. This file only draws them.

const BG = '#0b0f17';
const ROUTE = '#38bdf8';
const POPOVER = { w: 244, h: 190 };

const LABEL = {
  junction: { size: 9, weight: 500, r: 6 },
  station: { size: 9.5, weight: 700, r: 13 },
};
const GAP = 3;

function computeLabelLayout(NODES, GRAPH_EDGES, MAP_SIZE) {
  const spec = (n) => (n.kind === 'station' ? LABEL.station : LABEL.junction);
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const roadPts = GRAPH_EDGES.flatMap((e) => e.pts.map((p) => ({ x: p.x, y: p.y, w: e.major ? 2 : 1 })));
  const dots = NODES.map((n) => {
    const r = spec(n).r;
    return { id: n.id, box: [n.x - r, n.y - r, n.x + r, n.y + r] };
  });
  const placed = [];
  const out = {};
  const order = [...NODES].sort((a, b) => (a.kind === 'station' ? 0 : 1) - (b.kind === 'station' ? 0 : 1));

  for (const n of order) {
    const sp = spec(n);
    const w = n.name.length * sp.size * (sp.weight >= 700 ? 0.6 : 0.55);
    const h = sp.size * 1.15;
    const d = sp.r + GAP;
    const dd = sp.r * 0.7 + GAP;
    const { x, y } = n;
    const cands = [
      { anchor: 'start',  dx: d,   dy: 0,            box: [x + d, y - h / 2, x + d + w, y + h / 2] },
      { anchor: 'end',    dx: -d,  dy: 0,            box: [x - d - w, y - h / 2, x - d, y + h / 2] },
      { anchor: 'middle', dx: 0,   dy: -(d + h / 2), box: [x - w / 2, y - d - h, x + w / 2, y - d] },
      { anchor: 'middle', dx: 0,   dy: d + h / 2,    box: [x - w / 2, y + d, x + w / 2, y + d + h] },
      { anchor: 'start',  dx: dd,  dy: -(dd + h / 2), box: [x + dd, y - dd - h, x + dd + w, y - dd] },
      { anchor: 'end',    dx: -dd, dy: -(dd + h / 2), box: [x - dd - w, y - dd - h, x - dd, y - dd] },
      { anchor: 'start',  dx: dd,  dy: dd + h / 2,   box: [x + dd, y + dd, x + dd + w, y + dd + h] },
      { anchor: 'end',    dx: -dd, dy: dd + h / 2,   box: [x - dd - w, y + dd, x - dd, y + dd + h] },
    ];

    let best = cands[0];
    let bestScore = Infinity;
    cands.forEach((c, i) => {
      const b = c.box;
      let score = i * 0.5; // slight preference for the order above
      score += placed.filter((p) => hit(b, p)).length * 1000;
      score += dots.filter((o) => o.id !== n.id && hit(b, o.box)).length * 600;
      if (b[0] < 0 || b[1] < 0 || b[2] > MAP_SIZE.width || b[3] > MAP_SIZE.height) score += 800;
      for (const p of roadPts) {
        if (p.x > b[0] && p.x < b[2] && p.y > b[1] && p.y < b[3]) score += p.w;
      }
      if (score < bestScore) { bestScore = score; best = c; }
    });

    placed.push(best.box);
    out[n.id] = { anchor: best.anchor, dx: best.dx, dy: best.dy };
  }
  return out;
}

function fitBox(points, MAP_SIZE) {
  const FULL_VIEW = { x: 0, y: 0, w: MAP_SIZE.width, h: MAP_SIZE.height };
  const ASPECT = MAP_SIZE.width / MAP_SIZE.height;
  if (!points || points.length === 0) return FULL_VIEW;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  const pad = 70;
  let w = Math.max(maxX - minX + pad * 2, 280);
  let h = Math.max(maxY - minY + pad * 2, 280 / ASPECT);
  if (w / h > ASPECT) h = w / ASPECT; else w = h * ASPECT;
  if (w >= MAP_SIZE.width) return FULL_VIEW;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), MAP_SIZE.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), MAP_SIZE.height - h);
  return { x, y, w, h };
}

function UnitMarker({ incident, roadIndex }) {
  const gRef = useRef(null);
  const incidentRef = useRef(incident);
  incidentRef.current = incident;
  const sample = useMemo(() => makePathSampler(incident.routePath, roadIndex), [incident.routePath, roadIndex]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const inc = incidentRef.current;
      // how far along the route the unit is: the backend's elapsed time, kept ticking between updates
      const ratio = inc.status === 'ON SCENE' || !inc.totalSeconds
        ? 1
        : Math.min(1, liveElapsed(inc) / inc.totalSeconds);
      const { x, y } = sample(ratio);
      gRef.current?.setAttribute('transform', `translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sample]);

  return (
    <g ref={gRef}>
      <circle r="11" fill={ROUTE} opacity="0.3" />
      <circle r="8" fill={ROUTE} stroke="#fff" strokeWidth="2.5" />
      <circle r="3" fill="#fff" />
    </g>
  );
}

function VehicleSlider({ load, capacity, maxRatio, onCommit }) {
  const max = Math.round(capacity * maxRatio);
  const [val, setVal] = useState(load);
  useEffect(() => setVal(load), [load]);
  const commit = (e) => onCommit(Number(e.currentTarget.value) / capacity);
  return (
    <div className="rp-slider">
      <input
        type="range" min="0" max={max} step="1" value={Math.min(val, max)}
        onChange={(e) => setVal(Number(e.target.value))}
        onPointerUp={commit} onKeyUp={commit}
        aria-label="Vehicles on this road"
      />
      <span>{val}</span>
    </div>
  );
}

export default function MapPanel({ city, traffic, activeIncident, onSetRoadTraffic, onRandomizeTraffic, onClearTraffic }) {
  const { nodes: NODES, roads: GRAPH_EDGES, mapSize: MAP_SIZE, rivers: RIVERS, areas: AREAS, stationTypes: STATIONS } = city;
  const FULL_VIEW = useMemo(() => ({ x: 0, y: 0, w: MAP_SIZE.width, h: MAP_SIZE.height }), [MAP_SIZE]);
  const LABELS = useMemo(() => computeLabelLayout(NODES, GRAPH_EDGES, MAP_SIZE), [NODES, GRAPH_EDGES, MAP_SIZE]);
  const nodeById = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), [NODES]);
  const roadIndex = useMemo(() => new Map(GRAPH_EDGES.map((e) => [`${e.from}|${e.to}`, e]).concat(GRAPH_EDGES.map((e) => [`${e.to}|${e.from}`, e]))), [GRAPH_EDGES]);
  const trafficById = useMemo(() => Object.fromEntries(traffic.roads.map((r) => [r.id, r])), [traffic]);
  const MAX_RATIO = traffic.maxRatio;

  //zoom
  const [view, setView] = useState(FULL_VIEW);
  const viewRef = useRef(FULL_VIEW);
  const rafRef = useRef(0);
  const incidentRef = useRef(activeIncident);
  incidentRef.current = activeIncident;

  const animateTo = useCallback((target, duration = 1000) => {
    cancelAnimationFrame(rafRef.current);
    const from = { ...viewRef.current };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
      const v = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      };
      viewRef.current = v;
      setView(v);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const fitRoute = useCallback(() => {
    const inc = incidentRef.current;
    const pts = inc?.routePath?.length ? getPathPoints(inc.routePath, roadIndex) : [];
    animateTo(pts.length ? fitBox(pts, MAP_SIZE) : FULL_VIEW);
  }, [animateTo, roadIndex, MAP_SIZE, FULL_VIEW]);

  // zoom to the route whenever a different incident is selected, and again when traffic forces
  const incidentId = activeIncident?.id ?? null;
  const routeKey = activeIncident?.routePath?.join('>') ?? '';
  useEffect(() => {
    fitRoute();
  }, [incidentId, routeKey, fitRoute]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const k = view.w / MAP_SIZE.width; // keeps labels a constant on-screen size while zoomed

  //road hover card
  const wrapRef = useRef(null);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const [hover, setHover] = useState(null); // { edgeId, x, y, pinned }

  const placeCard = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left + 14, 8), Math.max(8, rect.width - POPOVER.w - 8));
    const y = Math.min(Math.max(clientY - rect.top + 14, 8), Math.max(8, rect.height - POPOVER.h - 8));
    return { x, y };
  };

  const onRoadEnter = (e, edgeId) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    const { clientX, clientY } = e;
    openTimer.current = setTimeout(() => {
      setHover((prev) => {
        if (prev?.pinned) return prev;
        if (prev?.edgeId === edgeId) return prev;
        return { edgeId, ...placeCard(clientX, clientY), pinned: false };
      });
    }, 130);
  };

  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHover((h) => (h?.pinned ? h : null)), 350);
  };

  const onRoadClick = (e, edgeId) => {
    e.stopPropagation();
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setHover({ edgeId, ...placeCard(e.clientX, e.clientY), pinned: true });
  };

  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && setHover(null);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, []);

  const hoveredEdge = hover ? GRAPH_EDGES.find((e) => e.id === hover.edgeId) : null;

  const activePathD = useMemo(() => {
    if (!activeIncident?.routePath || activeIncident.routePath.length < 2) return '';
    return getPathPoints(activeIncident.routePath, roadIndex)
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
  }, [activeIncident?.routePath, roadIndex]);

  const junctions = NODES.filter((n) => n.kind === 'junction');
  const stations = NODES.filter((n) => n.kind === 'station');
  const count = (t) => stations.filter((s) => s.stationType === t).length;
  const overCapacity = traffic.overCapacity;
  const halo = { paintOrder: 'stroke', stroke: BG, strokeWidth: 2.5 * k, strokeLinejoin: 'round', pointerEvents: 'none' };

  // what the hover card shows about the road: all of it worked out by the backend
  const card = hoveredEdge && trafficById[hoveredEdge.id]
    ? { load: trafficById[hoveredEdge.id].load, ratio: trafficById[hoveredEdge.id].ratio, level: trafficById[hoveredEdge.id].level, label: trafficById[hoveredEdge.id].levelLabel, color: trafficById[hoveredEdge.id].color }
    : null;

  return (
    <section className="panel">
      <div className="panel-head" style={{ justifyContent: 'flex-end' }}>
        <div className="traffic-toolbar">
          <button className="traffic-btn" onClick={fitRoute} disabled={!activeIncident} title="Zoom to the dispatched route">
            Fit Route
          </button>
          <button className="traffic-btn" onClick={() => animateTo(FULL_VIEW)} title="Show the whole city">
            Full Map
          </button>
          <button className="traffic-btn" onClick={onRandomizeTraffic} title="The backend generates new random traffic for every road">
            Random Traffic
          </button>
          <button className="traffic-btn" onClick={onClearTraffic} title="Remove all traffic">
            Clear Traffic
          </button>
        </div>
      </div>

      <div className="map-legend-bar">
        <div className="legend-items-row">
          <div className="legend-item"><span className="legend-icon police" /> Police ({count('police')})</div>
          <div className="legend-item"><span className="legend-icon fire" /> Fire ({count('fire')})</div>
          <div className="legend-item"><span className="legend-icon hospital" /> Hospital ({count('hospital')})</div>
          <div className="legend-item"><span className="legend-icon incident" /> Active Scene</div>
          <span className="legend-sep" />
          <div className="legend-item"><span className="legend-line full" /> At Capacity</div>
          <div className="legend-item" style={{ opacity: 0.75 }}>Over:</div>
          <div className="legend-item"><span className="legend-line light" /> Light</div>
          <div className="legend-item"><span className="legend-line medium" /> Medium</div>
          <div className="legend-item"><span className="legend-line heavy" /> Heavy</div>
        </div>
        <div style={{ color: overCapacity > 0 ? 'var(--amber)' : 'var(--ink-dim)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          {overCapacity} Road{overCapacity !== 1 ? 's' : ''} Over Capacity
        </div>
      </div>

      <div className="map-container">
        <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
          <svg
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', display: 'block' }}
            onClick={() => setHover(null)}
          >
            <defs>
              <clipPath id="mapClip">
                <rect width={MAP_SIZE.width} height={MAP_SIZE.height} />
              </clipPath>
              <linearGradient id="mapBg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0f1623" />
                <stop offset="1" stopColor="#0a0e16" />
              </linearGradient>
              <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="url(#mapBg)" />

            {/* rivers */}
            <g clipPath="url(#mapClip)">
              {RIVERS.map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke="#0f2340" strokeWidth="17" strokeLinecap="round" />
                  <path d={d} fill="none" stroke="#16305a" strokeWidth="9" strokeLinecap="round" />
                </g>
              ))}
            </g>

            {/* sector names */}
            <g>
              {AREAS.map((a) => (
                <text
                  key={a.name} x={a.x} y={a.y} textAnchor="middle"
                  fontSize="13" fontWeight="700" letterSpacing="3" fill="#53638a" opacity="0.28"
                  style={{ pointerEvents: 'none' }}
                >
                  {a.name}
                </text>
              ))}
            </g>

            {/* roads, coloured by how full they are */}
            <g>
              {GRAPH_EDGES.map((e) => {
                const t = trafficById[e.id] || { level: 'free', color: null, ratio: 0 };
                const level = t.level;
                const color = t.color;
                const margin = Math.max(0, t.ratio - 1);
                const baseWidth = e.major ? 7 : e.shortcut ? 1.2 : 3.2;
                const baseColor = e.major ? '#6f8bc4' : e.shortcut ? '#2f3b57' : '#4a5e86';
                const width = baseWidth + (level === 'free' ? 0 : level === 'full' ? 0.6 : 0.8 + Math.min(margin, 0.6) * 1.5);
                const isHovered = hover?.edgeId === e.id;
                return (
                  <g key={e.id}>
                    <path d={e.d} fill="none" stroke={BG} strokeWidth={width + 2.6} strokeLinecap="round" />
                    {isHovered && (
                      <path d={e.d} fill="none" stroke="#e2e8f0" strokeWidth={width + 5} strokeLinecap="round" opacity="0.22" />
                    )}
                    <path
                      d={e.d} fill="none" strokeLinecap="round"
                      stroke={color ?? baseColor}
                      strokeWidth={width}
                    />
                    <path
                      d={e.d} fill="none" stroke="transparent" strokeWidth="14"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(ev) => onRoadEnter(ev, e.id)}
                      onMouseLeave={scheduleClose}
                      onClick={(ev) => onRoadClick(ev, e.id)}
                    />
                  </g>
                );
              })}
            </g>

            {/* dispatch route + moving unit */}
            {activeIncident && activePathD && (
              <g style={{ pointerEvents: 'none' }}>
                <path d={activePathD} fill="none" stroke={ROUTE} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" filter="url(#routeGlow)" />
                <path d={activePathD} fill="none" stroke={ROUTE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}

            {/* junctions */}
            {junctions.map((n) => {
              const isIncident = activeIncident?.locationNode === n.id;
              const L = LABELS[n.id];
              const s = Math.max(k, 0.5) * (isIncident ? 1.35 : 1);
              return (
                <g key={n.id} style={{ pointerEvents: 'none' }}>
                  {isIncident ? (
                    <>
                      <circle cx={n.x} cy={n.y} r="22" fill="#e11d48" opacity="0.22" />
                      <circle cx={n.x} cy={n.y} r="10" fill="#e11d48" stroke="#fff" strokeWidth="2.5" />
                    </>
                  ) : (
                    <circle cx={n.x} cy={n.y} r="4" fill={BG} stroke="#6f86b8" strokeWidth="2" />
                  )}
                  <text
                    x={n.x + L.dx * s} y={n.y + L.dy * s} textAnchor={L.anchor} dominantBaseline="central"
                    fontSize={(isIncident ? 11 : 9) * k} fontWeight={isIncident ? 700 : 500}
                    fill={isIncident ? '#fb7185' : '#8193bb'} style={halo}
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}

            {/* emergency stations */}
            {stations.map((n) => {
              const isIncident = activeIncident?.locationNode === n.id;
              const isDispatch = activeIncident?.dispatchNode === n.id;
              const meta = STATIONS[n.stationType] || { hex: '#46637F', glyph: '?' };
              const r = isDispatch ? 13 : 11;
              const L = LABELS[n.id];
              const s = Math.max(k, 0.5);
              return (
                <g key={n.id} style={{ pointerEvents: 'none' }}>
                  {isDispatch && (
                    <circle
                      cx={n.x} cy={n.y} r={r + 4} fill="none" stroke="#f59e0b" strokeWidth="2.5"
                    />
                  )}
                  {isIncident && <circle cx={n.x} cy={n.y} r={r + 14} fill="#e11d48" opacity="0.25" />}
                  <circle cx={n.x} cy={n.y} r={r} fill={isIncident ? '#e11d48' : meta.hex} stroke="#e2e8f0" strokeWidth="2" />
                  <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">
                    {meta.glyph}
                  </text>
                  <text
                    x={n.x + L.dx * s} y={n.y + L.dy * s} textAnchor={L.anchor} dominantBaseline="central" fontSize={9.5 * k} fontWeight="700"
                    fill={isIncident || isDispatch ? '#f1f5f9' : '#b6c2dc'} style={halo}
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}

            {/* dispatched unit-drawn last so it sits on top of the station it leaves from */}
            {activeIncident && activeIncident.routePath?.length > 0 && (
              <g style={{ pointerEvents: 'none' }}>
                <UnitMarker incident={activeIncident} roadIndex={roadIndex} />
              </g>
            )}

            <rect width={MAP_SIZE.width} height={MAP_SIZE.height} fill="none" stroke="#1e293b" strokeWidth="2" style={{ pointerEvents: 'none' }} />
          </svg>

          {/* hover card: add traffic to this road */}
          {hoveredEdge && card && (
            <div
              className="road-popover"
              style={{ left: hover.x, top: hover.y, borderLeftColor: card.color ?? 'var(--steel)' }}
              onMouseEnter={() => { clearTimeout(closeTimer.current); clearTimeout(openTimer.current); }}
              onMouseLeave={scheduleClose}
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="rp-head">
                <div>
                  <div className="rp-title">{nodeById[hoveredEdge.from].name} ↔ {nodeById[hoveredEdge.to].name}</div>
                  <div className="rp-sub">{hoveredEdge.major ? 'Major arterial' : hoveredEdge.shortcut ? 'Shortcut lane' : 'Regular road'}</div>
                </div>
                <button className="rp-close" onClick={() => setHover(null)} aria-label="Close">✕</button>
              </div>

              <div className="rp-meter">
                <div
                  className="rp-meter-fill"
                  style={{ width: `${Math.min(card.ratio / MAX_RATIO, 1) * 100}%`, background: card.color ?? 'var(--teal)' }}
                />
                <div className="rp-meter-cap" title="Capacity" />
              </div>
              <div className="rp-status" style={{ color: card.color ?? 'var(--teal)' }}>
                {card.load} / {hoveredEdge.capacity} vehicles · {card.label}
              </div>

              <div className="rp-btns">
                {traffic.levels.map((l) => l.key).map((lvl) => (
                  <button
                    key={lvl}
                    className={`rp-btn ${lvl} ${card.level === lvl ? 'active' : ''}`}
                    onClick={() => onSetRoadTraffic?.(hoveredEdge.id, lvl)}
                  >
                    {lvl === 'free' ? 'Clear' : lvl}
                  </button>
                ))}
              </div>

              <div className="rp-label">Vehicles on road</div>
              <VehicleSlider
                load={card.load}
                capacity={hoveredEdge.capacity}
                maxRatio={MAX_RATIO}
                onCommit={(r) => onSetRoadTraffic?.(hoveredEdge.id, 'custom', r)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}