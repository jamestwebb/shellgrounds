// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/leaderboard

import { getDb } from './utils/db.js';
import { BADGE_DEFINITIONS, CHALLENGES } from '../../src/data/challenges.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const queryWindow = event.queryStringParameters?.window || 'all';
  const isWeekly = queryWindow === 'week';

  try {
    const db = await getDb();
    const playerScores = new Map(); // playerId -> { handle, score, solveCount, solves: [], lastSeen }

    if (db.mode === 'neon') {
      let query;
      if (isWeekly) {
        query = await db.sql`
          SELECT p.id, p.handle, p.last_seen, s.challenge_id, s.points, s.hint_penalty, s.solved_at
          FROM players p
          JOIN solves s ON s.player_id = p.id
          WHERE s.solved_at >= NOW() - INTERVAL '7 days'
        `;
      } else {
        query = await db.sql`
          SELECT p.id, p.handle, p.last_seen, s.challenge_id, s.points, s.hint_penalty, s.solved_at
          FROM players p
          JOIN solves s ON s.player_id = p.id
        `;
      }

      // Also get players with 0 solves
      const allPlayers = await db.sql`SELECT id, handle, last_seen FROM players`;
      allPlayers.forEach(p => {
        playerScores.set(p.id, {
          id: p.id,
          handle: p.handle,
          score: 0,
          solveCount: 0,
          solves: [],
          lastSeen: p.last_seen
        });
      });

      query.forEach(row => {
        const p = playerScores.get(row.id);
        if (p) {
          const net = Math.max(0, row.points - row.hint_penalty);
          p.score += net;
          p.solveCount += 1;
          p.solves.push(row.challenge_id);
        }
      });
    } else {
      // Memory store
      const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

      for (const [lower, player] of db.store.players.entries()) {
        playerScores.set(player.id, {
          id: player.id,
          handle: player.handle,
          score: 0,
          solveCount: 0,
          solves: [],
          lastSeen: player.last_seen
        });
      }

      for (const [key, solve] of db.store.solves.entries()) {
        if (isWeekly && new Date(solve.solved_at) < oneWeekAgo) {
          continue;
        }
        const p = playerScores.get(solve.player_id);
        if (p) {
          const net = Math.max(0, solve.points - solve.hint_penalty);
          p.score += net;
          p.solveCount += 1;
          p.solves.push(solve.challenge_id);
        }
      }
    }

    // Convert map to sorted array
    const sorted = Array.from(playerScores.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.solveCount !== a.solveCount) return b.solveCount - a.solveCount;
      return new Date(a.lastSeen) - new Date(b.lastSeen);
    });

    // Assign ranks and badges
    const leaderboard = sorted.slice(0, 50).map((player, idx) => {
      const earnedBadges = [];
      const solvedSet = new Set(player.solves);

      // Check badges for this player
      BADGE_DEFINITIONS.forEach(b => {
        if (b.act) {
          const actChallenges = CHALLENGES.filter(c => c.act === b.act);
          const solvedInAct = actChallenges.filter(c => solvedSet.has(c.id));
          if (actChallenges.length > 0 && solvedInAct.length >= Math.ceil(actChallenges.length * 0.8)) {
            earnedBadges.push(b.id);
          }
        }
      });

      return {
        rank: idx + 1,
        handle: player.handle,
        score: player.score,
        solveCount: player.solveCount,
        badges: earnedBadges,
        lastSeen: player.lastSeen
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=30'
      },
      body: JSON.stringify({
        success: true,
        window: queryWindow,
        totalPlayers: playerScores.size,
        leaderboard
      })
    };
  } catch (err) {
    console.error('Leaderboard error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch leaderboard' })
    };
  }
};
