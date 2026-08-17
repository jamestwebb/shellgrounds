// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/session

import { verifySessionToken, createSessionToken } from '../../src/engine/crypto-utils.js';
import { getPlayer, getSolves } from './utils/store.js';

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

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return json(401, { error: 'Invalid or expired session token' });
  }

  const handle = verified.handle;
  // No default admin handles: an unset ADMIN_HANDLES means no admins, not guessable ones.
  const adminHandles = (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminHandles.includes(handle.toLowerCase());

  try {
    const player = await getPlayer(handle);
    const solvesObj = player ? await getSolves(handle) : {};

    const solves = Object.entries(solvesObj).map(([challengeId, s]) => ({
      challengeId,
      points: s.points,
      hintPenalty: s.hintPenalty,
      netPoints: Math.max(0, (s.points || 0) - (s.hintPenalty || 0)),
      solvedAt: s.solvedAt
    }));
    const totalScore = solves.reduce((sum, s) => sum + s.netPoints, 0);

    return json(200, {
        success: true,
        handle,
        isAdmin,
        solves,
        totalScore,
        // Rolling refresh: handles cannot be re-registered, so the session must not
        // hard-expire for any student who visits at least once every 72 hours.
        token: createSessionToken(sessionSecret, handle)
      }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Session retrieval error:', err);
    return json(500, { error: 'Failed to retrieve session data' });
  }
};
