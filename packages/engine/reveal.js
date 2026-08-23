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
// ── The three rules the mechanic has to obey ───────────────────────────────
//
// 1. NEVER GATE ON THE WHOLE CLASS. If the picture needed everybody to finish,
//    the slowest student would be visibly holding it up — which converts
//    private difficulty into public pressure and is worse than a leaderboard.
//    The tile count is small enough that the picture resolves well before the
//    last finder, so late finds add to a picture rather than unlock it.
//
// 2. NO ORDERING. Every solve uncovers exactly one tile, whoever made it and
//    whatever it was worth. A student who has found three things has uncovered
//    three tiles, the same as anyone else who found three. Points still exist
//    for the teacher's gradebook; they are not what the class sees.
//
// 3. STILL NAME PEOPLE. Removing all recognition trades one demotivator for
//    another. Tiles remember who uncovered them, and the feed says who found
//    what — but nothing is ranked.

/** Tiles in the picture. A 12x8 grid: enough to feel gradual, small enough to finish. */
export const REVEAL_COLUMNS = 12;
export const REVEAL_ROWS = 8;
export const REVEAL_TILES = REVEAL_COLUMNS * REVEAL_ROWS;

/**
 * A deterministic shuffle of 0..n-1, seeded by a string.
 *
 * The reveal has to look organic — tiles appearing across the picture rather
 * than filling in reading order — while being identical for every student
 * looking at the same class. So: no randomness, just a fixed permutation
 * derived from the pack id.
 */
export function tileOrder(seed, n = REVEAL_TILES) {
  // xorshift32, seeded from the string. Small, deterministic, and adequate:
  // this decides which square of a picture appears next, not anything secret.
  let state = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    state ^= ch.charCodeAt(0);
    state = Math.imul(state, 16777619) >>> 0;
  }
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
 * @param {string|null} viewer  The handle asking, so their own tiles are marked.
 * @returns {{
 *   tiles: Array<{index: number, handle: string, challengeId: string, mine: boolean}>,
 *   total: number, uncovered: number, complete: boolean,
 *   contributors: number, yours: number
 * }}
 */
export function buildReveal(solves, seed, viewer = null, total = REVEAL_TILES) {
  const order = tileOrder(seed, total);

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
  const tiles = [];
  const contributors = new Set();
  let yours = 0;

  for (const s of timed) {
    contributors.add(String(s.handle).toLowerCase());
    if (lower && String(s.handle).toLowerCase() === lower) yours += 1;
    // Past the last tile the picture is finished. The solve still counts for
    // the student and still shows in the feed; there is simply no square left.
    if (tiles.length >= total) continue;
    tiles.push({
      index: order[tiles.length],
      handle: s.handle,
      challengeId: s.challengeId,
      mine: lower ? String(s.handle).toLowerCase() === lower : false
    });
  }

  return {
    tiles,
    total,
    uncovered: tiles.length,
    complete: tiles.length >= total,
    contributors: contributors.size,
    yours
  };
}

/** Grid position of a tile, for drawing. */
export const tilePosition = (index, columns = REVEAL_COLUMNS) => ({
  col: index % columns,
  row: Math.floor(index / columns)
});
