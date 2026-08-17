// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Database client: Neon Postgres in deployed environments, in-memory store for local `netlify dev` only.

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

// In-memory tables for local development WITHOUT a database (netlify dev only).
// Deployed environments must configure DATABASE_URL — there is no silent fallback.
// netlify dev runs each function invocation in its own process, so the store is
// persisted to a JSON file; mutating handlers must call db.save().
const memoryStore = {
  players: new Map(), // handle -> { id, handle, created_at, last_seen }
  solves: new Map(),  // `${playerId}:${challengeId}` -> { player_id, challenge_id, points, hint_penalty, solved_at }
  nextPlayerId: 1
};

function devStorePath() {
  return path.join(process.cwd(), '.netlify', 'warren-dev-store.json');
}

function loadMemoryStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(devStorePath(), 'utf8'));
    memoryStore.players = new Map(raw.players || []);
    memoryStore.solves = new Map(raw.solves || []);
    memoryStore.nextPlayerId = raw.nextPlayerId || 1;
  } catch {
    // First run, deleted, or unreadable file: reset to empty so a warm process
    // does not resurrect stale data
    memoryStore.players = new Map();
    memoryStore.solves = new Map();
    memoryStore.nextPlayerId = 1;
  }
}

function saveMemoryStore() {
  try {
    fs.mkdirSync(path.dirname(devStorePath()), { recursive: true });
    fs.writeFileSync(devStorePath(), JSON.stringify({
      players: [...memoryStore.players.entries()],
      solves: [...memoryStore.solves.entries()],
      nextPlayerId: memoryStore.nextPlayerId
    }));
  } catch (err) {
    console.warn('Dev store save failed:', err.message);
  }
}

// Schema bootstrap runs once per lambda instance; CREATE TABLE IF NOT EXISTS is idempotent.
let schemaReady = false;

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_seen TIMESTAMPTZ DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS solves (
      player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      hint_penalty INTEGER NOT NULL DEFAULT 0,
      solved_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (player_id, challenge_id)
    );
  `;
  schemaReady = true;
}

export async function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (dbUrl) {
    const sql = neon(dbUrl);
    await ensureSchema(sql);
    return { mode: 'neon', sql };
  }
  if (process.env.NETLIFY_DEV === 'true') {
    loadMemoryStore();
    return { mode: 'memory', store: memoryStore, save: saveMemoryStore };
  }
  throw new Error('DATABASE_URL is not configured — refusing to run without persistent storage');
}

export { memoryStore };
