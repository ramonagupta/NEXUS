import { NODE_MAP, xyToLatLng } from './data';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || '/api';
const TIMEOUT_MS = 6000;

const isLocalId = (id) => String(id).startsWith('local-');

async function request(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(res) {
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

function unwrapList(body) {
  if (Array.isArray(body)) return body;
  const list = body?.data ?? body?.emergencies;
  if (!Array.isArray(list)) throw new Error('Unexpected response from /emergencies');
  return list;
}

function withGeo(payload) {
  const node = NODE_MAP[payload.locationNode];
  if (!node || payload.lat !== undefined) return payload;
  const { lat, lng } = xyToLatLng(node.x, node.y);
  return { ...payload, lat, lng };
}

export async function getEmergencies() {
  const res = await request('/emergencies');
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return unwrapList(await readBody(res));
}

export async function createEmergency(payload) {
  try {
    const res = await request('/emergencies', { method: 'POST', body: JSON.stringify(withGeo(payload)) });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const body = await readBody(res);
    const saved = body?.data ?? body?.emergency ?? body;
    const id = saved?.id ?? saved?._id;
    if (id === undefined || id === null) throw new Error('Server did not return an id for the new report');
    return { ...payload, ...saved, id, savedToBackend: true };
  } catch (err) {
    return {
      ...payload,
      id: payload.id || `local-${Date.now()}`,
      savedToBackend: false,
      syncError: err.name === 'AbortError' ? 'request timed out' : err.message,
    };
  }
}

export async function updateEmergencyStatus(id, status) {
  if (isLocalId(id)) return true;
  try {
    const res = await request(`/emergencies/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveEmergencyApi(id) {
  if (isLocalId(id)) return true;
  try {
    const res = await request(`/emergencies/${id}`, { method: 'DELETE' });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function getResources() {
  try {
    const res = await request('/resources');
    if (!res.ok) return null;
    const body = await readBody(res);
    const src = body?.data ?? body;
    const pick = (...keys) => {
      for (const k of keys) {
        const v = src?.[k];
        if (v && Number.isFinite(Number(v.available)) && Number.isFinite(Number(v.total))) {
          return { available: Number(v.available), total: Number(v.total) };
        }
      }
      return undefined;
    };
    const pool = {
      medical: pick('medical', 'ambulances'),
      fire: pick('fire', 'fireEngines'),
      police: pick('police', 'policeUnits'),
    };
    Object.keys(pool).forEach((k) => pool[k] === undefined && delete pool[k]);
    return Object.keys(pool).length ? pool : null;
  } catch {
    return null;
  }
}

export async function getTraffic() {
  try {
    const res = await request('/traffic');
    if (!res.ok) return null;
    const body = await readBody(res);
    const src = body?.traffic ?? body?.data ?? body;
    if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
    const clean = {};
    for (const [k, v] of Object.entries(src)) {
      if (Number.isFinite(Number(v))) clean[k] = Number(v);
    }
    return clean;
  } catch {
    return null;
  }
}

export async function saveTraffic(traffic) {
  try {
    const res = await request('/traffic', { method: 'PUT', body: JSON.stringify(traffic) });
    return res.ok;
  } catch {
    return false;
  }
}