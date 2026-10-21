import { formatDuration, liveElapsed, unitLabel } from './format';

const SERVICE_NAME = { ambulance: 'Ambulance', police: 'Police', fire: 'Fire engine' };

// Shows one report. Every value (status, ETA, route, station, queue position, units) is read
// from the backend. The only thing done here is keeping the countdown ticking between updates.
export default function TrackerPanel({ activeIncident: e, city, onResolve }) {
  if (!e) {
    return (
      <div className="panel tracker-panel flex-1">
        <div className="empty-state">No active incident selected.</div>
      </div>
    );
  }

  const nodeName = (id) => city.nodes.find((n) => n.id === id)?.name || 'N/A';
  const isWaiting = e.displayStatus === 'WAITING';
  const isUnassigned = e.displayStatus === 'UNASSIGNED';
  const hasUnit = !isWaiting && !isUnassigned;
  const isCompleted = e.displayStatus === 'ON SCENE';

  const elapsed = liveElapsed(e);
  const progress = hasUnit && e.totalSeconds > 0 ? Math.min(100, Math.round((elapsed / e.totalSeconds) * 100)) : 0;
  const unitsSent = (e.units || []).filter((u) => u.state === 'assigned');

  return (
    <div className="panel tracker-panel">
      <div className="tracker-user-head">
        <div>
          <h2 className="tracker-user-title">{e.title}</h2>
          <div className="tracker-user-sub">
            UNIT: {e.unitName || 'none sent yet'} • TYPE: {e.type.toUpperCase()} • PRIORITY SCORE: {e.priorityScore}
          </div>
        </div>
        <div>
          <span className="eta-label">{isWaiting ? 'PRIORITY QUEUE' : 'ESTIMATED ETA'}</span>
          <div className="eta-display">
            {isWaiting
              ? `#${e.queuePosition}`
              : isUnassigned
                ? 'NO UNIT'
                : isCompleted
                  ? 'ON SCENE'
                  : formatDuration(Math.max(0, e.totalSeconds - elapsed))}
          </div>
        </div>
      </div>

      {isWaiting && (
        <div className="queue-note">
          No {unitLabel(e.type, 1).replace(/^1 /, '')} is free. This report is waiting in the priority queue
          at position {e.queuePosition}; the highest score gets the next free unit.
        </div>
      )}
      {isUnassigned && (
        <div className="queue-note">No station can take this report, even when every unit is free (too many people for one hospital).</div>
      )}

      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="timeline-steps">
        <div className={`step-box ${isWaiting ? 'active' : hasUnit ? 'done' : ''}`}>1. {isWaiting ? 'WAITING' : 'DISPATCHED'}</div>
        <div className={`step-box ${e.displayStatus === 'ARRIVING' ? 'active' : isCompleted ? 'done' : ''}`}>2. EN ROUTE</div>
        <div className={`step-box ${isCompleted ? 'active done' : ''}`}>3. ON SCENE</div>
      </div>

      <div className="tracker-metrics">
        <div className="metric-box">
          <span>ROUTE DISTANCE</span>
          <strong>{hasUnit ? (e.isOnSite ? '0.0 km' : `${e.totalDistanceKm} km`) : '–'}</strong>
        </div>
        <div className="metric-box">
          <span>BASE TRAVEL TIME</span>
          <strong>{hasUnit ? formatDuration(e.baseTimeSeconds) : '–'}</strong>
        </div>
        <div className="metric-box traffic-impact">
          <span>TRAFFIC DELAY</span>
          <strong>{hasUnit ? `+${formatDuration(e.trafficDelaySeconds)}` : '–'}</strong>
        </div>
      </div>

      <div className="tracker-details">
        <div className="detail-item">
          <span>RESPONDING STATION</span>
          <strong>{hasUnit ? nodeName(e.dispatchNode) : 'Waiting for a free unit'}</strong>
        </div>
        <div className="detail-item">
          <span>DESTINATION NODE</span>
          <strong>{e.locationName || nodeName(e.locationNode)}</strong>
        </div>
        <div className="detail-item">
          <span>ADDRESS / LANDMARK</span>
          <strong>{e.address || 'N/A'}</strong>
        </div>
        <div className="detail-item">
          <span>CURRENT STATUS</span>
          <strong>{e.displayStatus}</strong>
        </div>
        <div className="detail-item">
          <span>UNITS NEEDED</span>
          <strong>{unitLabel(e.type, e.unitsNeeded ?? 1)}</strong>
        </div>
        <div className="detail-item">
          <span>PEOPLE AFFECTED</span>
          <strong>{e.peopleCount}</strong>
        </div>
        {e.dispatchedBy && (
          <div className="detail-item">
            <span>DISPATCHED BY</span>
            <strong>{e.dispatchedBy}</strong>
          </div>
        )}
        {(e.units || []).length > 0 && (
          <div className="detail-item">
            <span>UNITS</span>
            <strong>
              {e.units.map((u) => `${SERVICE_NAME[u.service]}: ${u.state === 'assigned' ? u.providerArea : u.state}`).join(' · ')}
            </strong>
          </div>
        )}
      </div>

      {onResolve && (
        <button className="btn-prim" style={{ margin: '8px 0 0', width: '100%' }} onClick={() => onResolve(e.id)}>
          {isWaiting || isUnassigned
            ? 'Cancel report'
            : `Mark resolved · release ${unitsSent.length > 1 ? `${unitsSent.length} units` : 'unit'}`}
        </button>
      )}
    </div>
  );
}
