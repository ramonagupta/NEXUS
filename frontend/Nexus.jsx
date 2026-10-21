import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './Header';
import MapPanel from './MapPanel';
import TrackerPanel from './TrackerPanel';
import ReportsList from './ReportsList';
import ResourceRow from './ResourceRow';
import ReportModal from './ReportModal';
import ToastContainer from './ToastContainer';
import * as api from './api';
import { formatDuration } from './format';
import './nexus.css';

// The frontend draws and asks. Everything else (the map, the traffic and where it comes from,
// routes, ETAs, priority, the waiting queue, resource counts, arrival) is decided by the backend
// and read from it. If the backend can't be reached the screen says so; there is no local mode.

const POLL_MS = 2000;

export default function Nexus() {
  const [city, setCity] = useState(null); // the map to draw
  const [traffic, setTraffic] = useState(null);
  const [emergencies, setEmergencies] = useState([]);
  const [resources, setResources] = useState(null);

  const [connectionError, setConnectionError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0); // re-draw every second so the countdowns keep moving

  const lastStatus = useRef(null); // report id -> status we saw last time (null until the first load)

  const pushToast = useCallback((message, alertType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, alertType }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  // announce what changed on the backend: a unit arrived, a waiting report finally got a unit
  const announceChanges = useCallback((list) => {
    const seen = lastStatus.current;
    const next = new Map(list.map((e) => [e.id, e.displayStatus]));
    if (seen) {
      for (const e of list) {
        const before = seen.get(e.id);
        if (before === undefined) continue;
        if (before === 'WAITING' && e.displayStatus !== 'WAITING' && e.displayStatus !== 'UNASSIGNED') {
          pushToast(`"${e.title}" left the priority queue: a unit was sent from ${e.units?.find((u) => u.state === 'assigned')?.providerArea ?? 'a station'}.`, 'success');
        } else if (before !== 'ON SCENE' && e.displayStatus === 'ON SCENE') {
          pushToast(`UNIT ARRIVED: ${e.unitName} is on scene for "${e.title}"!`, 'warning');
        }
      }
    }
    lastStatus.current = next;
  }, [pushToast]);

  const loadCity = useCallback(async () => {
    try {
      setCity(await api.getCity());
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err.message);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, pool, roads] = await Promise.all([api.getEmergencies(), api.getResources(), api.getTraffic()]);
      const receivedAt = Date.now();
      const stamped = list.map((e) => ({ ...e, receivedAt }));
      announceChanges(stamped);
      setEmergencies(stamped);
      setResources(pool);
      setTraffic(roads);
      setConnectionError(null);
    } catch (err) {
      setConnectionError(err.message);
    }
  }, [announceChanges]);

  useEffect(() => { loadCity(); }, [loadCity]);

  useEffect(() => {
    if (!city) return undefined;
    refresh();
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [city, refresh]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (activeId && emergencies.some((e) => e.id === activeId)) return;
    setActiveId(emergencies[0]?.id ?? null);
  }, [emergencies, activeId]);

  // ---- traffic: the backend sets it, re-routes the units on their way and sends it back ----
  async function changeTraffic(action, message) {
    try {
      await action();
      await refresh();
      pushToast(message, 'info');
    } catch (err) {
      pushToast(`Traffic change failed: ${err.message}`, 'warning');
    }
  }

  const handleSetRoadTraffic = (edgeId, level, ratio) =>
    changeTraffic(() => api.setRoadTraffic(edgeId, level, ratio), 'Traffic updated by the backend. Units on their way were re-routed.');
  const handleRandomTraffic = () => changeTraffic(api.randomizeTraffic, 'The backend generated new random traffic for the whole city.');
  const handleClearTraffic = () => changeTraffic(api.clearTraffic, 'Traffic cleared on every road.');

  // ---- reports ----
  async function handleSubmit(form) {
    const saved = await api.createEmergency(form); // throws on failure: the modal shows the message
    await refresh();
    setActiveId(saved.id);
    setIsModalOpen(false);

    if (saved.status === 'pending') {
      pushToast(`No unit is free. "${saved.title}" is WAITING in the priority queue at position ${saved.queuePosition} (score ${saved.priorityScore}).`, 'warning');
    } else if (saved.status === 'unassigned') {
      pushToast(`"${saved.title}" cannot be served: no station can take it (try fewer people).`, 'warning');
    } else {
      pushToast(`Emergency dispatched! ${saved.unitsNeeded > 1 ? `${saved.unitsNeeded} units sent. ` : ''}Total route: ${saved.totalDistanceKm}km (Est ETA: ${formatDuration(saved.totalSeconds)})`, 'success');
    }
  }

  async function handleResolve(id) {
    const e = emergencies.find((x) => x.id === id);
    if (!e) return;
    try {
      const result = await api.resolveEmergency(id);
      await refresh();
      const next = result.dispatchedFromQueue ?? [];
      pushToast(
        next.length
          ? `${e.title} resolved. The freed unit went to "${next.map((n) => n.title).join('", "')}" from the priority queue.`
          : `${e.title} resolved. Its units are available again.`,
        'success',
      );
    } catch (err) {
      pushToast(`Couldn't close "${e.title}": ${err.message}`, 'warning');
    }
  }

  const activeIncident = useMemo(
    () => emergencies.find((e) => e.id === activeId) || null,
    [emergencies, activeId],
  );
  const waiting = emergencies.filter((e) => e.displayStatus === 'WAITING').length;

  // ---- nothing to draw until the backend has sent the map ----
  if (!city || !traffic || !resources) {
    return (
      <div className="app-viewport">
        <Header />
        <div className="backend-screen">
          {connectionError ? (
            <>
              <h2>Can't reach the backend</h2>
              <p>{connectionError}</p>
              <p className="hint">Start MongoDB and the backend (<code>cd backend &amp;&amp; npm run dev</code>), then try again.</p>
              <button className="btn-prim" onClick={() => (city ? refresh() : loadCity())}>Try again</button>
            </>
          ) : (
            <h2>Loading the city from the backend…</h2>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-viewport">
      <ToastContainer toasts={toasts} />
      <Header />
      {connectionError && <div className="conn-banner">Backend connection lost: {connectionError}. Showing the last data received.</div>}

      <div className="main-stage">
        <MapPanel
          city={city}
          traffic={traffic}
          activeIncident={activeIncident}
          onSetRoadTraffic={handleSetRoadTraffic}
          onRandomizeTraffic={handleRandomTraffic}
          onClearTraffic={handleClearTraffic}
        />

        <div className="right-column">
          <TrackerPanel activeIncident={activeIncident} city={city} onResolve={handleResolve} />
          <ReportsList
            emergencies={emergencies}
            waiting={waiting}
            city={city}
            activeId={activeId}
            onSelect={setActiveId}
          />
        </div>
      </div>

      <ResourceRow resources={resources} waiting={waiting} onOpenReport={() => setIsModalOpen(true)} />

      <ReportModal open={isModalOpen} city={city} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit} />
    </div>
  );
}
