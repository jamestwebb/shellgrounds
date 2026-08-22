// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/session

import { verifySessionToken, createSessionToken } from '../../packages/engine/crypto-utils.js';
import { DEFAULT_PACK_ID } from '../../packs/index.js';
import { getPlayer, getSolves, normalizeSolve } from './utils/store.js';
import { isAdminHandle } from './utils/admin.js';

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
  const packId = verified.packId || DEFAULT_PACK_ID;

  const isAdmin = isAdminHandle(handle);

  try {
    const player = await getPlayer(handle);
    const solvesObj = player ? await getSolves(handle) : {};

    const solves = Object.entries(solvesObj).map(([challengeId, raw]) => {
      const s = normalizeSolve(raw);
      return {
        challengeId,
        points: s.points,
        hintPenalty: s.hintPenalty,
        netPoints: s.netPoints,
        solvedAt: s.solvedAt
      };
    });
    const totalScore = solves.reduce((sum, s) => sum + s.netPoints, 0);

    return json(200, {
      success: true,
      handle,
      packId,
      isAdmin,
      solves,
      totalScore,
      token: createSessionToken(sessionSecret, handle, packId)
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Session retrieval error:', err);
    return json(500, { error: 'Failed to retrieve session data' });
  }
};
