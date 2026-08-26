// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// A sample class, for the instructor console on the public demo.
//
// The instructor console is the screen that decides whether a teacher adopts
// this: who is stuck, where the hints are going, what to reteach on Monday. A
// visitor to the demo could only ever see the student half, which is the half
// they already understand.
//
// Three things this deliberately is NOT:
//
//   It is not the demo's real data. A public site's real instructor view is
//   whatever strangers happened to do in the last hour, which is usually two
//   people who typed `ls` once. That demonstrates nothing.
//
//   It is not random. Every student's progress is derived from a hash of their
//   handle, so the class looks identical on every reload and on every visitor's
//   screen. A demo that reshuffles while you read it feels broken.
//
//   It is not writable. Nothing here reaches a server, and the console renders
//   with its one write path removed. See `preview` in AdminOverview.
//
// The spread is chosen to show the console doing its job: a few students
// finished, most mid-course, two barely started, and several stuck in the
// specific way the console is built to surface -- every hint opened, still
// unsolved.

import { PACKS, DEFAULT_PACK_ID } from '../../packs/index.js';

/** Names that read like a class register rather than like test fixtures. */
const CLASS = [
  'mara_k', 'j_ito', 'Hassan', 'Cassandra', 'ade_o', 'liu_wei', 'Michelle',
  'tomas99', 'noor_s', 'priya-r', 'Danielle', 'kofi_a', 'sam_ng', 'ELENA'
];

/** Stable 0..1 from a string. Same handle, same progress, every time. */
function paceOf(handle) {
  let h = 2166136261;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const DAY = 86_400_000;
/** Fixed at module load, so timestamps do not drift while somebody reads. */
const NOW = Date.now();

function packFor(packId) {
  return PACKS[packId] || PACKS[DEFAULT_PACK_ID];
}

/** Challenges in the order a student meets them. */
function ordered(pack) {
  return [...pack.challenges].sort((a, b) => (a.act || 0) - (b.act || 0));
}

/**
 * One student's state: what they solved, what they are stuck on, and where
 * they stopped. Derived, never stored.
 */
function stateFor(pack, handle) {
  const list = ordered(pack);
  const pace = paceOf(handle);
  const solvedCount = Math.round(pace * list.length);
  const solved = new Set(list.slice(0, solvedCount).map(c => c.id));

  // Stuck = every hint opened and still not solved. Two students past the
  // frontier are stuck on something they skipped, which is the case a teacher
  // most wants surfaced and the one a simple "next unsolved" view hides.
  const struggling = [];
  const stuckAt = Math.floor(pace * 7);
  for (const [i, c] of list.entries()) {
    if (solved.has(c.id)) continue;
    if ((c.hints || []).length === 0) continue;
    if ((i + stuckAt) % 11 === 0) struggling.push({ id: c.id, act: c.act, title: c.title });
    if (struggling.length >= 3) break;
  }

  const frontier = list.find(c => !solved.has(c.id)) || null;
  const points = list.filter(c => solved.has(c.id)).reduce((n, c) => n + (c.points || 0), 0);
  const lastActive = new Date(NOW - Math.round((1 - pace) * 6 + 0.2) * DAY).toISOString();

  return { list, solved, solvedCount, struggling, frontier, points, lastActive };
}

/**
 * Stands in for fetchAdminOverview on the demo. Same shapes the real endpoint
 * returns, so the console needs no special cases for any of it.
 */
export function demoAdminOverview(packId, { view, handle } = {}) {
  const pack = packFor(packId);
  const list = ordered(pack);
  const people = CLASS.map(h => ({ handle: h, ...stateFor(pack, h) }));

  if (view === 'answers') {
    return {
      success: true,
      packId: pack.id,
      packName: pack.manifest.name,
      acts: pack.manifest.acts,
      challenges: list.map(c => ({
        id: c.id, act: c.act, title: c.title, points: c.points,
        platform: c.platform || pack.manifest.platforms?.[0] || 'linux',
        brief: c.brief,
        solution: c.solution || (c.acceptedVariants || [])[0] || null,
        acceptedVariants: c.acceptedVariants || [],
        check: c.success?.kind === 'flag' ? 'Submits a find' : 'Runs a command',
        hints: (c.hints || []).map((h, i) => ({ index: i, cost: h.cost || 0, text: h.text ?? '' })),
        successMessage: c.successMessage || null
      }))
    };
  }

  if (view === 'class') {
    return {
      success: true,
      packId: pack.id,
      packName: pack.manifest.name,
      totalChallenges: list.length,
      registered: people.length,
      participants: people.filter(p => p.solvedCount > 0).length,
      students: [...people]
        .sort((a, b) => (b.struggling.length - a.struggling.length) || (a.solvedCount - b.solvedCount))
        .map(p => ({
          handle: p.handle,
          solvedCount: p.solvedCount,
          started: p.solvedCount > 0,
          struggling: p.struggling,
          frontier: p.frontier && { id: p.frontier.id, act: p.frontier.act, title: p.frontier.title }
        }))
    };
  }

  if (view === 'student') {
    const who = String(handle || '').toLowerCase();
    const p = people.find(x => x.handle.toLowerCase() === who) || people[0];
    return {
      success: true,
      packId: pack.id,
      handle: p.handle,
      solvedCount: p.solvedCount,
      totalChallenges: list.length,
      frontier: p.frontier && { id: p.frontier.id, act: p.frontier.act, title: p.frontier.title },
      struggling: p.struggling,
      challenges: list.map(c => ({
        id: c.id, act: c.act, title: c.title, points: c.points,
        solved: p.solved.has(c.id),
        hintsUsed: p.struggling.some(s => s.id === c.id) ? (c.hints || []).length : 0,
        solvedAt: p.solved.has(c.id) ? p.lastActive : null
      }))
    };
  }

  // Default: the class overview.
  const stats = list.map(c => {
    const solveCount = people.filter(p => p.solved.has(c.id)).length;
    const stuckCount = people.filter(p => p.struggling.some(s => s.id === c.id)).length;
    return {
      id: c.id, title: c.title, act: c.act, points: c.points,
      solveCount, stuckCount,
      totalHintsUsed: stuckCount * (c.hints || []).length
    };
  });

  const recentSolves = people
    .flatMap(p => [...p.solved].slice(-2).map(id => ({
      handle: p.handle, challengeId: id, solvedAt: p.lastActive
    })))
    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt))
    .slice(0, 25);

  return {
    success: true,
    packId: pack.id,
    packName: pack.manifest.name,
    totalPlayers: people.length,
    participants: people.filter(p => p.solvedCount > 0).length,
    playerSummaries: [...people]
      .sort((a, b) => b.points - a.points)
      .map(p => ({
        handle: p.handle,
        totalScore: p.points,
        solvesCount: p.solvedCount,
        lastActive: p.lastActive
      })),
    challengeStats: stats,
    classStuckOn: stats.filter(c => c.stuckCount > 0)
      .sort((a, b) => b.stuckCount - a.stuckCount).slice(0, 5),
    recentSolves
  };
}

/** The site config screen, with every course on, and never saveable here. */
export function demoSiteConfig() {
  return {
    success: true,
    configured: true,
    enabledPacks: Object.keys(PACKS),
    classView: 'reveal'
  };
}
