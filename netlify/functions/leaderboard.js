// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/leaderboard

import { listPlayers, getSolves, normalizeSolve } from './utils/store.js';
import { PACKS } from '../../packs/index.js';

// Badges were read from a single superseded challenge module, so only the
// forensics pack could ever award one and students in the other two packs
// earned nothing. Each pack defines its own badges in its pack.json; award
// from whichever pack a solved challenge id belongs to. Solve records are not
// pack-scoped yet, and challenge ids are unique across packs, so intersecting
// per pack is both correct and cheap.
const BADGE_RULES = Object.values(PACKS).flatMap(pack =>
  (pack.manifest.badges || [])
    .filter(b => b.act)
    .map(b => ({
      id: b.id,
      required: pack.challenges.filter(c => c.act === b.act).map(c => c.id)
    }))
    .filter(rule => rule.required.length > 0)
);

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

      for (const [challengeId, raw] of Object.entries(solvesObj)) {
        const s = normalizeSolve(raw);
        if (isWeekly && new Date(s.solvedAt).getTime() < oneWeekAgo) continue;
        score += s.netPoints;
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
      const solvedSet = new Set(player.solves);
      const earnedBadges = BADGE_RULES
        .filter(rule =>
          rule.required.filter(id => solvedSet.has(id)).length >= Math.ceil(rule.required.length * 0.8))
        .map(rule => rule.id);

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
