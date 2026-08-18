// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/session

import { verifySessionToken, createSessionToken } from '../../packages/engine/crypto-utils.js';
import { DEFAULT_PACK_ID } from '../../packs/index.js';
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
  const packId = verified.packId || DEFAULT_PACK_ID;

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
