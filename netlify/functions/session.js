// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/session

import { verifySessionToken, createSessionToken } from '../../src/engine/crypto-utils.js';
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
      body: JSON.stringify({ error: 'Invalid or expired session token' })
    };
  }

  const handle = verified.handle;
  // No default admin handles: an unset ADMIN_HANDLES means no admins, not guessable ones.
  const adminHandles = (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminHandles.includes(handle.toLowerCase());

  try {
    const db = await getDb();
    let solves = [];
    let totalScore = 0;

    if (db.mode === 'neon') {
      const rows = await db.sql`
        SELECT s.challenge_id, s.points, s.hint_penalty, s.solved_at
        FROM solves s
        JOIN players p ON s.player_id = p.id
        WHERE LOWER(p.handle) = LOWER(${handle})
      `;

      solves = rows.map(r => ({
        challengeId: r.challenge_id,
        points: r.points,
        hintPenalty: r.hint_penalty,
        netPoints: r.points - r.hint_penalty,
        solvedAt: r.solved_at
      }));
    } else {
      const lower = handle.toLowerCase();
      const player = db.store.players.get(lower);
      if (player) {
        for (const [key, solve] of db.store.solves.entries()) {
          if (solve.player_id === player.id) {
            solves.push({
              challengeId: solve.challenge_id,
              points: solve.points,
              hintPenalty: solve.hint_penalty,
              netPoints: solve.points - solve.hint_penalty,
              solvedAt: solve.solved_at
            });
          }
        }
      }
    }

    totalScore = solves.reduce((sum, s) => sum + s.netPoints, 0);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,
        handle,
        isAdmin,
        solves,
        totalScore,
        // Rolling refresh: handles cannot be re-registered, so the session must not
        // hard-expire for any student who visits at least once every 72 hours.
        token: createSessionToken(sessionSecret, handle)
      })
    };
  } catch (err) {
    console.error('Session retrieval error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to retrieve session data' })
    };
  }
};
