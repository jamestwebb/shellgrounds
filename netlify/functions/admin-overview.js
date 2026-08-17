// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/admin-overview

import { verifySessionToken } from '../../src/engine/crypto-utils.js';
import { CHALLENGES } from '../../src/data/challenges.js';
import { getDb } from './utils/db.js';

export const handler = async (event) => {
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
    const db = await getDb();
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

    let totalPlayers = 0;
    let recentSolves = [];

    if (db.mode === 'neon') {
      const players = await db.sql`SELECT COUNT(*)::int as count FROM players`;
      totalPlayers = players[0]?.count || 0;

      const solves = await db.sql`
        SELECT s.challenge_id, s.hint_penalty, s.solved_at, p.handle
        FROM solves s
        JOIN players p ON s.player_id = p.id
        ORDER BY s.solved_at DESC
      `;

      solves.forEach(s => {
        if (challengeStats[s.challenge_id]) {
          challengeStats[s.challenge_id].solveCount++;
          if (s.hint_penalty > 0) challengeStats[s.challenge_id].totalHintsUsed++;
        }
      });

      recentSolves = solves.slice(0, 20).map(s => ({
        handle: s.handle,
        challengeId: s.challenge_id,
        solvedAt: s.solved_at
      }));
    } else {
      totalPlayers = db.store.players.size;
      for (const [key, solve] of db.store.solves.entries()) {
        if (challengeStats[solve.challenge_id]) {
          challengeStats[solve.challenge_id].solveCount++;
          if (solve.hint_penalty > 0) challengeStats[solve.challenge_id].totalHintsUsed++;
        }
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,
        totalPlayers,
        challengeStats: Object.values(challengeStats),
        recentSolves
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
