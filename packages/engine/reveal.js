// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The cooperative reveal: one picture, uncovered by the whole class.
//
// ── Why this exists beside a leaderboard rather than on top of one ──────────
//
// Cooperative learning outperforms competition on two conditions, not one:
// positive interdependence (my success is tied to yours) AND individual
// accountability (my own contribution is visible and cannot be faked). Group
// work with only the first produces free-riding, which is why "make it
// collaborative" so often disappoints.
//
// Shellgrounds already had the half that is usually missing. A find is derived
// from the student's own handle and graded by server-side replay, so nobody can
// ride along on somebody else's work. This adds the other half.
//
// ── Why the picture is measured in AREA, not in squares ────────────────────
//
// The first version had a fixed 96 squares, which is wrong at both ends. One
// learner working alone would need 96 finds out of a 44-challenge pack and
// could never finish. A class of 25 would fill it in the first ten minutes of
// the first lesson, after which the thing meant to represent a term's shared
// work sat there completed.
//
// So the target scales with the class, and progress is a FRACTION of the
// picture rather than a count of squares. That separates two questions which
// were tangled together:
//
//   How much is uncovered?   n finds / target, where target scales with the roster.
//   How is it drawn?         a grid chosen so one find is roughly one square.
//
// Because progress is area, the grid can change without the picture stepping
// backwards: 40% of the image is 38 of 96 squares or 154 of 384, and both look
// like the same 40%.
//
// ── Two things that could step backwards, and both are guarded ─────────────
//
// AREA. The target grows with the roster, so a second section registering in
// week five would raise the denominator and shrink the fraction. A class
// watching its picture RE-COVER because more people joined would be a bizarre
// and demoralising thing to ship. `floorFraction` is the guard: the caller
// passes the highest fraction ever reached, and the picture never goes below it.
//
// PARTICULAR SQUARES. A third-party review caught the second one, which the
// area guard does not cover. The grid is chosen from the target, so a growing
// class crosses a threshold and moves from 24 squares to 216 — and the
// permutation for 216 is an entirely different sequence. The same 40% of the
// picture would be showing, but through different holes: squares a student
// watched open would visibly shut again.
//
// The guard is `pinnedGrid`. The first time a class uncovers anything, the
// grid it was drawn on is recorded and reused for the rest of the term. A
// class that grows a great deal keeps a coarser grid, so each square comes to
// stand for several finds — which the screen says plainly. That is a much
// smaller cost than a picture that visibly un-paints itself.

/** Squares are only ever the drawing. These are the 3:2 grids available. */
export const GRID_LADDER = [
  { columns: 6,  rows: 4  },   //   24
  { columns: 9,  rows: 6  },   //   54
  { columns: 12, rows: 8  },   //   96
  { columns: 18, rows: 12 },   //  216
  { columns: 24, rows: 16 },   //  384
  { columns: 36, rows: 24 }    //  864 — the cap, past which squares are specks
];

/**
 * Roughly what share of a course a class should get through before the picture
 * is finished. Under half: the reveal is a thing that happens along the way,
 * not a finish line, and a class that completes it in week nine still has work
 * that counts for the rest of term.
 */
export const COURSE_SHARE = 0.45;

/** A solo learner still needs a picture that moves and can be finished. */
export const MIN_TARGET = 20;

/** Past this, one more find moves nothing visible, so there is no point counting higher. */
export const MAX_TARGET = 4000;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * How many finds fill the picture.
 *
 * Scales with the roster rather than with how many people have started, because
 * "started" shrinks the target when a class is quiet and would make the picture
 * lurch forward on a slow day and back on a busy one.
 *
 * @param {number} roster      registered students
 * @param {number} challenges  challenges in this pack
 */
export function revealTarget(roster, challenges) {
  const perStudent = Math.max(6, Math.ceil((Number(challenges) || 20) * COURSE_SHARE));
  const people = Math.max(1, Number(roster) || 1);
  return clamp(people * perStudent, MIN_TARGET, MAX_TARGET);
}

/**
 * The grid to draw on: fine enough that one find is about one square, coarse
 * enough that a square is still a square.
 *
 * @param {number} target
 * @param {{columns: number, rows: number}|null} pinned  a grid already in use
 *        for this class. Honoured if it is one of the ladder's, because
 *        changing grid mid-term re-covers squares that were already open.
 */
export function revealGrid(target, pinned = null) {
  if (pinned) {
    const match = GRID_LADDER.find(g => g.columns === pinned.columns && g.rows === pinned.rows);
    if (match) return { ...match, tiles: match.columns * match.rows };
  }
  let chosen = GRID_LADDER[0];
  for (const g of GRID_LADDER) {
    if (g.columns * g.rows <= target) chosen = g;
  }
  return { ...chosen, tiles: chosen.columns * chosen.rows };
}

/**
 * A deterministic shuffle of 0..n-1, seeded by a string.
 *
 * The reveal has to look organic — squares appearing across the picture rather
 * than filling in reading order — while being identical for every student
 * looking at the same class. So: no randomness, a fixed permutation derived
 * from the pack id.
 */
export function tileOrder(seed, n) {
  // xorshift32, seeded from the string. Small, deterministic, and adequate:
  // this decides which square of a picture appears next, nothing secret.
  let state = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    state ^= ch.charCodeAt(0);
    state = Math.imul(state, 16777619) >>> 0;
  }
  // xorshift32 has one fixed point: zero maps to zero for ever, and the shuffle
  // would degenerate into a rotation that fills the picture almost in reading
  // order. Reaching it needs an FNV-1a hash of exactly zero, which is about one
  // pack id in four billion — a one-line guard against a bug nobody would ever
  // reproduce, and would never work out from the symptom.
  if (state === 0) state = 0x9e3779b9;

  const next = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;  state >>>= 0;
    return state;
  };

  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Turns the class's solves into the picture's state.
 *
 * @param {Array<{handle: string, challengeId: string, solvedAt: string}>} solves
 *        Every solve in this pack, from every student. Order does not matter.
 * @param {string} seed  Usually the pack id.
 * @param {object} opts
 * @param {string|null} opts.viewer      the handle asking, so their squares are marked
 * @param {number} opts.roster           registered students, for the target
 * @param {number} opts.challenges       challenges in this pack, for the target
 * @param {number} opts.floorFraction    the highest fraction ever reached, so the
 *                                       picture can never step backwards
 */
export function buildReveal(solves, seed, opts = {}) {
  const {
    viewer = null,
    roster = 1,
    challenges = 20,
    floorFraction = 0,
    pinnedGrid = null
  } = opts;

  const target = revealTarget(roster, challenges);
  const grid = revealGrid(target, pinnedGrid);

  // Oldest first, so the picture uncovers in the order the class actually
  // worked. A solve with no usable timestamp sorts last rather than throwing
  // the whole sequence out — it still counts, it just does not jump the queue.
  const timed = solves
    .map(s => ({ ...s, ms: Date.parse(s.solvedAt) }))
    .sort((a, b) => {
      const av = Number.isFinite(a.ms) ? a.ms : Infinity;
      const bv = Number.isFinite(b.ms) ? b.ms : Infinity;
      if (av !== bv) return av - bv;
      return String(a.handle).localeCompare(String(b.handle));
    });

  const lower = viewer ? String(viewer).toLowerCase() : null;
  const contributors = new Set();
  let yours = 0;
  for (const s of timed) {
    contributors.add(String(s.handle).toLowerCase());
    if (lower && String(s.handle).toLowerCase() === lower) yours += 1;
  }

  const fraction = Math.min(1, Math.max(clamp(floorFraction, 0, 1), timed.length / target));
  const open = Math.floor(fraction * grid.tiles);
  const order = tileOrder(seed, grid.tiles);

  // Which find turned which square. With more finds than squares each square
  // stands for several; with fewer, some finds have not yet turned one. Either
  // way a square names a real person, because "somebody did this" is the part
  // that makes the picture worth looking at.
  const tiles = [];
  for (let j = 0; j < open; j++) {
    const at = timed.length
      ? Math.min(timed.length - 1, Math.floor(((j + 0.5) / grid.tiles) * timed.length))
      : -1;
    const s = at >= 0 ? timed[at] : null;
    tiles.push({
      index: order[j],
      handle: s ? s.handle : null,
      challengeId: s ? s.challengeId : null,
      mine: s && lower ? String(s.handle).toLowerCase() === lower : false
    });
  }

  return {
    tiles,
    columns: grid.columns,
    rows: grid.rows,
    total: grid.tiles,
    uncovered: tiles.length,
    fraction,
    // What it takes to finish, and how far the class has got. Shown as "142 of
    // 500 finds", which is honest about the goal in a way "38 of 96 squares"
    // was not once the squares stopped being one-per-find.
    target,
    finds: timed.length,
    complete: fraction >= 1,
    contributors: contributors.size,
    yours
  };
}
