// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Which badges a set of solves has earned.
//
// A pack declares its badges in pack.json. Each one that names an `act` is
// earned by finishing most of that act -- most, not all, because the same
// eighty-percent threshold that unlocks the next act decides this. A student
// stuck on one challenge in an act still gets the badge for the act, for the
// same reason they are still allowed to move on from it.
//
// This rule was written once, inline, inside netlify/functions/leaderboard.js,
// where it decided which badges sit next to a handle on the board. Nothing in
// the browser could reach it, so the browser could not tell the moment a badge
// was earned from any other moment, and the student found out later, from a
// ranking, if they ever opened one. A rule that only the server can evaluate
// can only ever produce a late answer.
//
// So the rule lives here, on the engine side of the seam: what is true of
// badges everywhere, in a module both the page and a function can import. The
// pack still owns which badges exist and what each one is called.
//
// NOTE FOR WHOEVER TOUCHES THE LEADERBOARD NEXT: netlify/functions/leaderboard.js
// still carries its own copy of this rule (its BADGE_RULES table). Two copies of
// one rule drift, and the drift is invisible -- the celebration would fire for a
// badge the board does not show, or the reverse. Point that function at this
// module.

/**
 * The badges `solvedIds` has earned in `pack`, in the order the pack declares
 * them.
 *
 * @param {{ manifest: { badges?: Array }, challenges: Array }} pack
 * @param {Iterable<string>|Set<string>} solvedIds  ids of solved challenges
 * @returns {Array<object>} the pack's own badge objects, not copies of them
 */
export function badgesEarned(pack, solvedIds) {
  const badges = pack?.manifest?.badges;
  const challenges = pack?.challenges;
  if (!Array.isArray(badges) || !Array.isArray(challenges)) return [];

  const solved = solvedIds instanceof Set ? solvedIds : new Set(solvedIds || []);

  return badges.filter(badge => {
    // A badge with no act has no rule to test it against. The leaderboard drops
    // those rather than awarding them to everybody, and so does this.
    if (!badge || !badge.act) return false;
    const required = challenges.filter(c => c.act === badge.act).map(c => c.id);
    if (required.length === 0) return false;
    const done = required.filter(id => solved.has(id)).length;
    return done >= Math.ceil(required.length * BADGE_THRESHOLD);
  });
}

/**
 * The share of an act a student must finish to earn its badge. Kept as a named
 * constant so the next reader can see that the number is the same 0.8 the act
 * unlock uses, rather than a second threshold that happens to agree today.
 */
export const BADGE_THRESHOLD = 0.8;

/** The ids of the earned badges. The shape the leaderboard sends to the client. */
export const badgeIdsEarned = (pack, solvedIds) =>
  badgesEarned(pack, solvedIds).map(b => b.id);
