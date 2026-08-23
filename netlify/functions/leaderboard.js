// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/leaderboard?packId=&window=all|week
//
// Each pack is its own board. Omit packId for the combined board.

import { listPlayers, getSolves, normalizeSolve, splitSolveKey } from './utils/store.js';
import { PACKS } from '../../packs/index.js';
import { isPackEnabled } from './utils/enabled.js';

// Badges come from whichever pack owns the solved challenge. Reading them from
// a single hardcoded module meant only one pack could ever award a badge, and
// students in the other two earned nothing.
const BADGE_RULES = Object.values(PACKS).flatMap(pack =>
  (pack.manifest.badges || [])
    .filter(b => b.act)
    .map(b => ({
      id: b.id,
      packId: pack.id,
      name: b.name,
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

  const params = new URL(req.url).searchParams;
  const queryWindow = params.get('window') || 'all';
  const requestedPack = params.get('packId');
  // A pack the teacher switched off answers exactly like one that was never
  // written. Two different messages would tell a student which is which.
  if (requestedPack && !(await isPackEnabled(requestedPack))) {
    return json(404, { error: `Unknown pack '${requestedPack}'` });
  }
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

      for (const [key, raw] of Object.entries(solvesObj)) {
        const { packId, challengeId, legacy } = splitSolveKey(key);
        // A legacy record predates pack scoping. Ids are unique across packs,
        // so it still belongs to exactly one pack; find it rather than drop it.
        const owner = legacy
          ? Object.values(PACKS).find(pk => pk.challenges.some(c => c.id === challengeId))?.id
          : packId;
        if (requestedPack && owner !== requestedPack) continue;

        const s = normalizeSolve(raw);
        // A record with no usable timestamp cannot be proven to fall inside the
        // week. NaN fails every comparison, so `< oneWeekAgo` was false and the
        // record slipped onto the weekly board. Test for the window.
        const solvedMs = new Date(s.solvedAt).getTime();
        if (isWeekly && !(solvedMs >= oneWeekAgo)) continue;

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

    const applicable = requestedPack
      ? BADGE_RULES.filter(r => r.packId === requestedPack)
      : BADGE_RULES;

    const leaderboard = rows.slice(0, 50).map((player, idx) => {
      const solvedSet = new Set(player.solves);
      const earnedBadges = applicable
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
      packId: requestedPack || null,
      window: queryWindow,
      totalPlayers: players.length,
      leaderboard
    }, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return json(500, { error: 'Failed to fetch leaderboard' });
  }
};
