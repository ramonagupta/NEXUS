// api.js
// The ONLY way the frontend gets or changes anything: it asks the backend.
// There is no local copy of the data and no fallback: if the backend can't be reached,
// the call throws and the screen says so.

const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const API_BASE = ENV.VITE_API_URL || '/api';
const AUTH_PROVIDER = ENV.VITE_AUTH_PROVIDER === 'firebase' ? 'firebase' : 'backend';
const TIMEOUT_MS = 8000;
const TOKEN_KEY = 'nexus_token';

let onUnauthorized = null;

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const saveToken = (token) => {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
};
export const clearToken = () => {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

let firebaseParts = null;
let recaptcha = null;
let confirmation = null;

async function loadFirebase() {
  if (firebaseParts) return firebaseParts;
  const config = {
    apiKey: ENV.VITE_FIREBASE_API_KEY,
    authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: ENV.VITE_FIREBASE_PROJECT_ID,
    appId: ENV.VITE_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Firebase is not set up. Add the VITE_FIREBASE_* values to frontend/.env and restart npm run dev.');
  }
  const [{ initializeApp }, lib] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  firebaseParts = { lib, auth: lib.getAuth(initializeApp(config)) };
  return firebaseParts;
}

async function currentToken() {
  if (AUTH_PROVIDER !== 'firebase') return getToken();
  const { auth } = await loadFirebase();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

function clearSession() {
  clearToken();
  if (firebaseParts) firebaseParts.lib.signOut(firebaseParts.auth).catch(() => {});
}

const FIREBASE_MESSAGES = {
  'auth/invalid-phone-number': 'Enter a valid mobile number.',
  'auth/missing-phone-number': 'Enter your mobile number.',
  'auth/too-many-requests': 'Too many attempts. Please wait a while and try again.',
  'auth/quota-exceeded': 'The SMS limit has been reached. Try again later.',
  'auth/invalid-verification-code': 'Wrong code. Check it and try again.',
  'auth/code-expired': 'This code has expired. Request a new one.',
  'auth/captcha-check-failed': 'Could not confirm you are not a robot. Reload the page and try again.',
  'auth/operation-not-allowed': 'Phone sign-in is not enabled for this region in Firebase.',
  'auth/network-request-failed': 'Cannot reach Firebase. Check your internet connection.',
};
const firebaseError = (err) =>
  new Error(FIREBASE_MESSAGES[err?.code] || err?.message || 'Sign-in failed. Please try again.');

async function request(path, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const token = await currentToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith('/auth/')) {
      clearSession();
      if (onUnauthorized) onUnauthorized();
    }
    if (!res.ok) {
      const failure = new Error(data?.message || `The server answered ${res.status}`);
      failure.status = res.status;
      throw failure;
    }
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
export const createEmergency = ({ title, type, locationNode, address, peopleCount, confirmedReal, additionalServices }) =>
  request('/emergencies', {
    method: 'POST',
    body: { title, type, locationNode, address, peopleCount, confirmedReal, additionalServices },
  });
export const resolveEmergency = (id) => request(`/emergencies/${encodeURIComponent(id)}`, { method: 'DELETE' });

// { medical, fire, police }, each { available, total }
export const getResources = () => request('/resources');

// login: phone + one-time code 
export async function sendOtp({ phone, mode }) {
  if (AUTH_PROVIDER !== 'firebase') return request('/auth/send-otp', { method: 'POST', body: { phone, mode } });

  const { auth, lib } = await loadFirebase();
  if (recaptcha) recaptcha.clear();
  recaptcha = new lib.RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
  try {
    confirmation = await lib.signInWithPhoneNumber(auth, phone, recaptcha);
    return { message: 'Code sent' };
  } catch (err) {
    recaptcha.clear();
    recaptcha = null;
    throw firebaseError(err);
  }
}

export async function verifyOtp({ phone, otp, mode, name }) {
  if (AUTH_PROVIDER !== 'firebase') {
    const result = await request('/auth/verify-otp', { method: 'POST', body: { phone, otp, mode, name } });
    saveToken(result.token);
    return result.user;
  }

  if (!confirmation) throw new Error('Request a new code first.');
  const { auth, lib } = await loadFirebase();
  try {
    await confirmation.confirm(otp);
  } catch (err) {
    throw firebaseError(err);
  }
  try {
    const user = await request('/auth/session', { method: 'POST', body: { mode, name } });
    confirmation = null;
    return user;
  } catch (err) {
    await lib.signOut(auth);
    throw err;
  }
}

export const getMe = () => request('/auth/me');

export function logout() {
  clearSession();
}
