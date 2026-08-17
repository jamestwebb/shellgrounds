// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// API client for The Gauntlet backend services

const API_BASE = '/api';

// A proxy/timeout error page is HTML, not JSON. Never surface a raw parse
// error ("Unexpected token '<'") to a student as if their answer were wrong.
async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return { error: 'The server is busy — wait a moment and try again. Your submission was not judged.' };
  }
}

export function getAuthToken() {
  return localStorage.getItem('warren_token') || '';
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('warren_token', token);
  } else {
    localStorage.removeItem('warren_token');
  }
}

export async function registerHandle(handle, classPassword) {
  const res = await fetch(`${API_BASE}/register-handle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, classPassword })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data.error || 'Registration failed');
  }
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function fetchSession() {
  const token = getAuthToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/session`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    if (res.status === 401) {
      setAuthToken(null);
    }
    return null;
  }
  const data = await res.json();
  if (data?.token) {
    setAuthToken(data.token); // rolling session refresh
  }
  return data;
}

export async function fetchManifest() {
  const token = getAuthToken();
  if (!token) return { flags: {} };

  const res = await fetch(`${API_BASE}/manifest`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return { flags: {} };
  return await res.json();
}

export async function submitFlagApi(challengeId, flag, hintsUsed = 0, commandText = '', hintsUsedByChallenge = undefined) {
  const token = getAuthToken();
  if (!token) throw new Error('Not logged in');

  const res = await fetch(`${API_BASE}/submit-flag`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ challengeId, flag, hintsUsed, commandText, hintsUsedByChallenge })
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    throw new Error(data.error || 'Flag submission failed');
  }
  return data;
}

export async function fetchLeaderboard(window = 'all') {
  const res = await fetch(`${API_BASE}/leaderboard?window=${window}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return await res.json();
}

export async function fetchAdminOverview() {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/admin-overview`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch admin overview');
  return await res.json();
}
