import React from 'react';

export const NodeGraphView = ({
  nodeMap = {},
  edges = [],
  activeRoute = [],
  selectedNode = null,
  onSelectNode = () => {}
}) => {
  const viewBoxWidth = 800;
  const viewBoxHeight = 500;

  const isEdgeActive = (u, v) => {
    if (!activeRoute || activeRoute.length < 2) return false;
    for (let i = 0; i < activeRoute.length - 1; i++) {
      if (
        (activeRoute[i] === u && activeRoute[i + 1] === v) ||
        (activeRoute[i] === v && activeRoute[i + 1] === u)
      ) {
        return true;
      }
    }
    return false;
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#090d16', borderRadius: '12px', padding: '1rem', border: '1px solid #1e293b' }}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Connection Edges */}
        <g className="edges">
          {edges.map(([u, v], idx) => {
            const source = nodeMap[u];
            const target = nodeMap[v];
            if (!source || !target) return null;

            const active = isEdgeActive(u, v);

            return (
              <line
                key={`edge-${idx}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={active ? '#38bdf8' : '#334155'}
                strokeWidth={active ? 3 : 1.5}
                strokeDasharray={active ? '6 4' : 'none'}
                filter={active ? 'url(#glow)' : undefined}
                style={{ transition: 'stroke 0.3s ease, stroke-width 0.3s ease' }}
              />
            );
          })}
        </g>

        {/* Graph Nodes */}
        <g className="nodes">
          {Object.entries(nodeMap).map(([id, coords]) => {
            const isSelected = selectedNode === id;
            const isInRoute = activeRoute.includes(id);

            return (
              <g
                key={id}
                transform={`translate(${coords.x}, ${coords.y})`}
                onClick={() => onSelectNode(id)}
                style={{ cursor: 'pointer' }}
              >
                {(isSelected || isInRoute) && (
                  <circle
                    r={18}
                    fill="none"
                    stroke={isSelected ? '#f43f5e' : '#38bdf8'}
                    strokeWidth={2}
                    opacity={0.6}
                  />
                )}

                <circle
                  r={10}
                  fill={isSelected ? '#f43f5e' : isInRoute ? '#38bdf8' : '#1e293b'}
                  stroke={isSelected ? '#fda4af' : isInRoute ? '#7dd3fc' : '#64748b'}
                  strokeWidth={2}
                />

                <text
                  y={26}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="monospace"
                >
                  {id}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};