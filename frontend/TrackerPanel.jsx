import { useEffect, useState } from 'react';
import { formatDuration, liveElapsed, unitLabel } from './format';

const SERVICES = {
  ambulance: { singular: 'ambulance', plural: 'ambulances', title: 'Ambulances', accent: 'var(--teal)' },
  fire: { singular: 'fire engine', plural: 'fire engines', title: 'Fire engines', accent: 'var(--red)' },
  police: { singular: 'police unit', plural: 'police units', title: 'Police units', accent: 'var(--steel)' },
};

const DISPLAY_ORDER = ['ambulance', 'fire', 'police'];

const MAIN_SERVICE = {
  medical: 'ambulance',
  accident: 'ambulance',
  fire: 'fire',
  police: 'police',
  other: 'police',
};

const kindOf = (service) =>
  SERVICES[service] || { singular: 'unit', plural: 'units', title: String(service), accent: 'var(--ink-dim)' };

function vehicleCount(service, n) {
  const kind = kindOf(service);
  return `${n} ${n === 1 ? kind.singular : kind.plural}`;
}

const sum = (items, pick) => items.reduce((total, item) => total + pick(item), 0);

const anchors = new Map();

function steadyUnit(key, unit, receivedAt) {
  const total = unit.totalSeconds || 0;
  const arriveAt = receivedAt + (total - (unit.elapsedSeconds || 0)) * 1000;
  const saved = anchors.get(key);
  const keep = saved && saved.total === total && Math.abs(arriveAt - saved.arriveAt) <= 1500;
  const anchor = keep ? saved : { total, arriveAt };
  anchors.set(key, anchor);
  return { totalSeconds: total, elapsedSeconds: total - (anchor.arriveAt - receivedAt) / 1000, receivedAt };
}

function toRow(unit, receivedAt, key) {
  const assigned = unit.state === 'assigned';
  const total = assigned ? unit.totalSeconds || 0 : 0;

  const elapsed = assigned ? liveElapsed(steadyUnit(key, unit, receivedAt ?? Date.now())) : 0;
  const remaining = assigned ? Math.max(0, total - elapsed) : null;
  const arrived = assigned && (Boolean(unit.isOnSite) || remaining <= 0);

  let progress = 0;
  if (arrived) progress = 100;
  else if (assigned && total > 0) progress = Math.min(100, Math.round((elapsed / total) * 100));

  return {
    service: unit.service || 'unit',
    state: unit.state,
    vehicles: unit.unitsRequired || 1,
    provider: unit.provider || null,
    station: unit.providerArea || unit.provider || null,
    routePath: unit.routePath || [],
    distanceKm: unit.totalDistanceKm,
    trafficDelaySeconds: unit.trafficDelaySeconds || 0,
    isOnSite: Boolean(unit.isOnSite),
    remaining,
    arrived,
    progress,
  };
}

const STATE_ORDER = { assigned: 0, waiting: 1, unavailable: 2 };
const nearestFirst = (a, b) =>
  STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.remaining ?? 0) - (b.remaining ?? 0);

function toGroup(service, rows, mainService) {
  const assigned = rows.filter((r) => r.state === 'assigned');
  return {
    service,
    ...kindOf(service),
    isMain: service === mainService,
    rows: [...rows].sort(nearestFirst),
    assignedVehicles: sum(assigned, (r) => r.vehicles),
    arrivedVehicles: sum(assigned.filter((r) => r.arrived), (r) => r.vehicles),
  };
}

function buildResponse(incident, followed) {
  const rows = (incident.units || []).map((u) => toRow(u, incident.receivedAt, `${incident.id}|${u.service}|${u.provider}`));

  const followedRow = followed
    ? rows.find((r) => r.state === 'assigned' && r.service === followed.service && r.provider === followed.provider)
    : undefined;
  const mapRoute = (incident.routePath || []).join('>');
  const shownRow = followedRow || rows.find((r) => r.state === 'assigned' && r.routePath.join('>') === mapRoute);
  rows.forEach((r) => {
    r.onMap = r === shownRow;
    r.followed = r === followedRow;
  });

  const mainService = MAIN_SERVICE[incident.type];

  const kinds = [...new Set([...DISPLAY_ORDER, ...rows.map((r) => r.service)])]
    .filter((service) => rows.some((r) => r.service === service));

  const groups = kinds
    .map((service) => toGroup(service, rows.filter((r) => r.service === service), mainService))
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));

  const assigned = rows.filter((r) => r.state === 'assigned');
  const travelling = assigned.filter((r) => !r.arrived);
  const times = travelling.map((r) => r.remaining);

  return {
    groups,
    vehiclesSent: sum(assigned, (r) => r.vehicles),
    vehiclesRequested: sum(rows, (r) => r.vehicles),
    vehiclesArrived: sum(assigned.filter((r) => r.arrived), (r) => r.vehicles),
    stations: new Set(assigned.map((r) => r.station)).size,
    travelling: travelling.length,
    nextArrival: travelling.length ? Math.min(...times) : null,
    lastArrival: travelling.length ? Math.max(...times) : null,
    allArrived: assigned.length > 0 && travelling.length === 0,
  };
}

function ResponseUnits({ response, queuePosition, onFollowUnit }) {
  if (response.groups.length === 0) return null;

  return (
    <section className="resp-section" aria-label="Responding units">
      <div className="resp-head">
        <h3 className="resp-title">Responding units</h3>
        <span className="resp-summary">{summaryText(response)}</span>
      </div>

      {response.groups.map((group) => (
        <UnitGroup key={group.service} group={group} queuePosition={queuePosition} onFollowUnit={onFollowUnit} />
      ))}
    </section>
  );
}

function summaryText({ vehiclesSent, stations }) {
  if (vehiclesSent === 0) return 'None sent yet';
  const vehicles = `${vehiclesSent} ${vehiclesSent === 1 ? 'unit' : 'units'}`;
  return `${vehicles} · ${stations} ${stations === 1 ? 'station' : 'stations'}`;
}

function UnitGroup({ group, queuePosition, onFollowUnit }) {
  const { service, title, accent, isMain, rows } = group;

  return (
    <div className="resp-group" style={{ '--accent': accent }}>
      <div className="resp-group-head">
        <span className="resp-dot" aria-hidden="true" />
        <h4 className="resp-group-title">{title}</h4>
        {!isMain && <span className="resp-tag">Additional help</span>}
        <span className="resp-group-status">{groupStatus(group)}</span>
      </div>

      <ul className="resp-list">
        {rows.map((row, i) => (
          <UnitRow key={`${service}-${row.station ?? row.state}-${i}`} row={row} queuePosition={queuePosition} onFollowUnit={onFollowUnit} />
        ))}
      </ul>
    </div>
  );
}

function groupStatus({ assignedVehicles, arrivedVehicles, rows }) {
  if (assignedVehicles > 0) return `${arrivedVehicles} of ${assignedVehicles} on scene`;
  return rows.some((r) => r.state === 'waiting') ? 'Waiting for a free unit' : 'Cannot be served';
}

function UnitRow({ row, queuePosition, onFollowUnit }) {
  const { service, state, vehicles } = row;

  if (state === 'waiting') {
    return (
      <li className="resp-row is-waiting">
        <div className="resp-main">
          <span className="resp-count">×{vehicles}</span>
          <div className="resp-station">
            <strong>Waiting for {vehicleCount(service, vehicles)}</strong>
            <span className="resp-meta">Sent as soon as they are free</span>
          </div>
          <span className="resp-time">{queuePosition ? `Queue #${queuePosition}` : 'Waiting'}</span>
        </div>
      </li>
    );
  }

  if (state === 'unavailable') {
    return (
      <li className="resp-row is-unavailable">
        <div className="resp-main">
          <span className="resp-count">×{vehicles}</span>
          <div className="resp-station">
            <strong>No station can send {vehicleCount(service, vehicles)}</strong>
            <span className="resp-meta">Even when every unit is free</span>
          </div>
        </div>
      </li>
    );
  }

  const { station, distanceKm, trafficDelaySeconds, isOnSite, arrived, remaining, progress, onMap, followed } = row;

  return (
    <li className={`resp-row ${onMap ? 'is-on-map' : ''}`}>
      <button
        type="button"
        className="resp-main"
        aria-pressed={followed}
        title="Show this unit on the map"
        onClick={() => onFollowUnit(followed ? null : { service, provider: row.provider })}
      >
        <span className="resp-count">×{vehicles}</span>
        <span className="resp-station">
          <strong title={station}>{station}</strong>
          <span className="resp-meta">
            {isOnSite ? 'Already on site' : `${distanceKm} km`}
            {trafficDelaySeconds > 0 && (
              <span className="resp-delay"> · +{formatDuration(trafficDelaySeconds)} traffic</span>
            )}
          </span>
        </span>
        <span className={`resp-time ${arrived ? 'is-done' : ''}`}>
          {arrived ? '✓ On scene' : formatDuration(remaining)}
        </span>
        <span className="resp-bar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </button>
    </li>
  );
}

function describeEta(e, response) {
  if (e.displayStatus === 'UNASSIGNED') return { label: 'ESTIMATED ETA', value: 'NO UNIT' };
  if (e.displayStatus === 'WAITING') return { label: 'PRIORITY QUEUE', value: `#${e.queuePosition}` };
  if (response.allArrived) return { label: 'ESTIMATED ETA', value: 'ON SCENE' };

  if (response.travelling > 1) {
    return {
      label: 'NEXT ARRIVAL',
      value: formatDuration(response.nextArrival),
      note: `Last unit in ${formatDuration(response.lastArrival)}`,
    };
  }
  return { label: 'ESTIMATED ETA', value: formatDuration(response.nextArrival ?? 0) };
}

function currentStage(e, response) {
  if (e.displayStatus === 'UNASSIGNED') return 0;
  if (e.displayStatus === 'WAITING') return 1;
  if (response.allArrived) return 3;
  return e.displayStatus === 'DISPATCH' ? 1 : 2;
}

export default function TrackerPanel({ activeIncident: e, followedUnit, onFollowUnit, city, onResolve }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

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

  const response = buildResponse(e, followedUnit);
  const eta = describeEta(e, response);
  const stage = currentStage(e, response);
  const stepClass = (n) => (stage === n ? 'active' : stage > n ? 'done' : '');

  const sent = response.vehiclesSent;

  return (
    <div className="panel tracker-panel tracker-live">
      <div className="tracker-scroll">
        <div className="tracker-user-head">
          <div>
            <h2 className="tracker-user-title">{e.title}</h2>
            <div className="tracker-user-sub">📍 {e.locationName || nodeName(e.locationNode)}</div>
          </div>
          <div>
            <span className="eta-label">{eta.label}</span>
            <div className="eta-display">{eta.value}</div>
            {eta.note && <div className="eta-note">{eta.note}</div>}
          </div>
        </div>

        {isWaiting && (
          <div className="queue-note">
            No {unitLabel(e.type, 1).replace(/^1 /, '')} is free. This report is waiting in the priority queue
            at position {e.queuePosition}; the highest score gets the next free unit.
          </div>
        )}
        {isUnassigned && (
          <div className="queue-note">
            No station can take this report, even when every unit is free (too many people for one hospital).
          </div>
        )}

        <div className="timeline-steps">
          <div className={`step-box ${stepClass(1)}`}>1. {isWaiting ? 'WAITING' : 'DISPATCHED'}</div>
          <div className={`step-box ${stepClass(2)}`}>2. ARRIVING</div>
          <div className={`step-box ${stepClass(3)}`}>3. ON SCENE</div>
        </div>

        <ResponseUnits response={response} queuePosition={e.queuePosition} onFollowUnit={onFollowUnit} />

        <div className="tracker-details">
          <div className="detail-item">
            <span>UNITS SENT</span>
            <strong>{response.vehiclesRequested ? `${sent} of ${response.vehiclesRequested}` : '–'}</strong>
          </div>
          <div className="detail-item">
            <span>UNITS ON SCENE</span>
            <strong>{sent ? `${response.vehiclesArrived} of ${sent}` : '–'}</strong>
          </div>
        </div>
      </div>

      {onResolve && (
        <button className="btn-prim" style={{ margin: '8px 0 0', width: '100%', flex: '0 0 auto' }} onClick={() => onResolve(e.id)}>
          {sent === 0
            ? 'Cancel report'
            : `Mark resolved · release ${sent} ${sent === 1 ? 'unit' : 'units'}`}
        </button>
      )}
    </div>
  );
}
