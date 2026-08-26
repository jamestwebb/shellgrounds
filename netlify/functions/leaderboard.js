// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/leaderboard?packId=&window=all|week
//
// Each pack is its own board. Omit packId for the combined board.

import { listPlayers, normalizeSolve, splitSolveKey, readAllSolves} from './utils/store.js';
import { PACKS } from '../../packs/index.js';
import { isPackEnabled } from './utils/enabled.js';
import { badgesEarned } from '../../packages/engine/badges.js';

// Badges come from whichever pack owns the solved challenge. Reading them from
// a single hardcoded module meant only one pack could ever award a badge, and
// students in the other two earned nothing.
//
// The RULE itself lives in packages/engine/badges.js, and is shared with the
// browser so the celebration a student sees and the badge on this board come
// from one place. This file used to carry its own copy. The two agreed on the
// day the copy was made, which is the only day two implementations of the same
// rule ever do.

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

    // Read every student's solves in parallel. One at a time is four hundred
    // sequential round trips for a class of two hundred, against a ten-second
    // function timeout.
    for (const { player: p, solves: solvesObj } of await readAllSolves(players)) {
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
      ? [PACKS[requestedPack]].filter(Boolean)
      : Object.values(PACKS);

    const leaderboard = rows.slice(0, 50).map((player, idx) => {
      const solvedSet = new Set(player.solves);
      const earnedBadges = applicable
        .flatMap(pack => badgesEarned(pack, solvedSet))
        .map(badge => badge.id);

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
