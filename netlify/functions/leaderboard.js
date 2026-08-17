// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/leaderboard

import { listPlayers, getSolves } from './utils/store.js';
import { BADGE_DEFINITIONS, CHALLENGES } from '../../src/data/challenges.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

export default async (req) => {
  if (req.method !== 'GET') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const queryWindow = new URL(req.url).searchParams.get('window') || 'all';
  const isWeekly = queryWindow === 'week';
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  try {
    const players = await listPlayers();
    const rows = [];

    for (const p of players) {
      const solvesObj = await getSolves(p.handle);
      let score = 0;
      let solveCount = 0;
      const solvedIds = [];

      for (const [challengeId, s] of Object.entries(solvesObj)) {
        if (isWeekly && new Date(s.solvedAt).getTime() < oneWeekAgo) continue;
        score += Math.max(0, (s.points || 0) - (s.hintPenalty || 0));
        solveCount += 1;
        solvedIds.push(challengeId);
      }

      rows.push({
        handle: p.handle,
        score,
        solveCount,
        solves: solvedIds,
        lastSeen: p.last_seen
      });
    }

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.solveCount !== a.solveCount) return b.solveCount - a.solveCount;
      return new Date(a.lastSeen) - new Date(b.lastSeen);
    });

    const leaderboard = rows.slice(0, 50).map((player, idx) => {
      const earnedBadges = [];
      const solvedSet = new Set(player.solves);
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

    return json(200, {
        success: true,
        window: queryWindow,
        totalPlayers: players.length,
        leaderboard
      }, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return json(500, { error: 'Failed to fetch leaderboard' });
  }
};
