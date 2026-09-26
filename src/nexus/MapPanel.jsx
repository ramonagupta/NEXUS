import { useMemo } from 'react';
import { NODES, NODE_MAP, GRAPH_EDGES, CITY_BLOCKS, STATIONS } from './data';
import { getPositionAlongPath } from './graph';

export default function MapPanel({
  activeIncident,
  jammedEdgeIds = new Set(),
  onToggleRoad,
  onClearAll,
  onPreset,
  onRandomize,
}) {
  const activePathSvgString = useMemo(() => {
    if (!activeIncident || !activeIncident.routePath || activeIncident.routePath.length < 2) return '';
    return activeIncident.routePath
      .filter((nid) => NODE_MAP[nid])
      .map((nid, i) => `${i === 0 ? 'M' : 'L'} ${NODE_MAP[nid].x} ${NODE_MAP[nid].y}`)
      .join(' ');
  }, [activeIncident]);

  const activeUnitPosition = useMemo(() => {
    if (!activeIncident || !activeIncident.routePath || activeIncident.routePath.length === 0) return { x: 0, y: 0 };
    if (!activeIncident.totalSeconds || activeIncident.totalSeconds === 0) {
      return getPositionAlongPath(activeIncident.routePath, 1);
    }
    const ratio = Math.min(1, (activeIncident.elapsedSeconds || 0) / activeIncident.totalSeconds);
    return getPositionAlongPath(activeIncident.routePath, ratio);
  }, [activeIncident]);

  const activeJammedCount = jammedEdgeIds?.size || 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>City Response Grid</h2>
        <div className="traffic-toolbar">
          <span className="traffic-label">Traffic Controls:</span>
          <button className={`traffic-btn ${activeJammedCount === 0 ? 'active' : ''}`} onClick={onClearAll}>
            Clear Grid
          </button>
          <button className="traffic-btn" onClick={() => onPreset?.('rush_hour')}>Rush Hour</button>
          <button className="traffic-btn" onClick={() => onPreset?.('gridlock')}>Gridlock</button>
          <button className="traffic-btn highlight" onClick={onRandomize}>🔀 Randomize</button>
        </div>
      </div>

      <div className="map-legend-bar">
        <div className="legend-items-row">
          <div className="legend-item"><span className="legend-icon police" /> Police</div>
          <div className="legend-item"><span className="legend-icon fire" /> Fire</div>
          <div className="legend-item"><span className="legend-icon hospital" /> Medical Hub</div>
          <div className="legend-item"><span className="legend-icon incident" /> Active Scene</div>
          <div className="legend-item"><span className="legend-line" /> Open Road</div>
          <div className="legend-item"><span className="legend-line jammed" /> Traffic Jam (Click Road to Toggle)</div>
        </div>
        <div style={{ color: activeJammedCount > 0 ? 'var(--amber)' : 'var(--ink-dim)', fontWeight: 'bold' }}>
          {activeJammedCount} Blockage{activeJammedCount !== 1 ? 's' : ''} Active
        </div>
      </div>

      <div className="map-container">
        <svg viewBox="0 0 700 440" preserveAspectRatio="xMidYMid slice">
          <rect width="700" height="440" fill="#111318" />

          <path
            d="M 570,-10 C 585,100 560,220 580,310 C 595,380 610,410 620,450 L 710,450 L 710,-10 Z"
            fill="var(--park)" opacity="0.75"
          />
          <path
            d="M 610,-10 C 625,110 595,210 620,310 C 635,370 650,410 660,450 L 710,450 L 710,-10 Z"
            fill="var(--river)"
          />
          <path
            d="M 622,-10 C 637,110 607,210 632,310 C 647,370 662,410 672,450"
            stroke="var(--river-dark)" strokeWidth="3" fill="none" opacity="0.5"
          />

          <g opacity="0.6">
            {CITY_BLOCKS.map((b, i) => (
              <rect
                key={i} x={b.x} y={b.y} width={b.w} height={b.h}
                fill={i % 4 === 0 ? 'var(--building-dark)' : 'var(--building)'} rx="1.5"
              />
            ))}
          </g>

          <g>
            {GRAPH_EDGES.map((e) => {
              const isJammed = jammedEdgeIds?.has(e.id);
              const uNode = NODE_MAP[e.u];
              const vNode = NODE_MAP[e.v];
              if (!uNode || !vNode) return null;

              return (
                <line
                  key={e.id}
                  x1={uNode.x} y1={uNode.y}
                  x2={vNode.x} y2={vNode.y}
                  onClick={() => onToggleRoad?.(e.id)}
                  className={`road-edge ${e.isShortcut ? 'shortcut' : ''} ${isJammed ? 'jammed' : ''}`}
                >
                  <title>{`Road ${e.id.toUpperCase()} | Dist: ${(e.weight * 0.045).toFixed(1)} km`}</title>
                </line>
              );
            })}
          </g>

          {activeIncident && activePathSvgString && (
            <g>
              <path d={activePathSvgString} className="dispatch-path" />
              <g transform={`translate(${activeUnitPosition.x}, ${activeUnitPosition.y})`}>
                <circle r="9" fill="var(--red)" stroke="#FFF" strokeWidth="2" />
                <circle r="3.5" fill="#FFF" />
              </g>
            </g>
          )}

          {NODES.map((n) => {
            const isIncident = activeIncident && activeIncident.locationNode === n.id;
            const isDispatch = activeIncident && activeIncident.dispatchNode === n.id;
            const isOnSite = isIncident && isDispatch;
            let fill = STATIONS[n.stationType]?.hex || '#888';
            let r = 8.5;
            if (isIncident) { fill = 'var(--red)'; r = 11; }
            else if (isDispatch) { r = 10; }

            return (
              <g key={n.id}>
                {(isOnSite || isDispatch) && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 6}
                    fill="none"
                    stroke="var(--amber)"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                    className="rotating-ring"
                    style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                  />
                )}

                {isIncident && (
                  <circle cx={n.x} cy={n.y} r={r + 14} fill="var(--red)" opacity="0.25" />
                )}

                <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke="var(--paper)" strokeWidth="2" />
                <text
                  className={`map-label ${isIncident || isDispatch ? 'active' : ''}`}
                  x={n.x} y={n.y + (n.y < 50 ? 18 : -12)} textAnchor="middle"
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}