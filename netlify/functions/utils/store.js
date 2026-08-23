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

// ── Site settings ───────────────────────────────────────────────────────────
// One record holds the choices a teacher makes from the instructor screen, so
// changing them takes a click rather than a redeploy. It is deliberately
// absent until somebody saves: "no record" is how the site knows an instructor
// has not been through setup yet, and is what sends them to the pack screen on
// their first login.
const SETTINGS_KEY = 'config/settings';

/** The saved settings, or null when nobody has saved any yet. */
export async function getSettings() {
  return await store().get(SETTINGS_KEY, { type: 'json' });
}

/**
 * Merges fields into the settings record, atomically.
 *
 * Two instructors on two laptops can be on this screen at once. Without the
 * compare-and-swap, the second save would silently erase the first, and the
 * teacher who lost would have no way to tell.
 */
export async function updateSettings(fields, updatedBy = null) {
  const s = store();
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, etag } = await readWithEtag(s, SETTINGS_KEY);
    const next = {
      ...(data || {}),
      ...fields,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || data?.updatedBy || null
    };
    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: !data };
    const res = await s.setJSON(SETTINGS_KEY, next, opts);
    if (!res || res.modified !== false) return next;
    await backoff(attempt);
  }
  throw new Error('Could not save the settings: too many simultaneous changes.');
}

// ── The reveal's high-water mark ────────────────────────────────────────────
// How far the class picture has ever got, as a fraction, per pack.
//
// It exists because the target scales with the roster: a second section
// registering in week five raises the denominator, which would shrink the
// fraction and make the picture RE-COVER. A class watching its shared work
// disappear because more people joined would be a bizarre thing to ship.
//
// Kept in its own record rather than in config/settings, so a student's read
// never stamps "settings changed" on something the instructor owns.
const revealKey = (packId) => `reveal/${packId}`;

export async function getRevealProgress(packId) {
  const rec = await store().get(revealKey(packId), { type: 'json' });
  const f = Number(rec?.fraction);
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

/** Raises the mark, never lowers it. Returns the value now in force. */
export async function raiseRevealProgress(packId, fraction) {
  const value = Math.max(0, Math.min(1, Number(fraction) || 0));
  const s = store();
  const key = revealKey(packId);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, etag } = await readWithEtag(s, key);
    const current = Number(data?.fraction) || 0;
    if (value <= current) return current;

    const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: !data };
    const res = await s.setJSON(key, { fraction: value, at: new Date().toISOString() }, opts);
    if (!res || res.modified !== false) return value;
    await backoff(attempt);
  }
  // Losing this race costs nothing: the next reader raises it instead.
  return value;
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

/**
 * Records that this student has seen an introduction screen.
 *
 * Kept against the account, not the browser. A student on a shared lab machine
 * gets a different browser most weeks, and localStorage would welcome them to
 * Shellgrounds every single time.
 *
 * Compare-and-swap for the same reason as every other write here: two tabs
 * finishing onboarding together must not drop one of the records.
 */
export async function markSeen(handle, key) {
  const s = store();
  const playerId = playerKey(handle);

  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const { data, etag } = await readWithEtag(s, playerId);
    if (!data) return null;
    if (data.seen?.[key]) return data.seen;

    const seen = { ...(data.seen || {}), [key]: new Date().toISOString() };
    const opts = etag ? { onlyIfMatch: etag } : {};
    const res = await s.setJSON(playerId, { ...data, seen }, opts);
    if (!res || res.modified !== false) return seen;
    await backoff(attempt);
  }
  throw new Error('Could not record onboarding progress: too many simultaneous writes.');
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

/**
 * Runs `fn` over every item with a ceiling on how many are in flight.
 *
 * The reads below used to be a plain `for … await`, which is one network round
 * trip per student, one after another. At twenty students that is invisible.
 * At two hundred it is four hundred sequential round trips for a single
 * leaderboard load, which at 20-40ms each is 8-16 seconds against a function
 * timeout of ten. The class that most needs the page to work is the one it
 * would fail for.
 *
 * Bounded rather than unbounded, because firing four hundred requests at once
 * trades a timeout for a rate limit.
 */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** How many blob reads may be in flight at once. */
export const READ_CONCURRENCY = 24;

export async function listPlayers() {
  const s = store();
  const { blobs } = await s.list({ prefix: 'players/' });
  // The SDK collects every page internally when `paginate` is not set, so a
  // class larger than one page is not silently truncated here.
  const records = await mapLimit(blobs, READ_CONCURRENCY, (b) => s.get(b.key, { type: 'json' }));
  return records.filter(Boolean);
}

/**
 * Every student's solves, read in parallel.
 * @returns {Promise<Array<{handle: string, solves: object}>>}
 */
export async function readAllSolves(players) {
  return mapLimit(players, READ_CONCURRENCY, async (p) => ({
    handle: p.handle,
    player: p,
    solves: await getSolves(p.handle)
  }));
}

/** Every student's solves and hints together, for the instructor views. */
export async function readAllProgress(players) {
  return mapLimit(players, READ_CONCURRENCY, async (p) => {
    const [solves, hints] = await Promise.all([getSolves(p.handle), getHintsUsed(p.handle)]);
    return { handle: p.handle, player: p, solves, hints };
  });
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
