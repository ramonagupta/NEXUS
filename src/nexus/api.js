
const API_URL = import.meta.env.VITE_API_URL;

const ENDPOINTS = {
  list: '/emergencies',
  create: '/emergencies',
};

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${body || res.statusText}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function getEmergencies() {
  return request(ENDPOINTS.list);
}

export function createEmergency(payload) {
  return request(ENDPOINTS.create, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
