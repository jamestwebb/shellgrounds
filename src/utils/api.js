// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// API client.

// Same-origin '/api' in production. In local dev VITE_API_BASE can point
// straight at scripts/dev-functions.mjs, which avoids Vite's proxy.
const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

// A proxy/timeout error page is HTML, not JSON. Never surface a raw parse
// error ("Unexpected token '<'") to a student as if their answer were wrong.
async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return { error: 'The server is busy — wait a moment and try again. Your answer was not judged.' };
  }
}

const TOKEN_KEY = 'shellgrounds_token';
const PACK_KEY = 'shellgrounds_pack';
// Older builds stored the token under a different name. Read it once so a
// student mid-term is not silently logged out by a deploy.
const LEGACY_TOKEN_KEYS = ['warren_token'];

export function getAuthToken() {
  const current = localStorage.getItem(TOKEN_KEY);
  if (current) return current;
  for (const key of LEGACY_TOKEN_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(key);
      return legacy;
    }
  }
  return '';
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else {
    localStorage.removeItem(TOKEN_KEY);
    for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  }
}

// Which module the student was last working in. The server no longer decides
// this — it resolves each submission from the challenge id — so the choice is
// the student's and it belongs here.
export function getStoredPackId() {
  try { return localStorage.getItem(PACK_KEY) || ''; } catch { return ''; }
}

export function setStoredPackId(packId) {
  try {
    if (packId) localStorage.setItem(PACK_KEY, packId);
    else localStorage.removeItem(PACK_KEY);
  } catch { /* private mode: the choice simply does not persist */ }
}

function authHeaders(extra = {}) {
  const token = getAuthToken();
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export async function registerHandle(handle, classPassword, { setupCode, packId } = {}) {
  const res = await fetch(`${API_BASE}/register-handle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, classPassword, setupCode, packId })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  if (data.token) setAuthToken(data.token);
  return data;
}

export async function fetchSession() {
  if (!getAuthToken()) return null;
  const res = await fetch(`${API_BASE}/session`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) setAuthToken(null);
    return null;
  }
  const data = await parseJsonSafe(res);
  if (data?.token) setAuthToken(data.token); // rolling session refresh
  return data;
}

export async function fetchManifest(packId) {
  if (!getAuthToken()) return { flags: {} };
  const qs = packId ? `?packId=${encodeURIComponent(packId)}` : '';
  const res = await fetch(`${API_BASE}/manifest${qs}`, { headers: authHeaders() });
  if (!res.ok) return { flags: {} };
  return await parseJsonSafe(res);
}

/**
 * Submits an answer.
 *
 * Takes an options object on purpose: the old positional signature was
 * (challengeId, flag, hintsUsed, commandText, hintsUsedByChallenge, cwd), and
 * both call sites passed cwd in the fifth slot. The server therefore never
 * received the student's directory, and a correct answer given from a
 * subdirectory could be judged in the wrong place.
 */
export async function submitFlagApi({ challengeId, flag = null, commandText = '', cwd } = {}) {
  if (!getAuthToken()) throw new Error('Not logged in');
  const res = await fetch(`${API_BASE}/submit-flag`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ challengeId, flag, commandText, cwd })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data.error || 'Submission failed');
  return data;
}

/** Opens one hint. The server records it and prices the penalty. */
export async function openHintApi(challengeId, index) {
  if (!getAuthToken()) throw new Error('Not logged in');
  const res = await fetch(`${API_BASE}/hint`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ challengeId, index })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data.error || 'Could not open that hint');
  return data;
}

export async function fetchLeaderboard(window = 'all', packId) {
  const params = new URLSearchParams({ window });
  if (packId) params.set('packId', packId);
  const res = await fetch(`${API_BASE}/leaderboard?${params}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return await parseJsonSafe(res);
}

export async function fetchAdminOverview(packId, { view, handle, format } = {}) {
  const params = new URLSearchParams();
  if (packId) params.set('packId', packId);
  if (view) params.set('view', view);
  if (handle) params.set('handle', handle);
  if (format) params.set('format', format);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/admin-overview${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch instructor data');
  return await parseJsonSafe(res);
}

/** The gradebook CSV, as a Blob the caller can offer as a download. */
export async function fetchGradebookCsv(packId) {
  const res = await fetch(
    `${API_BASE}/admin-overview?format=csv${packId ? `&packId=${encodeURIComponent(packId)}` : ''}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error('Failed to export the gradebook');
  return await res.blob();
}
