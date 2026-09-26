import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './Header';
import MapPanel from './MapPanel';
import TrackerPanel from './TrackerPanel';
import ReportsList from './ReportsList';
import ResourceRow from './ResourceRow';
import ReportModal from './ReportModal';
import ToastContainer from './ToastContainer';
import { getEmergencies, createEmergency } from './api';
import { RAW_EDGES, INITIAL_RESOURCES, INITIAL_JAMMED_EDGES } from './data';
import { hydrateEmergency, rerouteEmergency, deriveSeverity, calculateBackendPriority } from './graph';
import './nexus.css';

export default function Nexus() {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [activeId, setActiveId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const [jammedEdgeIds, setJammedEdgeIds] = useState(new Set(INITIAL_JAMMED_EDGES));
  const [resources, setResources] = useState(INITIAL_RESOURCES);

  const pushToast = useCallback((message, alertType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, alertType }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);


  useEffect(() => {
    let cancelled = false;

    getEmergencies()
      .then((data) => {
        if (cancelled) return;
        const hydrated = (data || []).map((raw) => hydrateEmergency(raw, jammedEdgeIds));
        const sorted = hydrated.sort((a, b) => b.priorityScore - a.priorityScore);
        setEmergencies(sorted);
        if (sorted.length > 0) setActiveId(sorted[0].id);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };

  }, []);

  useEffect(() => {
    setEmergencies((prev) => prev.map((e) => (e.status === 'ON SCENE' ? e : rerouteEmergency(e, jammedEdgeIds))));
  }, [jammedEdgeIds]);


  useEffect(() => {
    const timer = setInterval(() => {
      setEmergencies((prev) => prev.map((e) => {
        if (e.status === 'ON SCENE') return e;
        const elapsed = e.elapsedSeconds + 1;
        const remaining = e.totalSeconds - elapsed;
        let status = e.status;

        if (remaining <= 0) {
          status = 'ON SCENE';
          pushToast(`UNIT ARRIVED: ${e.unitName} is on scene!`, 'warning');
        } else if (elapsed > Math.floor(e.totalSeconds * 0.4)) {
          status = 'ARRIVING';
        } else {
          status = 'DISPATCH';
        }

        return { ...e, elapsedSeconds: elapsed, status };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [pushToast]);


  function clearAllTraffic() {
    setJammedEdgeIds(new Set());
    pushToast('All traffic blockages cleared! Travel speeds restored to standard emergency transit.', 'info');
  }

  function setTrafficPreset(preset) {
    const allEdges = RAW_EDGES.map((e) => e.id);
    const newJams = new Set();
    const targetCount = preset === 'rush_hour' ? 7 : 14;
    while (newJams.size < targetCount) {
      newJams.add(allEdges[Math.floor(Math.random() * allEdges.length)]);
    }
    setJammedEdgeIds(newJams);
    pushToast(`Traffic Scenario Loaded: ${preset.replace('_', ' ').toUpperCase()} (${newJams.size} jammed segments)`, 'warning');
  }

  function randomizeTrafficJams() {
    const allEdges = RAW_EDGES.map((e) => e.id);
    const count = Math.floor(Math.random() * 4) + 3;
    const newJams = new Set();
    while (newJams.size < count) {
      newJams.add(allEdges[Math.floor(Math.random() * allEdges.length)]);
    }
    setJammedEdgeIds(newJams);
    pushToast(`Traffic updated: ${count} road segments affected! Emergency ETA recalculated.`, 'warning');
  }

  function toggleRoadJam(edgeId) {
    setJammedEdgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) {
        next.delete(edgeId);
        pushToast(`Road segment ${edgeId.toUpperCase()} cleared! ETA reduced.`, 'info');
      } else {
        next.add(edgeId);
        pushToast(`Road segment ${edgeId.toUpperCase()} jammed! Response units recalculating travel time.`, 'warning');
      }
      return next;
    });
  }

  async function handleSubmit(form) {
    const severityLevel = deriveSeverity(form.type, form.peopleCount);
    const priorityScore = calculateBackendPriority(form.type, severityLevel, form.peopleCount);

    let resKey = 'police';
    if (form.type === 'fire') resKey = 'fire';
    if (form.type === 'medical' || form.type === 'accident') resKey = 'medical';

    const payload = {
      title: form.title,
      type: form.type,
      locationNode: form.locationNode,
      address: form.address,
      peopleCount: form.peopleCount,
      severityLevel,
      priorityScore,
    };

    let hydrated;
    try {

      const created = await createEmergency(payload);
      hydrated = hydrateEmergency({ ...payload, ...created, savedToBackend: true }, jammedEdgeIds);
      pushToast(`Emergency dispatched! Total route: ${hydrated.totalDistanceKm}km (Est ETA: ${hydrated.totalSeconds}s)`, 'success');
    } catch (err) {

      hydrated = hydrateEmergency({ ...payload, savedToBackend: false }, jammedEdgeIds);
      pushToast(`Backend rejected this (${err.message}) — showing locally only.`, 'warning');
    }

    setResources((prev) => ({
      ...prev,
      [resKey]: { ...prev[resKey], available: Math.max(0, prev[resKey].available - 1) },
    }));

    setEmergencies((prev) => [hydrated, ...prev].sort((a, b) => b.priorityScore - a.priorityScore));
    setActiveId(hydrated.id);
    setIsModalOpen(false);
  }

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
          jammedEdgeIds={jammedEdgeIds}
          onToggleRoad={toggleRoadJam}
          onClearAll={clearAllTraffic}
          onPreset={setTrafficPreset}
          onRandomize={randomizeTrafficJams}
        />

        <div className="right-column">
          <TrackerPanel activeIncident={activeIncident} />
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
