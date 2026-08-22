// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/session

import { verifySessionToken, createSessionToken } from '../../packages/engine/crypto-utils.js';
import { DEFAULT_PACK_ID, PACKS } from '../../packs/index.js';
import { getPlayer, getSolves, getHintsUsed, normalizeSolve, splitSolveKey } from './utils/store.js';
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
  // The pack in the token is only a starting suggestion for the UI now. The
  // server resolves the pack of each submission from its challenge id, so a
  // student may move between modules freely.
  const packId = verified.packId || DEFAULT_PACK_ID;
  const isAdmin = isAdminHandle(handle);

  try {
    const player = await getPlayer(handle);
    const solvesObj = player ? await getSolves(handle) : {};
    const hintsObj = player ? await getHintsUsed(handle) : {};

    const solves = Object.entries(solvesObj).map(([key, raw]) => {
      const s = normalizeSolve(raw);
      const { packId: solvePack, challengeId } = splitSolveKey(key);
      return {
        packId: solvePack,
        challengeId,
        points: s.points,
        hintPenalty: s.hintPenalty,
        netPoints: s.netPoints,
        solvedAt: s.solvedAt
      };
    });

    const hintsOpened = Object.entries(hintsObj).map(([key, count]) => {
      const { packId: hintPack, challengeId } = splitSolveKey(key);
      return { packId: hintPack, challengeId, count: Number(count) || 0 };
    });

    const totalScore = solves.reduce((sum, s) => sum + s.netPoints, 0);

    const scoreByPack = {};
    for (const s of solves) {
      const k = s.packId || 'unscoped';
      scoreByPack[k] = (scoreByPack[k] || 0) + s.netPoints;
    }

    return json(200, {
      success: true,
      handle,
      packId,
      isAdmin,
      solves,
      hintsOpened,
      totalScore,
      scoreByPack,
      availablePacks: Object.values(PACKS).map(p => ({ id: p.id, name: p.manifest.name })),
      token: createSessionToken(sessionSecret, handle, packId)
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Session retrieval error:', err);
    return json(500, { error: 'Failed to retrieve session data' });
  }
};
