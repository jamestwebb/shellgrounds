// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds copy deck: the engine's own words.
//
// Voice: plain, warm, never condescending, no hacker cosplay. Short sentences.
// Written for a student who is a little afraid of the terminal. Pack fiction
// lives in pack data; nothing in this file may name one pack's story.
//
// Feedback copy is rotated rather than fixed. A single repeated line goes stale
// by the tenth read and reads as contempt by the twentieth.

export const PRODUCT_NAME = 'Shellgrounds';
export const TAGLINE = 'Learn the command line, one find at a time.';

// Never imply the student is slow. Every line points at something to check.
export const WRONG_ANSWER_COPY = [
  'Not that one. Look again at what the last command printed — the find is usually in the output, not the filename.',
  'That find did not match. Check for copy-paste gaps: the whole thing, braces included.',
  'Close, but no. Re-read the brief — it says exactly which file the find lives in.',
  'Not it. Try the free hint if you have not — that is what it is there for.',
  'That one did not match. Wrong answers cost nothing, so keep poking at it.',
];

// Shown alongside the challenge's own successMessage, which carries the
// teaching point. These carry the warmth.
export const SOLVE_COPY = [
  'Found it. That command is yours now.',
  'Solved. You typed that like you meant it.',
  'Captured. On to the next one.',
  'That is a real skill, not a game skill. Logged and scored.',
  'Found it — and nobody could have handed you that one. It was yours alone.',
];

export const EMPTY_STATES = {
  noSolves:
    'Nothing found yet. Open Act I and run your first command — everyone on the leaderboard started exactly here.',
  boardEmpty:
    'The board is empty. The first thing anyone finds will appear here.',
  boardSolo:
    'One name on the board so far. Plenty of room at the top.',
  boardNoSearchMatch:
    'No handle matches that search.',
  boardLoading: 'Loading the board...',
};

// {n} solves still needed, {act} the act that must give them up.
export const actLockedCopy = (n, previousActName) =>
  `Locked. Solve ${n} more in ${previousActName} and this act opens. `
  + 'You can skip one challenge per act — no challenge can block you alone.';

// Rotates through a list, one line per call. Module-level so the sequence is
// shared across renders and a student never sees the same line twice running.
const rotator = (messages) => {
  let index = 0;
  return () => messages[index++ % messages.length];
};

export const nextWrongAnswerMessage = rotator(WRONG_ANSWER_COPY);
export const nextSolveMessage = rotator(SOLVE_COPY);
