// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/admin-overview

import { verifySessionToken } from '../../src/engine/crypto-utils.js';
import { CHALLENGES } from '../../src/data/challenges.js';
import { listPlayers, getSolves } from './utils/store.js';

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
    return json(401, { error: 'Unauthorized' });
  }

  const handle = verified.handle;
  const adminHandles = (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

  if (!adminHandles.includes(handle.toLowerCase())) {
    return json(403, { error: 'Forbidden: Admin clearance required' });
  }

  try {
    const challengeStats = {};
    CHALLENGES.forEach(c => {
      challengeStats[c.id] = {
        id: c.id,
        title: c.title,
        act: c.act,
        points: c.points,
        solveCount: 0,
        totalHintsUsed: 0
      };
    });

    const players = await listPlayers();
    const allSolves = [];

    for (const p of players) {
      const solvesObj = await getSolves(p.handle);
      for (const [challengeId, s] of Object.entries(solvesObj)) {
        if (challengeStats[challengeId]) {
          challengeStats[challengeId].solveCount++;
          if ((s.hintPenalty || 0) > 0) challengeStats[challengeId].totalHintsUsed++;
        }
        allSolves.push({ handle: p.handle, challengeId, solvedAt: s.solvedAt });
      }
    }

    allSolves.sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));

    return json(200, {
        success: true,
        totalPlayers: players.length,
        challengeStats: Object.values(challengeStats),
        recentSolves: allSolves.slice(0, 20)
      }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Admin overview error:', err);
    return json(500, { error: 'Failed to generate admin overview' });
  }
};
