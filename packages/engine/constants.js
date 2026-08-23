// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Engine constants and shared regex patterns

/**
 * A command that "ran" but errored or emitted an unsimulated message
 * must not satisfy a challenge. Kept as the single authoritative source of truth.
 */
export const ERROR_MARKERS = /command not found|not available in this simulator|that is the (Linux|Windows) name|No such file|missing operand|Not a directory|Is a directory|cannot access|is not recognized|cannot find|invalid option|syntax error|is not simulated here|Permission denied/i;

// ── What a student collects ─────────────────────────────────────────────────
// Shellgrounds is a beach, not a firing range. A student walks it, finds
// things, and picks them up. The word for one of those things is a FIND, and
// the token they paste back looks like FIND{ABCD2345EFGH}.
//
// It used to be FLAG{…}, which is the capture-the-flag convention and would be
// recognised by anyone who has done a real CTF. That recognition was traded
// deliberately: "capture the flag" beside "Shellgrounds" reads as ordnance on
// a range, and the audience here is a first-year who is already nervous about
// the terminal. Nothing is captured. Things are found.
//
// One constant, used everywhere, so the trade can be reversed in one line.
export const FIND_TOKEN_PREFIX = 'FIND';

/** The literal a student sees and pastes, e.g. "FIND{ABCD2345EFGH}". */
export const findToken = (code) => `${FIND_TOKEN_PREFIX}{${code}}`;

/** Matches a find token anywhere in text. Rebuilt from the prefix, never hard-coded. */
export const FIND_TOKEN_PATTERN = new RegExp(`${FIND_TOKEN_PREFIX}\\{[A-Z0-9]+\\}`, 'g');

/** The opening of a token, for "does this text contain one" checks. */
export const FIND_TOKEN_OPEN = `${FIND_TOKEN_PREFIX}{`;
