// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Data layer on Netlify Blobs — no external database.
//
// - Deployed: blobs persist with the site; nothing to provision.
// - Local `netlify dev`: the CLI serves a local blob sandbox automatically.
// - New semester: change SHELLGROUNDS_STORE (e.g. 'shellgrounds-spring2027') and
//   the class starts empty. Old data stays in the old store until deleted via
//   `netlify blobs:delete`.
//
// Concurrency: writes here are compare-and-swap, not last-write-wins. Two
// near-simultaneous solves used to return two HTTP 200s and store one record,
// so a student was told they scored points that were silently dropped. Every
// read-modify-write below re-reads and retries on a lost race.

import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

const RETRIES = 12;

// Every attempt after the first waits a little, with jitter, so a burst of
// simultaneous writers does not keep colliding in lockstep. Without this, ten
// concurrent submissions from one student exhausted five attempts and five
// solves came back as 500s.
const backoff = (attempt) =>
  new Promise(r => setTimeout(r, Math.min(200, 5 * 2 ** attempt) + Math.random() * 15));

// SHELLGROUNDS_BLOBS_FILE lets a test point the local backend at its own temp file
// so a test run can never touch a developer's real class data.
function localFilePath() {
  return process.env.SHELLGROUNDS_BLOBS_FILE
    || path.join(process.cwd(), '.netlify', 'blobs-local.json');
}

const etagOf = (value) =>
  createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex');

// Local fallback for `netlify dev` on an UNLINKED project (before first deploy,
// the CLI has no site ID and Blobs throws MissingBlobsEnvironmentError). Mirrors
// the subset of the Blobs surface used here, including ETag semantics, so tests
// exercise the same compare-and-swap path as production. Never used in prod.
function fileBackend() {
  const filePath = localFilePath();

  const load = () => {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
    // An empty file is not an empty store. It is a write that was interrupted,
    // and treating it as {} means the next write erases every player — the
    // exact loss the guard below exists to prevent.
    if (raw === '') {
      throw new Error(
        `Local blob store at ${filePath} is zero bytes and was NOT overwritten. `
        + 'Delete it deliberately if you meant to start empty.'
      );
    }
    if (raw.trim() === '') {
      throw new Error(
        `Local blob store at ${filePath} contains only whitespace and was NOT overwritten.`
      );
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Never fall back to {} here. The next setJSON would serialise that empty
      // object back over the file and erase every player and every score in the
      // class. Failing loudly is the only safe behaviour.
      throw new Error(
        `Local blob store at ${filePath} is corrupt and was NOT overwritten: ${err.message}`
      );
    }
  };

  const save = (data) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write to a sibling temp file and rename, so an interrupted write cannot
    // leave a half-serialised file behind for the guard above to reject.
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, filePath);
  };

  return {
    async get(key) {
      return load()[key] ?? null;
    },
    async getWithMetadata(key) {
      const data = load()[key];
      if (data === undefined) return null;
      return { data, etag: etagOf(data), metadata: {} };
    },
    async setJSON(key, value, opts = {}) {
      const all = load();
      const exists = Object.prototype.hasOwnProperty.call(all, key);
      if (opts.onlyIfNew && exists) return { modified: false };
      if (opts.onlyIfMatch && etagOf(all[key]) !== opts.onlyIfMatch) {
        return { modified: false };
      }
      all[key] = value;
      save(all);
      return { modified: true, etag: etagOf(value) };
    },
    async list({ prefix = '' } = {}) {
      return {
        blobs: Object.keys(load())
          .filter(k => k.startsWith(prefix))
          .map(k => ({ key: k }))
      };
    }
  };
}

// The store name. GAUNTLET_STORE is the pre-rename name of this variable and is
// still honoured, because a site that set it holds a term of student scores and
// a rename must not point that site at an empty store. Safe to delete once no
// deployment predates the rename.
export function storeName() {
  return process.env.SHELLGROUNDS_STORE
    || process.env.GAUNTLET_STORE
    || 'shellgrounds-fall2026';
}

function store() {
  try {
    // Functions v2 runtime: strong consistency is supported and required here —
    // registration dedupe and solve reads must see their own writes.
    return getStore({
      name: storeName(),
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

// One solve record is keyed `<packId>/<challengeId>`. Records written before
// packs were scoped are keyed by the bare challenge id; readSolveEntry finds
// either. Challenge ids are unique across every pack (the validator enforces
// it), so attributing a legacy record to its pack is exact, not a guess.
export const solveKey = (packId, challengeId) => `${packId}/${challengeId}`;

export function splitSolveKey(key) {
  const slash = key.indexOf('/');
  if (slash === -1) return { packId: null, challengeId: key, legacy: true };
  return { packId: key.slice(0, slash), challengeId: key.slice(slash + 1), legacy: false };
}

// Returns the stored record for a challenge under either key shape.
export function readSolveEntry(solves, packId, challengeId) {
  return solves?.[solveKey(packId, challengeId)] ?? solves?.[challengeId] ?? null;
}

async function readWithEtag(s, key) {
  if (typeof s.getWithMetadata === 'function') {
    const res = await s.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!res) return { data: null, etag: null };
    return { data: res.data ?? null, etag: res.etag ?? null };
  }
  return { data: await s.get(key, { type: 'json' }), etag: null };
}

export async function getPlayer(handle) {
  return await store().get(playerKey(handle), { type: 'json' });
}

// Returns { created: false } when the handle is already claimed. The claim is
// atomic: onlyIfNew makes two simultaneous registrations of the same handle
// resolve to exactly one winner rather than both being told they succeeded.
export async function createPlayer(handle) {
  const s = store();
  const now = new Date().toISOString();
  const res = await s.setJSON(
    playerKey(handle),
    { handle, created_at: now, last_seen: now },
    { onlyIfNew: true }
  );
  if (res && res.modified === false) return { created: false };
  await s.setJSON(solvesKey(handle), {});
  return { created: true };
}

/**
 * Records that this account proved it held INSTRUCTOR_SETUP_CODE. Being named
 * in ADMIN_HANDLES is not enough on its own — see utils/admin.js.
 */
export async function setInstructorFlag(handle, value = true) {
  const s = store();
  const key = playerKey(handle);
  const player = await s.get(key, { type: 'json' });
  if (!player) return false;
  await s.setJSON(key, { ...player, instructor: !!value });
  return true;
}

export async function touchPlayer(handle) {
  const s = store();
  const player = await s.get(playerKey(handle), { type: 'json' });
  if (!player) return;
  await s.setJSON(playerKey(handle), { ...player, last_seen: new Date().toISOString() });
}

// `<packId>/<challengeId>` -> { points, hintPenalty, earnedPoints, solvedAt }
export async function getSolves(handle) {
  return (await store().get(solvesKey(handle), { type: 'json' })) || {};
}

/**
 * Records one solve, atomically.
 *
 * Compare-and-swap, not last-write-wins: two solves submitted at the same
 * moment used to return two successes and persist one record, so a student was
 * congratulated for points that never existed. Each attempt re-reads the
 * current record and writes only if nothing changed underneath it.
 */
export async function addSolve(handle, packId, challengeId, record = {}) {
  const s = store();
  const key = solvesKey(handle);
  const composite = solveKey(packId, challengeId);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, etag } = await readWithEtag(s, key);
    const solves = data || {};

    if (readSolveEntry(solves, packId, challengeId)) {
      return { alreadySolved: true, solves };
    }

    const points = Number(record.points) || 0;
    const hintPenalty = Number(record.hintPenalty) || 0;
    const next = {
      ...solves,
      [composite]: {
        points,
        hintPenalty,
        earnedPoints: Number.isFinite(Number(record.earnedPoints))
          ? Number(record.earnedPoints)
          : Math.max(0, points - hintPenalty),
        solvedAt: record.solvedAt || new Date().toISOString()
      }
    };

    const opts = etag ? { onlyIfMatch: etag } : (data ? {} : { onlyIfNew: true });
    const res = await s.setJSON(key, next, opts);
    if (!res || res.modified !== false) {
      return { alreadySolved: false, solves: next };
    }
    // Lost the race. Wait a moment, then re-read and rebuild on the winner's write.
    await backoff(attempt);
  }

  throw new Error(`Could not record solve for ${handle}/${composite} after ${RETRIES} attempts`);
}

/**
 * Reads a stored solve in any historical shape and returns flat, finite numbers.
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

// ---------------------------------------------------------------------------
// Hints opened, recorded server-side.
//
// The hint penalty used to be whatever the browser declared, so an honest
// student scored 10 on a challenge where a dishonest one scored 20. The server
// now records each hint as it is opened and prices the solve from its own
// record; the client's number is ignored.
// ---------------------------------------------------------------------------

const hintsKey = (handle) => `hints/${handle.toLowerCase()}`;

export async function getHintsUsed(handle) {
  return (await store().get(hintsKey(handle), { type: 'json' })) || {};
}

/** Records that `index` (0-based) is now open. Returns the new open count. */
export async function openHint(handle, packId, challengeId, index) {
  const s = store();
  const key = hintsKey(handle);
  const composite = solveKey(packId, challengeId);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, etag } = await readWithEtag(s, key);
    const hints = data || {};
    // Read through the same accessor the pricing uses. Reading only the
    // pack-scoped key while the price fell back to a legacy bare key let a
    // re-opened hint collapse a penalty of 2 back down to 1.
    const current = hintCountFor(hints, packId, challengeId);
    const count = Math.max(current, Number(index) + 1);
    if (count === current) return current;

    const opts = etag ? { onlyIfMatch: etag } : (data ? {} : { onlyIfNew: true });
    const res = await s.setJSON(key, { ...hints, [composite]: count }, opts);
    if (!res || res.modified !== false) return count;
    await backoff(attempt);
  }
  throw new Error(`Could not record hint for ${handle}/${composite}`);
}

export function hintCountFor(hints, packId, challengeId) {
  const v = hints?.[solveKey(packId, challengeId)] ?? hints?.[challengeId] ?? 0;
  return Number(v) || 0;
}
