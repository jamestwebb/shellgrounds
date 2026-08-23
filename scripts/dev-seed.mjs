#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Fills the local blob store with a plausible class, for development only.
//
// An empty site hides most of what there is to look at: the shore is blank,
// the leaderboard is one row, and the instructor console has nothing to triage.
// This writes a small class that has been working for a few days, so every
// screen has something real on it.
//
//   node scripts/dev-seed.mjs             seed on top of whatever is there
//   node scripts/dev-seed.mjs --reset     empty the store first
//   node scripts/dev-seed.mjs --complete  everyone finishes, so the class picture
//                                         reaches 100% and its caption appears
//
// It writes the local JSON blob file directly rather than going through the
// API, so it does not need a server running and cannot touch a deployed site.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const STORE = process.env.SHELLGROUNDS_BLOBS_FILE
  || path.join(ROOT, '.netlify', 'blobs-local.json');

const { PACKS } = await import('../packs/index.js');

// Names chosen to look like a class register, and to exercise the handle rules:
// Hassan and Cassandra were both refused by the old filter.
const STUDENTS = [
  { handle: 'mara_k', pace: 0.85 },
  { handle: 'j_ito', pace: 0.70 },
  { handle: 'Hassan', pace: 0.55 },
  { handle: 'Cassandra', pace: 0.45 },
  { handle: 'ade_o', pace: 0.35 },
  { handle: 'liu_wei', pace: 0.30 },
  { handle: 'Michelle', pace: 0.20 },
  { handle: 'tomas99', pace: 0.10 },
  { handle: 'noor_s', pace: 0.05 }
];

const reset = process.argv.includes('--reset');
// The completed picture is the one screen a partial seed can never show, because
// the caption is held back until the last square turns over.
const complete = process.argv.includes('--complete');
fs.mkdirSync(path.dirname(STORE), { recursive: true });

let store = {};
if (!reset && fs.existsSync(STORE)) {
  const raw = fs.readFileSync(STORE, 'utf8').trim();
  if (raw) store = JSON.parse(raw);
}

const packId = process.env.SEED_PACK || 'linux-fundamentals';
const pack = PACKS[packId];
if (!pack) {
  console.error(`No pack '${packId}'. One of: ${Object.keys(PACKS).join(', ')}`);
  process.exit(1);
}

// Solvable challenges in act order, so a student's progress looks like progress
// rather than a random scatter across the course.
const ordered = [...pack.challenges].sort((a, b) => (a.act - b.act) || 0);

const now = Date.now();
const minutesAgo = (m) => new Date(now - m * 60_000).toISOString();

let solveCount = 0;
for (const [i, student] of STUDENTS.entries()) {
  const key = student.handle.toLowerCase();
  const take = complete
    ? ordered.length
    : Math.max(1, Math.round(ordered.length * student.pace));

  store[`players/${key}`] = {
    handle: student.handle,
    created_at: minutesAgo(60 * 24 * 6),
    last_seen: minutesAgo(i * 17 + 3),
    // Everyone has read the introduction screens, so a dev sign-in lands in
    // the terminal rather than in onboarding.
    seen: { welcome: minutesAgo(60 * 24 * 6) }
  };

  const solves = {};
  for (let n = 0; n < take; n++) {
    const c = ordered[n];
    // Spread the work backwards over about five days, most recent first.
    const when = minutesAgo(Math.round((take - n) * (60 * 24 * 5) / Math.max(take, 1)) + i * 7);
    solves[`${packId}/${c.id}`] = {
      points: c.points ?? 10,
      hintPenalty: n % 5 === 0 ? 2 : 0,
      earnedPoints: (c.points ?? 10) - (n % 5 === 0 ? 2 : 0),
      solvedAt: when
    };
    solveCount++;
  }
  store[`solves/${key}`] = solves;
  store[`hints/${key}`] = {};
}

// The reveal remembers the furthest it ever got, so that a late intake cannot
// shrink the picture. That floor also survives a reseed, which would leave a
// smaller class stuck at a fraction it can no longer explain.
delete store[`reveal/${packId}`];

fs.writeFileSync(STORE, JSON.stringify(store, null, 1) + '\n');

const instructor = (process.env.ADMIN_HANDLES || '').split(',')[0].trim();
console.log(`Seeded ${STUDENTS.length} students and ${solveCount} finds in '${packId}'`
  + `${complete ? ' — everyone finished, so the picture is whole and its caption shows' : ''}.`);
console.log(`Store: ${path.relative(ROOT, STORE)}`);
if (instructor) {
  console.log(`Instructor handle '${instructor}' is NOT seeded — claim it from the gate `
    + 'so the setup-code path is the one you actually test.');
}
