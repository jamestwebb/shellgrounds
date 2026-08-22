// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Data layer on Netlify Blobs — no external database.
//
// - Deployed: blobs persist with the site; nothing to provision.
// - Local `netlify dev`: the CLI serves a local blob sandbox automatically.
// - New semester: change GAUNTLET_STORE (e.g. 'gauntlet-spring2027') and the
//   class starts empty. Old data stays in the old store until deleted via
//   `netlify blobs:delete`.
//
// Concurrency note: blob writes are last-write-wins. At classroom scale the
// only realistic race is one player's two near-simultaneous solves, where the
// losing write is re-earnable; acceptable by design.

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

// Local fallback for `netlify dev` on an UNLINKED project (before first deploy,
// the CLI has no site ID and Blobs throws MissingBlobsEnvironmentError). Same
// get/setJSON/list surface, persisted to a JSON file. Once the site is linked,
// getStore() succeeds and this never runs. Never used in production.
function fileBackend() {
  const filePath = path.join(process.cwd(), '.netlify', 'blobs-local.json');
  const load = () => {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
  };
  const save = (data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data));
  };
  return {
    async get(key) { return load()[key] ?? null; },
    async setJSON(key, value) { const d = load(); d[key] = value; save(d); },
    async list({ prefix = '' } = {}) {
      return { blobs: Object.keys(load()).filter(k => k.startsWith(prefix)).map(k => ({ key: k })) };
    }
  };
}

function store() {
  try {
    // Functions v2 runtime: strong consistency is supported and required here —
    // registration dedupe and solve reads must see their own writes.
    return getStore({
      name: process.env.GAUNTLET_STORE || 'gauntlet-fall2026',
      consistency: 'strong'
    });
  } catch (err) {
    if (process.env.NETLIFY_DEV === 'true') {
      return fileBackend();
    }
    throw err;
  }
}

const playerKey = (handle) => `players/${handle.toLowerCase()}`;
const solvesKey = (handle) => `solves/${handle.toLowerCase()}`;

export async function getPlayer(handle) {
  return await store().get(playerKey(handle), { type: 'json' });
}

// Returns { created: false } when the handle is already claimed.
export async function createPlayer(handle) {
  const s = store();
  const existing = await s.get(playerKey(handle), { type: 'json' });
  if (existing) return { created: false };
  const now = new Date().toISOString();
  await s.setJSON(playerKey(handle), { handle, created_at: now, last_seen: now });
  await s.setJSON(solvesKey(handle), {});
  return { created: true };
}

// challengeId -> { points, hintPenalty, solvedAt }
export async function getSolves(handle) {
  return (await store().get(solvesKey(handle), { type: 'json' })) || {};
}

/**
 * Records one solve. Takes the whole record, because the caller already knows
 * the hint penalty and the earned total.
 *
 * This used to take (handle, challengeId, points, hintPenalty) positionally
 * while submit-flag.js passed an object as the third argument. The payload
 * therefore landed nested under `.points`, and every reader computed
 * `object - 0`, so every score and every leaderboard rank read NaN. Records
 * written in that period are still in the store; normalizeSolve reads them.
 */
export async function addSolve(handle, challengeId, record = {}) {
  const s = store();
  const solves = (await s.get(solvesKey(handle), { type: 'json' })) || {};
  if (solves[challengeId]) {
    return { alreadySolved: true, solves };
  }
  const points = Number(record.points) || 0;
  const hintPenalty = Number(record.hintPenalty) || 0;
  solves[challengeId] = {
    points,
    hintPenalty,
    earnedPoints: Number.isFinite(Number(record.earnedPoints))
      ? Number(record.earnedPoints)
      : Math.max(0, points - hintPenalty),
    solvedAt: record.solvedAt || new Date().toISOString()
  };
  await s.setJSON(solvesKey(handle), solves);
  return { alreadySolved: false, solves };
}

/**
 * Reads a stored solve in either shape and returns flat, finite numbers.
 * Every consumer of a solve record must go through this: reading `.points`
 * directly is what produced NaN scores, and the malformed records survive in
 * the live store until they are re-earned.
 */
export function normalizeSolve(record) {
  const nested = record && typeof record.points === 'object' && record.points !== null;
  const r = nested
    ? { ...record.points, solvedAt: record.solvedAt || record.points.solvedAt }
    : (record || {});
  const points = Number(r.points) || 0;
  const hintPenalty = Number(r.hintPenalty) || 0;
  const earned = Number(r.earnedPoints);
  return {
    points,
    hintPenalty,
    netPoints: Math.max(0, Number.isFinite(earned) ? earned : points - hintPenalty),
    solvedAt: r.solvedAt
  };
}

export async function listPlayers() {
  const s = store();
  const { blobs } = await s.list({ prefix: 'players/' });
  const players = [];
  for (const b of blobs) {
    const p = await s.get(b.key, { type: 'json' });
    if (p) players.push(p);
  }
  return players;
}
