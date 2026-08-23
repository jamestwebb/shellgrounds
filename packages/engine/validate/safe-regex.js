// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Compiling a regular expression that somebody else wrote.
//
// Challenge success conditions carry `pattern` strings straight from pack data,
// and the SERVER evaluates them while grading a replay. A teacher's pack — or
// one a teacher downloaded from a stranger — can therefore choose the regex the
// server runs. `^(a+)+$` against a 40-character input pinned a CPU for 69
// seconds; the same pattern makes `shellgrounds validate` in CI never finish.
//
// JavaScript has no regex timeout, so the defences here are: refuse patterns
// with the nesting shape that causes catastrophic backtracking, cap the pattern
// length, and cap the amount of text any pattern is ever run against.

export const MAX_PATTERN_LENGTH = 2000;
export const MAX_TEST_INPUT = 64 * 1024;

// A quantified group whose body ALSO contains a quantifier is the classic
// catastrophic-backtracking shape. So is an alternation of overlapping branches
// under a quantifier, (a|a)*.
//
// The first version of this only looked for a quantifier immediately before the
// closing bracket — (a+)+, (a*)* — which a third-party review showed was easy to
// step around. `(a+a)+` and `([a-z]+x)+` both sailed through, and `(a+a)+$`
// takes two seconds against forty characters. Since that is exponential, forty
// more characters is not two more seconds.
//
// So the check is now "a quantifier ANYWHERE inside a quantified group", which
// is deliberately blunt. It will refuse some patterns that would have been
// fine. That is the right trade for a field a pack author fills in: a refused
// pattern is a validation message they can rewrite around, and an accepted one
// is a class whose site stops responding.
//
// This is defence in depth, not a proof. Static analysis of regular expressions
// is fragile, which is why assertSafeToRun below actually TIMES the pattern
// against adversarial input rather than trusting this to be complete.
const NESTED_QUANTIFIER =
  /\((?:\?[:=!<]=?)?(?:[^()\\]|\\.)*?(?:[+*]|\{\d+,\d*\})(?:[^()\\]|\\.)*?\)\s*(?:[+*]|\{\d+,\d*\})/;
const OVERLAPPING_ALTERNATION = /\((?:\?[:=!<])?([^)|]+)\|\1[^)]*\)\s*[+*{]/;

export class UnsafePatternError extends Error {
  constructor(message, pattern) {
    super(message);
    this.name = 'UnsafePatternError';
    this.pattern = pattern;
  }
}

/** Throws UnsafePatternError rather than returning a regex that could hang. */
export function assertSafePattern(pattern) {
  const src = String(pattern ?? '');
  if (src.length > MAX_PATTERN_LENGTH) {
    throw new UnsafePatternError(
      `Pattern is ${src.length} characters; the limit is ${MAX_PATTERN_LENGTH}.`, src);
  }
  if (NESTED_QUANTIFIER.test(src)) {
    throw new UnsafePatternError(
      'Pattern nests one quantifier inside another, e.g. (a+)+. That can take '
      + 'exponential time on a near-match. Rewrite it without the inner quantifier.', src);
  }
  if (OVERLAPPING_ALTERNATION.test(src)) {
    throw new UnsafePatternError(
      'Pattern repeats an alternation whose branches overlap, e.g. (a|a)*. '
      + 'That can take exponential time on a near-match.', src);
  }
  return src;
}

/**
 * Compiles a pattern from untrusted content.
 * Returns null when the pattern is unsafe or invalid, so a caller can treat it
 * as "does not match" instead of crashing the request.
 */
export function compileSafe(pattern, flags = '') {
  try {
    return new RegExp(assertSafePattern(pattern), flags);
  } catch (err) {
    if (err instanceof UnsafePatternError) {
      console.warn(`Rejected an unsafe pack pattern: ${err.message}`);
    } else {
      console.warn(`Rejected an invalid pack pattern: ${err.message}`);
    }
    return null;
  }
}

/** Runs a compiled regex against text, with the input length capped. */
export function testSafe(regex, text) {
  if (!regex) return false;
  const input = String(text ?? '');
  return regex.test(input.length > MAX_TEST_INPUT ? input.slice(0, MAX_TEST_INPUT) : input);
}

// ── Timing, because the check above is a heuristic ──────────────────────────
//
// Static analysis of regular expressions is fragile: the previous version of
// NESTED_QUANTIFIER looked correct and missed `(a+a)+` entirely. So a pack is
// also MEASURED. This runs the compiled pattern against strings built to make
// a backtracking engine work hardest — a long run of one character with a
// terminator that cannot match — and reports the worst time.
//
// It runs at pack-validation time, not on a student's submission: the point is
// to refuse a bad pattern while its author is standing there, rather than to
// police one that is already grading a class.
//
// Exponential blowup announces itself early. A pattern that takes 50ms at 24
// characters takes minutes at 40, so a modest budget over a short input is a
// sharper instrument than a generous one over a long input.

/**
 * Worst-case milliseconds is measured against inputs this long, shortest
 * first. `(a+a)+` costs 18ms at 32 characters and two seconds at 40, so the
 * curve only becomes obvious near the top of this range — and because the
 * probe stops the moment the budget is passed, a hostile pattern is refused at
 * the length that first exceeds it and never runs at the longer ones.
 */
export const PROBE_LENGTHS = [20, 28, 34, 38];

/** A pattern may not take longer than this on any probe. */
export const PROBE_BUDGET_MS = 50;

/**
 * Times a compiled pattern against adversarial input.
 * @returns {{ ok: boolean, worstMs: number, input?: string }}
 */
export function probePattern(regex, budgetMs = PROBE_BUDGET_MS) {
  if (!regex) return { ok: true, worstMs: 0 };

  // Characters a hostile pattern is most likely to be built from, plus a
  // terminator chosen so the match must fail after doing all the work.
  const units = ['a', 'ab', '1', 'a ', 'x-'];
  let worstMs = 0;
  let worstInput = '';

  for (const n of PROBE_LENGTHS) {
    for (const unit of units) {
      const input = unit.repeat(Math.ceil(n / unit.length)).slice(0, n) + '\u0000!';
      const started = Date.now();
      try {
        regex.lastIndex = 0;
        regex.test(input);
      } catch {
        // A pattern that throws is a different problem, handled by compileSafe.
      }
      const took = Date.now() - started;
      if (took > worstMs) { worstMs = took; worstInput = input; }
      if (worstMs > budgetMs) return { ok: false, worstMs, input: worstInput };
    }
  }
  return { ok: true, worstMs };
}
