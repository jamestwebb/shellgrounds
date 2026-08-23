// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/admin-overview — the instructor's view.
//
//   ?packId=<id>                which module (default: the token's)
//   &view=overview|answers|student|triage
//   &handle=<student>           for view=student
//   &format=json|csv            csv exports the gradebook for that module
//
// view=answers is the answer key: canonical solution, every accepted variant,
// what the checker actually requires, and the hint ladder. It is admin-gated,
// though it is not a secret from a determined student — the challenge data is
// bundled into the client. It exists so a teacher can help someone in the room
// without hunting through JSON.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { getPack, PACKS, hasPack, DEFAULT_PACK_ID } from '../../packs/index.js';
import {
  listPlayers, getSolves, getHintsUsed, normalizeSolve, splitSolveKey, hintCountFor,
  readAllProgress
} from './utils/store.js';
import { resolveIsInstructor } from './utils/admin.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

// Solve keys are `<packId>/<challengeId>`; older records are the bare id. Ids
// are unique across packs, so a legacy record still belongs to exactly one.
function ownerOf(key) {
  const { packId, challengeId, legacy } = splitSolveKey(key);
  if (!legacy) return { packId, challengeId };
  const owner = Object.values(PACKS).find(p => p.challenges.some(c => c.id === challengeId));
  return { packId: owner?.id ?? null, challengeId };
}

function describeCheck(success) {
  if (!success) return 'none';
  const type = success.predicate || success.kind;
  switch (type) {
    case 'flag': return 'Submit the flag found in the filesystem';
    case 'commandMatches': return `Command must match /${success.pattern}/`;
    case 'outputMatches': return `Output must match /${success.pattern}/`;
    case 'outputContains': return `Output must contain "${success.text}"`;
    case 'outputEquals': return 'Output must equal the expected text exactly';
    case 'outputLineCountIs': return `Output must be ${success.n} lines`;
    case 'cwdIs': return `Must end up in ${success.path} (by actually moving there)`;
    case 'fileExists': return `File must exist: ${success.path}`;
    case 'dirExists': return `Directory must exist: ${success.path}`;
    case 'fileHasMode': return `File ${success.path} must have mode ${success.mode}`;
    case 'allOf': return `All of: ${(success.predicates || []).map(describeCheck).join('; ')}`;
    case 'anyOf': return `Any of: ${(success.predicates || []).map(describeCheck).join('; ')}`;
    default: return type || 'unknown';
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
  // Handles are restricted to [A-Za-z0-9_-] so this cannot trigger today, but
  // the export also carries free text, and the guard costs nothing.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default async (req) => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized' });
  if (!(await resolveIsInstructor(verified.handle))) {
    return json(403, { error: 'Forbidden: Admin clearance required' });
  }

  const url = new URL(req.url);
  const requested = url.searchParams.get('packId');
  const packId = hasPack(requested) ? requested : (verified.packId || DEFAULT_PACK_ID);
  const format = url.searchParams.get('format') || 'json';
  const view = url.searchParams.get('view') || 'overview';
  const pack = getPack(packId);

  try {
    // ---- the answer key -----------------------------------------------
    if (view === 'answers') {
      return json(200, {
        success: true,
        packId: pack.id,
        packName: pack.manifest.name,
        acts: pack.manifest.acts,
        challenges: pack.challenges.map(c => ({
          id: c.id,
          act: c.act,
          title: c.title,
          points: c.points,
          platform: c.platform || pack.manifest.platforms?.[0] || 'linux',
          brief: c.brief,
          solution: c.solution || (c.acceptedVariants || [])[0] || null,
          acceptedVariants: c.acceptedVariants || [],
          check: describeCheck(c.success),
          hints: (c.hints || []).map((h, i) => ({ index: i, cost: h.cost || 0, text: h.text ?? h.hint ?? '' })),
          successMessage: c.successMessage || null
        }))
      }, { 'Cache-Control': 'no-store' });
    }

    const players = await listPlayers();

    // ---- who needs help, in ONE request --------------------------------
    //
    // The dashboard needs, for every student, which challenges they are stuck
    // on. Without this it had to fetch view=student once per student — an N+1
    // on every pack switch, for the panel the teacher looks at first.
    if (view === 'triage') {
      const rows = [];
      // Two reads per student, in parallel. Serially this was the slowest panel
      // in the console for exactly the class that most needs it: a big one.
      for (const { player: p, solves: solvesObj, hints: hintsObj } of await readAllProgress(players)) {
        const solved = new Set();
        for (const key of Object.keys(solvesObj)) {
          const o = ownerOf(key);
          if (o.packId === pack.id) solved.add(o.challengeId);
        }
        const struggling = [];
        for (const c of pack.challenges) {
          if (solved.has(c.id)) continue;
          const total = (c.hints || []).length;
          if (total > 0 && hintCountFor(hintsObj, pack.id, c.id) >= total) {
            struggling.push({ id: c.id, act: c.act, title: c.title });
          }
        }
        const frontier = pack.challenges.find(c => !solved.has(c.id)) || null;
        rows.push({
          handle: p.handle,
          solvedCount: solved.size,
          started: solved.size > 0,
          struggling,
          frontier: frontier && { id: frontier.id, act: frontier.act, title: frontier.title }
        });
      }
      rows.sort((a, b) =>
        (b.struggling.length - a.struggling.length) || (a.solvedCount - b.solvedCount));
      return json(200, {
        success: true,
        packId: pack.id,
        packName: pack.manifest.name,
        totalChallenges: pack.challenges.length,
        registered: players.length,
        participants: rows.filter(r => r.started).length,
        students: rows
      }, { 'Cache-Control': 'no-store' });
    }

    // ---- one student, in detail ---------------------------------------
    if (view === 'student') {
      const who = (url.searchParams.get('handle') || '').toLowerCase();
      if (!who) return json(400, { error: 'A handle is required for view=student' });
      if (!players.some(p => p.handle.toLowerCase() === who)) {
        return json(404, { error: `No student named '${who}'` });
      }

      const solvesObj = await getSolves(who);
      const hintsObj = await getHintsUsed(who);
      const solvedHere = new Set();
      for (const key of Object.keys(solvesObj)) {
        const o = ownerOf(key);
        if (o.packId === pack.id) solvedHere.add(o.challengeId);
      }

      const perChallenge = pack.challenges.map(c => ({
        id: c.id,
        act: c.act,
        title: c.title,
        points: c.points,
        solved: solvedHere.has(c.id),
        hintsOpened: hintCountFor(hintsObj, pack.id, c.id),
        totalHints: (c.hints || []).length
      }));

      // Where to start the conversation: the first unsolved challenge, and any
      // challenge where they have opened every hint and still not solved it.
      const frontier = perChallenge.find(c => !c.solved) || null;
      const struggling = perChallenge.filter(
        c => !c.solved && c.totalHints > 0 && c.hintsOpened >= c.totalHints
      );

      return json(200, {
        success: true,
        packId: pack.id,
        handle: who,
        solvedCount: solvedHere.size,
        totalChallenges: pack.challenges.length,
        frontier,
        struggling,
        challenges: perChallenge
      }, { 'Cache-Control': 'no-store' });
    }

    // ---- class overview ------------------------------------------------
    const challengeStats = {};
    pack.challenges.forEach(c => {
      challengeStats[c.id] = {
        id: c.id, title: c.title, act: c.act, points: c.points,
        solveCount: 0, totalHintsUsed: 0, stuckCount: 0
      };
    });

    const allSolves = [];
    const playerSummaries = [];
    // listPlayers() is server-wide, so "students registered" is every handle on
    // the site. A solve rate against that reads falsely low for a module most
    // of the class has not opened yet. Count who actually started this one.
    let participants = 0;

    for (const { player: p, solves: solvesObj, hints: hintsObj } of await readAllProgress(players)) {
      let playerPoints = 0;
      let solveCount = 0;
      let lastActive = null;
      const solvedHere = new Set();

      for (const [key, raw] of Object.entries(solvesObj)) {
        const { packId: owner, challengeId } = ownerOf(key);
        if (owner !== pack.id) continue;

        // Never read .points off a raw record: legacy records nest the payload
        // one level down and the arithmetic returns NaN, which poisons the
        // student's whole total and the CSV column with it.
        const s = normalizeSolve(raw);
        solvedHere.add(challengeId);

        if (challengeStats[challengeId]) {
          challengeStats[challengeId].solveCount++;
          if (s.hintPenalty > 0) challengeStats[challengeId].totalHintsUsed++;
        }
        playerPoints += s.netPoints;
        solveCount++;
        if (!lastActive || new Date(s.solvedAt) > new Date(lastActive)) lastActive = s.solvedAt;
        allSolves.push({ handle: p.handle, challengeId, solvedAt: s.solvedAt });
      }

      // "Stuck" = every hint opened, still unsolved. That is the signal a
      // teacher actually wants: who to walk over to, and about what.
      for (const c of pack.challenges) {
        if (solvedHere.has(c.id)) continue;
        const total = (c.hints || []).length;
        if (total > 0 && hintCountFor(hintsObj, pack.id, c.id) >= total) {
          challengeStats[c.id].stuckCount++;
        }
      }

      if (solvedHere.size > 0) participants += 1;

      playerSummaries.push({
        handle: p.handle,
        totalScore: playerPoints,
        solvesCount: solveCount,
        // store.js writes created_at; the old camelCase key never existed.
        lastActive: lastActive || p.created_at || 'N/A'
      });
    }

    allSolves.sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
    playerSummaries.sort((a, b) => b.totalScore - a.totalScore);

    if (format === 'csv') {
      let csv = 'Handle,Total Score,Solves Count,Last Active\r\n';
      for (const ps of playerSummaries) {
        csv += [csvCell(ps.handle), ps.totalScore, ps.solvesCount, csvCell(ps.lastActive)].join(',') + '\r\n';
      }
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="gradebook-${pack.id}.csv"`,
          'Cache-Control': 'no-store'
        }
      });
    }

    const stats = Object.values(challengeStats);
    return json(200, {
      success: true,
      packId: pack.id,
      packName: pack.manifest.name,
      totalPlayers: players.length,
      participants,
      playerSummaries,
      challengeStats: stats,
      // What to reteach on Monday: most students stuck, fewest solves.
      classStuckOn: stats.filter(c => c.stuckCount > 0)
        .sort((a, b) => b.stuckCount - a.stuckCount).slice(0, 5),
      recentSolves: allSolves.slice(0, 25)
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Admin overview error:', err);
    return json(500, { error: 'Failed to generate admin overview' });
  }
};
