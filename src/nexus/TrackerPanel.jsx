import { NODE_MAP } from './data';
import { formatDuration } from './graph';

export default function TrackerPanel({ activeIncident }) {
  if (!activeIncident) {
    return (
      <div className="panel tracker-panel flex-1">
        <div className="empty-state">No active incident selected.</div>
      </div>
    );
  }

  const progress = activeIncident.totalSeconds > 0
    ? Math.min(100, Math.round((activeIncident.elapsedSeconds / activeIncident.totalSeconds) * 100))
    : 100;

  const isCompleted = activeIncident.status === 'ON SCENE' || activeIncident.elapsedSeconds >= activeIncident.totalSeconds;

  return (
    <div className="panel tracker-panel">
      <div className="tracker-user-head">
        <div>
          <h2 className="tracker-user-title">{activeIncident.title}</h2>
          <div className="tracker-user-sub">
            UNIT: {activeIncident.unitName} • TYPE: {activeIncident.type.toUpperCase()}
          </div>
        </div>
        <div>
          <span className="eta-label">ESTIMATED ETA</span>
          <div className="eta-display">
            {isCompleted
              ? 'ON SCENE'
              : formatDuration(Math.max(0, activeIncident.totalSeconds - activeIncident.elapsedSeconds))}
          </div>
        </div>
      </div>

      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="timeline-steps">
        <div className={`step-box ${activeIncident.status === 'DISPATCH' ? 'active' : 'done'}`}>1. DISPATCHED</div>
        <div className={`step-box ${activeIncident.status === 'ARRIVING' ? 'active' : activeIncident.status === 'ON SCENE' ? 'done' : ''}`}>2. EN ROUTE</div>
        <div className={`step-box ${activeIncident.status === 'ON SCENE' ? 'active done' : ''}`}>3. ON SCENE</div>
      </div>

      <div className="tracker-metrics">
        <div className="metric-box">
          <span>ROUTE DISTANCE</span>
          <strong>{activeIncident.isOnSite ? '0.0 km' : `${activeIncident.totalDistanceKm} km`}</strong>
        </div>
        <div className="metric-box">
          <span>BASE TRAVEL TIME</span>
          <strong>{formatDuration(activeIncident.baseTimeSeconds || 0)}</strong>
        </div>
        <div className="metric-box traffic-impact">
          <span>TRAFFIC DELAY</span>
          <strong>+{formatDuration(activeIncident.trafficDelaySeconds || 0)}</strong>
        </div>
      </div>

      <div className="tracker-details">
        <div className="detail-item">
          <span>RESPONDING STATION</span>
          <strong>{NODE_MAP[activeIncident.dispatchNode]?.name || 'N/A'}</strong>
        </div>
        <div className="detail-item">
          <span>DESTINATION NODE</span>
          <strong>{NODE_MAP[activeIncident.locationNode]?.name || 'N/A'}</strong>
        </div>
        <div className="detail-item">
          <span>ADDRESS / LANDMARK</span>
          <strong>{activeIncident.address || 'N/A'}</strong>
        </div>
        <div className="detail-item">
          <span>CURRENT STATUS</span>
          <strong>{activeIncident.status || 'DISPATCH'}</strong>
        </div>
      </div>
    </div>
  );
}