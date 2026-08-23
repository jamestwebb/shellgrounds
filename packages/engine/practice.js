// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// What happens when a student does a challenge they have already solved.
//
// The site used to answer that question with `if (solved) return;` — no points,
// which is right, and no reply of any kind, which is not. A student typed a
// correct command and the terminal said nothing, so the most useful thing they
// could do with ten minutes before a test looked like a broken page.
//
// ── Why re-attempts are worth encouraging ───────────────────────────────────
//
// Recalling something is a far stronger way to retain it than reading it
// again. That is the best-evidenced finding in the whole of study-skills
// research, and it is inconvenient, because re-reading FEELS like it is
// working and recall feels like failing. A student who chooses to retype a
// command they solved a fortnight ago is doing the thing that works, and the
// interface should say so rather than tolerate it in silence.
//
// Three rules follow, and each one is a rule about what NOT to do:
//
//   Do not pay twice. Points are the wrong lever here. If a re-solve scored,
//   a score would become a measure of how long somebody held down Enter — and
//   the class picture is built from the same solves, so the shared reveal
//   would fill up without anybody learning anything. Acknowledge; never pay.
//
//   Do not leave the answer on screen. A solved challenge shows its success
//   message, and its unlocked hints stay unlocked. Both are the answer. With
//   them visible, a re-attempt is recognition — "yes, that looks right" —
//   which is close to worthless next to unaided recall. Practice therefore
//   HIDES what the student already bought, and offers it back on request.
//
//   Do not charge twice either. A hint that was paid for is paid for. During
//   practice it reopens free, because the alternative teaches a student that
//   revisiting their own work is expensive, which is the exact opposite of the
//   lesson.
//
// ── Spacing ─────────────────────────────────────────────────────────────────
//
// Repetition pays most when it is spread out, and a challenge finished this
// morning is worth much less to redo than one finished a fortnight ago. This
// module marks the stale ones so the interface can point at them.
//
// REVISIT_AFTER_DAYS is a heuristic, not a result. The literature supports
// "spread it out" firmly and offers no single correct interval for a
// semester-long course, so this is one week: long enough that recall is
// genuinely effortful, short enough to come round more than once in a term.

/** One day, in milliseconds. */
export const DAY_MS = 86_400_000;

/**
 * How stale a solve has to be before the interface suggests going back to it.
 * See the note above: a defensible heuristic, not a measured optimum.
 */
export const REVISIT_AFTER_DAYS = 7;

/**
 * Whole days since a challenge was solved, or null when the record carries no
 * usable date. Never negative: a clock skewed forwards should read as "today"
 * rather than as a solve from the future.
 */
export function daysSinceSolved(solve, now = Date.now()) {
  const at = Date.parse(solve?.solvedAt ?? '');
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * A phrase for how long ago, in the register the rest of the interface uses.
 * Deliberately vague past a fortnight — "3 weeks ago" is what a student needs
 * to judge whether they still know it, and a date is not.
 */
export function sinceLabel(days) {
  if (days === null || days === undefined) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 61) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/**
 * Everything the interface needs to know about a student's history with one
 * challenge.
 *
 * @returns {{ solved: boolean, days: number|null, worthRevisiting: boolean, sinceLabel: string|null }}
 */
export function practiceState(solve, now = Date.now()) {
  if (!solve) {
    return { solved: false, days: null, worthRevisiting: false, sinceLabel: null };
  }
  const days = daysSinceSolved(solve, now);
  return {
    solved: true,
    days,
    // A solve with no readable date is not nagged about. Guessing "stale" from
    // missing data would put a revisit marker on every record written before
    // solvedAt existed.
    worthRevisiting: days !== null && days >= REVISIT_AFTER_DAYS,
    sinceLabel: sinceLabel(days)
  };
}

/**
 * The solved challenges most worth going back to: stalest first.
 *
 * Ordered by age rather than by score, because this is about forgetting, not
 * about which ones went badly. A challenge solved cleanly a month ago has
 * decayed more than one fumbled through yesterday.
 */
export function revisitQueue(challenges = [], solvesMap = {}, now = Date.now(), limit = 3) {
  return challenges
    .map(challenge => ({ challenge, days: daysSinceSolved(solvesMap[challenge.id], now) }))
    .filter(entry => entry.days !== null && entry.days >= REVISIT_AFTER_DAYS)
    .sort((a, b) => b.days - a.days)
    .slice(0, Math.max(0, limit))
    .map(entry => entry.challenge);
}
