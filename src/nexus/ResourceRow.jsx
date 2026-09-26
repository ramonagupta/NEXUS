export default function ResourceRow({ resources, onOpenReport }) {
  return (
    <div className="bottom-row">
      <div className="res-card">
        <h3>Ambulances</h3>
        <div className="val" style={{ color: 'var(--teal)' }}>
          {resources.medical.available} / {resources.medical.total}
        </div>
        <div className="sub">{Math.round((resources.medical.available / resources.medical.total) * 100)}% Available</div>
      </div>

      <div className="res-card">
        <h3>Fire Engines</h3>
        <div className="val" style={{ color: 'var(--red)' }}>
          {resources.fire.available} / {resources.fire.total}
        </div>
        <div className="sub">{Math.round((resources.fire.available / resources.fire.total) * 100)}% Available</div>
      </div>

      <div className="res-card">
        <h3>Police Units</h3>
        <div className="val" style={{ color: 'var(--steel)' }}>
          {resources.police.available} / {resources.police.total}
        </div>
        <div className="sub">{Math.round((resources.police.available / resources.police.total) * 100)}% Available</div>
      </div>

      <div className="action-card" onClick={onOpenReport}>
        <div>
          <h3>Report Emergency</h3>
          <p>Request instant emergency dispatch</p>
        </div>
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>+</span>
      </div>
    </div>
  );
}
