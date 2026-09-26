import { NODE_MAP } from './data';
import { formatDuration } from './graph';

export default function ReportsList({ emergencies, activeId, onSelect, loading, error }) {
  const isEmpty = emergencies.length === 0;

  return (
    <section className="panel flex-1">
      <div className="panel-head">
        <h2>Active Emergency Queue</h2>
        <span className="badge">
          {loading && isEmpty ? '…' : `${emergencies.length} Active Log${emergencies.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading && isEmpty && (
        <div className="empty-state">Loading reports…</div>
      )}

      {!loading && error && isEmpty && (
        <div className="empty-state" style={{ color: 'var(--red)' }}>
          Couldn't load existing reports from the server ({error}) — new reports you submit will still show up here.
        </div>
      )}

      {!(loading && isEmpty) && !(error && isEmpty) && (
        <div className="user-reports-container">
          {isEmpty && (
            <div className="empty-state">No reports yet. Use "Report Emergency" below to log one.</div>
          )}
          {emergencies.map((e) => {
            const isSelected = e.id === activeId;
            return (
              <div
                key={e.id}
                className={`report-card-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(e.id)}
              >
                <div className="r-top">
                  <span>{e.title}</span>
                  <span>{e.peopleCount} affected</span>
                </div>
                <div className="r-loc">📍 Location: {NODE_MAP[e.locationNode]?.name} ({e.isOnSite ? 'On-Site' : `${e.totalDistanceKm} km away`})</div>
                <div className="r-status-badge">
                  STATUS: {e.status} • {e.isOnSite ? '⚡ ON-SITE RESPONSE' : `Total Est: ${formatDuration(e.totalSeconds)} (Traffic Delay: +${formatDuration(e.trafficDelaySeconds)})`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}