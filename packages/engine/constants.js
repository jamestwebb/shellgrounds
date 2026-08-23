// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Engine constants and shared regex patterns

/**
 * A command that "ran" but errored or emitted an unsimulated message
 * must not satisfy a challenge. Kept as the single authoritative source of truth.
 */
export const ERROR_MARKERS = /command not found|not available in this simulator|that is the (Linux|Windows) name|No such file|missing operand|Not a directory|Is a directory|cannot access|is not recognized|cannot find|invalid option|syntax error|is not simulated here|Permission denied/i;
