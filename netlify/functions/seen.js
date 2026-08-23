// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/seen — "this student has read that screen".
//
// Kept against the account rather than the browser. A student on a shared lab
// machine gets a different browser most weeks, and browser storage would show
// them the welcome screen every single time.
//
// The keys are a closed list. This endpoint writes to the player record, and a
// record whose shape any client can extend is a record nobody can reason about
// later; an unknown key is refused rather than stored.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { markSeen } from './utils/store.js';
import { hasPack } from '../../packs/index.js';

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export const WELCOME_KEY = 'welcome';
export const briefingKey = (packId) => `briefing:${packId}`;

/** @returns {string|null} the storage key, or null when the client asked for something unknown. */
export function resolveSeenKey(what, packId) {
  if (what === 'welcome') return WELCOME_KEY;
  if (what === 'briefing') return hasPack(packId) ? briefingKey(packId) : null;
  return null;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized: Session expired or invalid' });

  try {
    const { what, packId } = (await req.json().catch(() => ({})));
    const key = resolveSeenKey(what, packId);
    if (!key) return json(400, { error: 'Unknown screen.' });

    const seen = await markSeen(verified.handle, key);
    return json(200, { success: true, seen: seen || {} });
  } catch (err) {
    // Never block a student on this. The worst case of a failure here is that
    // they are shown a screen they have already read.
    console.error('Seen error:', err);
    return json(200, { success: false, seen: {} });
  }
};
