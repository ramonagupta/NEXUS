// The three resource cards. The numbers are the backend's (GET /api/resources).
const pct = (r) => (r.total > 0 ? Math.round((r.available / r.total) * 100) : 0);

export default function ResourceRow({ resources, waiting, onOpenReport }) {
  return (
    <div className="bottom-row">
      <div className="res-card">
        <h3>Ambulances</h3>
        <div className="val" style={{ color: 'var(--teal)' }}>
          {resources.medical.available} / {resources.medical.total}
        </div>
        <div className="sub">{pct(resources.medical)}% Available</div>
      </div>

      <div className="res-card">
        <h3>Fire Engines</h3>
        <div className="val" style={{ color: 'var(--red)' }}>
          {resources.fire.available} / {resources.fire.total}
        </div>
        <div className="sub">{pct(resources.fire)}% Available</div>
      </div>

      <div className="res-card">
        <h3>Police Units</h3>
        <div className="val" style={{ color: 'var(--steel)' }}>
          {resources.police.available} / {resources.police.total}
        </div>
        <div className="sub">{pct(resources.police)}% Available</div>
      </div>

      <div className="action-card" onClick={onOpenReport}>
        <div>
          <h3>Report Emergency</h3>
          <p>{waiting > 0 ? `${waiting} report${waiting > 1 ? 's' : ''} waiting in the priority queue` : 'Request instant emergency dispatch'}</p>
        </div>
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>+</span>
      </div>
    </div>
  );
}
