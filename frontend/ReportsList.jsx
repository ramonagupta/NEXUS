import { formatDuration, unitLabel } from './format';

// The list of open reports, in the order the backend sends them (highest priority score first).
export default function ReportsList({ emergencies, waiting, city, activeId, onSelect }) {
  const isEmpty = emergencies.length === 0;
  const nodeName = (id) => city.nodes.find((n) => n.id === id)?.name;

  return (
    <section className="panel flex-1">
      <div className="panel-head">
        <h2>Active Emergency Queue</h2>
        <span className="badge">
          {emergencies.length} Active Log{emergencies.length !== 1 ? 's' : ''}
          {waiting > 0 ? ` · ${waiting} waiting` : ''}
        </span>
      </div>

      <div className="user-reports-container">
        {isEmpty && <div className="empty-state">No reports yet. Use "Report Emergency" below to log one.</div>}
        {emergencies.map((e) => {
          const isWaiting = e.displayStatus === 'WAITING';
          const hasUnit = !isWaiting && e.displayStatus !== 'UNASSIGNED';
          return (
            <div
              key={e.id}
              className={`report-card-item ${e.id === activeId ? 'selected' : ''} ${isWaiting ? 'waiting' : ''}`}
              onClick={() => onSelect(e.id)}
            >
              <div className="r-top">
                <span>{e.title}</span>
                <span>{e.peopleCount} affected · {unitLabel(e.type, e.unitsNeeded ?? 1)}</span>
              </div>
              <div className="r-loc">
                📍 Location: {e.locationName || nodeName(e.locationNode)}
                {hasUnit ? ` (${e.isOnSite ? 'On-Site' : `${e.totalDistanceKm} km away`})` : ''}
              </div>
              <div className="r-status-badge">
                {isWaiting && <span className="queue-chip">QUEUE #{e.queuePosition}</span>}
                SCORE {e.priorityScore} • STATUS: {e.displayStatus}
                {hasUnit
                  ? ` • ${e.isOnSite ? '⚡ ON-SITE RESPONSE' : `Total Est: ${formatDuration(e.totalSeconds)} (Traffic Delay: +${formatDuration(e.trafficDelaySeconds)})`}`
                  : isWaiting ? ' • waiting for a free unit' : ' • no station can take it'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
