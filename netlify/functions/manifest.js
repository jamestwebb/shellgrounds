// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/manifest — this student's flag values for one pack.
//
// Migrated from the v1 handler signature to v2, so every function in this
// directory now has the same shape.
//
// These values necessarily reach the browser: the simulated filesystem runs
// client-side and must place each flag inside the simulated files. Per-student
// HMAC flags therefore stop a student SHARING an answer — the neighbour's flag
// differs — but they cannot stop a student reading their own. Grade on
// command-proof challenges, which the server replays and cannot be faked.

import { verifySessionToken, generateUserFlag } from '../../packages/engine/crypto-utils.js';
import { getPack } from '../../packs/index.js';
import { isPackEnabled, defaultPackId } from './utils/enabled.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

export default async (req) => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return json(401, { error: 'Unauthorized: Valid session token required' });
  }

  const handle = verified.handle;
  const requested = new URL(req.url).searchParams.get('packId');
  const packId = (await isPackEnabled(requested))
    ? requested
    : ((await isPackEnabled(verified.packId)) ? verified.packId : await defaultPackId());
  const pack = getPack(packId);

  // This was the one handler with no try/catch, so anything unexpected became
  // an unhandled rejection rather than a 500 the student could act on.
  try {
    const flags = {};
    for (const c of pack.challenges) {
      if (c.success?.kind === 'flag') {
        flags[c.id] = c.success.staticFlag
          ? c.success.staticFlag
          : generateUserFlag(sessionSecret, handle, c.id, pack.id);
      }
    }

    return json(200, { success: true, handle, packId: pack.id, flags },
      { 'Cache-Control': 'private, no-cache' });
  } catch (err) {
    console.error('Manifest error:', err);
    return json(500, { error: 'Could not load this module. Try again in a moment.' });
  }
};
