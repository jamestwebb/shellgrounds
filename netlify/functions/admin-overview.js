// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/admin-overview

import { verifySessionToken } from '../../src/engine/crypto-utils.js';
import { CHALLENGES } from '../../src/data/challenges.js';
import { initBlobs, listPlayers, getSolves } from './utils/store.js';

export const handler = async (event) => {
  initBlobs(event);
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server is not configured. Contact the instructor.' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  const handle = verified.handle;
  const adminHandles = (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);

  if (!adminHandles.includes(handle.toLowerCase())) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: Admin clearance required' })
    };
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

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,
        totalPlayers: players.length,
        challengeStats: Object.values(challengeStats),
        recentSolves: allSolves.slice(0, 20)
      })
    };
  } catch (err) {
    console.error('Admin overview error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate admin overview' })
    };
  }
};
