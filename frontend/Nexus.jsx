import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './Header';
import MapPanel from './MapPanel';
import TrackerPanel from './TrackerPanel';
import ReportsList from './ReportsList';
import ResourceRow from './ResourceRow';
import ReportModal from './ReportModal';
import ToastContainer from './ToastContainer';
import { getEmergencies, createEmergency, getResources, updateEmergencyStatus, resolveEmergencyApi, getTraffic, saveTraffic } from './api';
import { GRAPH_EDGES, NODE_MAP, INITIAL_RESOURCES } from './data';
import { TRAFFIC_LEVELS, generateRandomTraffic, setRoadTrafficLevel } from './traffic';
import { hydrateEmergency, rerouteEmergency, deriveSeverity, calculateBackendPriority, statusFor, unitsNeededFor, formatDuration } from './graph';
import './nexus.css';

const POLL_MS = 15000;
const TRAFFIC_POLL_MS = 5000; 

const resKeyFor = (type) => (type === 'fire' ? 'fire' : type === 'medical' || type === 'accident' ? 'medical' : 'police');
const byPriority = (a, b) => b.priorityScore - a.priorityScore;

function sameTraffic(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export default function Nexus() {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [activeId, setActiveId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);


  const [traffic, setTraffic] = useState(() => generateRandomTraffic());
  const [serverPool, setServerPool] = useState({});

  const trafficRef = useRef(traffic);
  trafficRef.current = traffic;
  const emergenciesRef = useRef(emergencies);
  emergenciesRef.current = emergencies;
  const lastTrafficChangeRef = useRef(0); // when this screen last edited traffic
  const notifiedRef = useRef(new Set()); // incidents already announced / PATCHed as ON SCENE
  const resolvedRef = useRef(new Set());

  const pushToast = useCallback((message, alertType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, alertType }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const refreshResources = useCallback(async () => {
    const pool = await getResources();
    setServerPool(pool ?? {});
  }, []);

  const syncFromServer = useCallback(async (initial = false) => {
    try {
      const data = await getEmergencies();
      const fresh = data
        .map((raw) => hydrateEmergency(raw, trafficRef.current))
        .filter((e) => !e.resolved && !resolvedRef.current.has(e.id));
      const freshIds = new Set(fresh.map((e) => e.id));

      setEmergencies((prev) => {
        const prevById = new Map(prev.map((e) => [e.id, e]));
        const merged = fresh.map((e) => prevById.get(e.id) ?? e); // keep ours so routes don't flicker
        const justCreated = prev.filter((e) => e.savedToBackend && !freshIds.has(e.id) && Date.now() - e.dispatchedAt < 10000);
        const localOnly = prev.filter((e) => !e.savedToBackend);
        return [...merged, ...justCreated, ...localOnly].sort(byPriority);
      });

      await refreshResources();

      setLoadError(null);
    } catch (err) {
      setServerPool({});
      if (initial) setLoadError(err.message);
    }
  }, [refreshResources]);

  useEffect(() => {
    syncFromServer(true).finally(() => setLoading(false));
    const poll = setInterval(() => syncFromServer(false), POLL_MS);
    return () => clearInterval(poll);
  }, [syncFromServer]);

  const syncTraffic = useCallback(async (initial = false) => {
    const server = await getTraffic();
    if (server === null) return;
    if (Object.keys(server).length === 0) {
      if (initial) saveTraffic(trafficRef.current);
      return;
    }
    if (Date.now() - lastTrafficChangeRef.current < 3000) return; // don't overwrite a change we just made
    if (!sameTraffic(server, trafficRef.current)) setTraffic(server);
  }, []);

  useEffect(() => {
    syncTraffic(true);
    const t = setInterval(() => syncTraffic(false), TRAFFIC_POLL_MS);
    return () => clearInterval(t);
  }, [syncTraffic]);

  useEffect(() => {
    if (activeId && emergencies.some((e) => e.id === activeId)) return;
    setActiveId(emergencies[0]?.id ?? null);
  }, [emergencies, activeId]);

  // traffic changed -> recompute routes for units still travelling
  useEffect(() => {
    setEmergencies((prev) => prev.map((e) => (e.status === 'ON SCENE' ? e : rerouteEmergency(e, traffic))));
  }, [traffic]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      // side effects (toast + tell the server) happen once, outside the state updater
      for (const e of emergenciesRef.current) {
        if (e.status === 'ON SCENE' || notifiedRef.current.has(e.id)) continue;
        if (Math.floor((now - e.dispatchedAt) / 1000) >= e.totalSeconds) {
          notifiedRef.current.add(e.id);
          pushToast(`UNIT ARRIVED: ${e.unitName} is on scene!`, 'warning');
          if (e.savedToBackend) updateEmergencyStatus(e.id, 'ON SCENE');
        }
      }

      setEmergencies((prev) => prev.map((e) => {
        if (e.status === 'ON SCENE') return e;
        const elapsed = Math.max(0, Math.floor((now - e.dispatchedAt) / 1000));
        return { ...e, elapsedSeconds: elapsed, status: statusFor(elapsed, e.totalSeconds) };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [pushToast]);

  function handleSetRoadTraffic(edgeId, level, ratio) {
    const edge = GRAPH_EDGES.find((e) => e.id === edgeId);
    if (!edge) return;
    const next = setRoadTrafficLevel(trafficRef.current, edge, level, ratio);
    trafficRef.current = next;
    lastTrafficChangeRef.current = Date.now();
    setTraffic(next);
    saveTraffic(next); 
    const name = `${NODE_MAP[edge.u].name} ↔ ${NODE_MAP[edge.v].name}`;
    if (level === 'free') {
      pushToast(`Traffic cleared on ${name}. Routes recalculated.`, 'info');
    } else if (level === 'full') {
      pushToast(`${name} is now at capacity. Responding units recalculating.`, 'warning');
    } else if (level === 'custom') {
      pushToast(`${name} set to ${Math.round(ratio * 100)}% of capacity. Routes recalculated.`, ratio > 1 ? 'warning' : 'info');
    } else {
      pushToast(`${TRAFFIC_LEVELS[level].label} traffic on ${name} (over capacity). Responding units recalculating.`, 'warning');
    }
  }

  async function handleSubmit(form) {
    const severityLevel = deriveSeverity(form.type, form.peopleCount);
    const priorityScore = calculateBackendPriority(form.type, severityLevel, form.peopleCount);

    const payload = {
      title: form.title,
      type: form.type,
      locationNode: form.locationNode,
      address: form.address,
      peopleCount: form.peopleCount,
      severityLevel,
      priorityScore,
      unitsNeeded: unitsNeededFor(form.type, form.peopleCount), // e.g. 7 people -> 3 ambulances
      dispatchedAt: new Date().toISOString(),
    };


    const created = await createEmergency(payload);
    const hydrated = hydrateEmergency({ ...payload, ...created }, trafficRef.current);

    if (hydrated.savedToBackend) {
      pushToast(`Emergency dispatched! ${hydrated.unitsNeeded > 1 ? `${hydrated.unitsNeeded} units sent. ` : ''}Total route: ${hydrated.totalDistanceKm}km (Est ETA: ${formatDuration(hydrated.totalSeconds)})`, 'success');
    } else {
      pushToast(`Dispatched locally only (${created.syncError ?? 'backend unavailable'}). It was not saved to the server.`, 'warning');
    }

    if (hydrated.savedToBackend) refreshResources(); // the backend just changed its tally

    setEmergencies((prev) => [hydrated, ...prev.filter((e) => e.id !== hydrated.id)].sort(byPriority));
    setActiveId(hydrated.id);
    setIsModalOpen(false);
  }

  async function handleResolve(id) {
    const e = emergenciesRef.current.find((x) => x.id === id);
    if (!e) return;
    const ok = await resolveEmergencyApi(e.id);
    if (!ok) {
      pushToast(`Couldn't close "${e.title}" on the server. Try again.`, 'warning');
      return;
    }
    resolvedRef.current.add(e.id);
    setEmergencies((prev) => prev.filter((x) => x.id !== id));
    refreshResources(); // the unit is back in the backend's tally
    pushToast(`${e.title} resolved. ${e.unitsNeeded > 1 ? `${e.unitsNeeded} units are` : `${e.unitName} is`} available again.`, 'success');
  }

  const resources = useMemo(() => {
    const active = { medical: 0, fire: 0, police: 0 };
    const localOnly = { medical: 0, fire: 0, police: 0 };
    for (const e of emergencies) {
      const k = resKeyFor(e.type);
      const n = e.unitsNeeded ?? 1;
      active[k] += n;
      if (!e.savedToBackend) localOnly[k] += n;
    }
    const out = {};
    for (const k of Object.keys(active)) {
      const srv = serverPool[k];
      if (srv) {
        out[k] = { total: srv.total, available: Math.min(srv.total, Math.max(0, srv.available - localOnly[k])) };
      } else {
        const total = INITIAL_RESOURCES[k].total;
        out[k] = { total, available: Math.max(0, total - active[k]) };
      }
    }
    return out;
  }, [emergencies, serverPool]);

  const activeIncident = useMemo(
    () => emergencies.find((e) => e.id === activeId) || null,
    [emergencies, activeId],
  );

  return (
    <div className="app-viewport">
      <ToastContainer toasts={toasts} />
      <Header />

      <div className="main-stage">
        <MapPanel
          activeIncident={activeIncident}
          traffic={traffic}
          onSetRoadTraffic={handleSetRoadTraffic}
        />

        <div className="right-column">
          <TrackerPanel activeIncident={activeIncident} onResolve={handleResolve} />
          <ReportsList
            emergencies={emergencies}
            activeId={activeId}
            onSelect={setActiveId}
            loading={loading}
            error={loadError}
          />
        </div>
      </div>

      <ResourceRow resources={resources} onOpenReport={() => setIsModalOpen(true)} />

      <ReportModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit} />
    </div>
  );
}