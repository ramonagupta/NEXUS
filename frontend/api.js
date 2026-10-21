// api.js
// The ONLY way the frontend gets or changes anything: it asks the backend.
// There is no local copy of the data and no fallback: if the backend can't be reached,
// the call throws and the screen says so.

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';
const TIMEOUT_MS = 8000;

async function request(path, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `The server answered ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The backend did not answer in time');
    if (err instanceof TypeError) throw new Error('Cannot reach the backend. Is it running on port 5000?');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// the map to draw: nodes, roads (with curves), rivers, area names, station styles
export const getCity = () => request('/city/map');

// every road's load, level, colour and slowdown, all worked out by the backend
export const getTraffic = () => request('/traffic');
export const setRoadTraffic = (roadId, level, ratio) =>
  request(`/traffic/roads/${encodeURIComponent(roadId)}`, { method: 'PATCH', body: level === 'custom' ? { level, ratio } : { level } });
export const randomizeTraffic = () => request('/traffic/randomize', { method: 'POST', body: {} });
export const clearTraffic = () => request('/traffic/clear', { method: 'POST', body: {} });

// reports: priority, severity, units, the station chosen, the route, the ETA, the queue position
// and the status are all decided by the backend. The form only sends what the person typed.
export const getEmergencies = () => request('/emergencies');
export const createEmergency = ({ title, type, locationNode, address, peopleCount }) =>
  request('/emergencies', { method: 'POST', body: { title, type, locationNode, address, peopleCount } });
export const resolveEmergency = (id) => request(`/emergencies/${encodeURIComponent(id)}`, { method: 'DELETE' });

// { medical, fire, police }, each { available, total }
export const getResources = () => request('/resources');
