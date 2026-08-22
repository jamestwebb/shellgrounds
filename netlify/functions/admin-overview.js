// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/admin-overview (Includes Gradebook CSV Export)

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { getPack, DEFAULT_PACK_ID } from '../../packs/index.js';
import { listPlayers, getSolves, normalizeSolve } from './utils/store.js';
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
    return json(401, { error: 'Unauthorized' });
  }

  const handle = verified.handle;
  if (!isAdminHandle(handle)) {
    return json(403, { error: 'Forbidden: Admin clearance required' });
  }

  const url = new URL(req.url);
  const packId = url.searchParams.get('packId') || verified.packId || DEFAULT_PACK_ID;
  const format = url.searchParams.get('format') || 'json';
  const pack = getPack(packId);

  try {
    const challengeStats = {};
    pack.challenges.forEach(c => {
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
    const playerSummaries = [];

    for (const p of players) {
      const solvesObj = await getSolves(p.handle);
      let playerPoints = 0;
      let solveCount = 0;
      let lastActive = null;

      for (const [cId, raw] of Object.entries(solvesObj)) {
        // Never read .points off a raw record. Legacy records nest the whole
        // payload one level down, so the arithmetic returns NaN and one bad
        // record poisons the student's entire total and the CSV column.
        // normalizeSolve is the only safe reader; see store.js.
        const s = normalizeSolve(raw);
        if (challengeStats[cId]) {
          challengeStats[cId].solveCount++;
          if (s.hintPenalty > 0) challengeStats[cId].totalHintsUsed++;
        }
        playerPoints += s.netPoints;
        solveCount++;
        if (!lastActive || new Date(s.solvedAt) > new Date(lastActive)) {
          lastActive = s.solvedAt;
        }
        allSolves.push({ handle: p.handle, challengeId: cId, solvedAt: s.solvedAt });
      }

      playerSummaries.push({
        handle: p.handle,
        totalScore: playerPoints,
        solvesCount: solveCount,
        // store.js writes created_at. The old camelCase key never existed,
        // so this fallback could never fire.
        lastActive: lastActive || p.created_at || 'N/A'
      });
    }

    allSolves.sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
    playerSummaries.sort((a, b) => b.totalScore - a.totalScore);

    // CSV Export for Canvas / Blackboard gradebooks
    if (format === 'csv') {
      let csv = 'Handle,Total Score,Solves Count,Last Active\r\n';
      for (const ps of playerSummaries) {
        csv += `"${ps.handle}",${ps.totalScore},${ps.solvesCount},"${ps.lastActive}"\r\n`;
      }
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gauntlet-gradebook-${pack.id}.csv"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    return json(200, {
      success: true,
      packId: pack.id,
      totalPlayers: players.length,
      playerSummaries,
      challengeStats: Object.values(challengeStats),
      recentSolves: allSolves.slice(0, 25)
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Admin overview error:', err);
    return json(500, { error: 'Failed to generate admin overview' });
  }
};
