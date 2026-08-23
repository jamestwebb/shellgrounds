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

// A quantified group whose body is itself quantified — (a+)+, (a*)*, (a+)*,
// (\d+)+ — is the classic catastrophic-backtracking shape. So is an alternation
// of overlapping branches under a quantifier, (a|a)*.
const NESTED_QUANTIFIER = /\((?:\?[:=!<][^)]*|[^)])*?[+*}](?:\?)?\)\s*[+*{]/;
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
