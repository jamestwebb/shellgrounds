// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// What a student may call themselves.
//
// This runs on a handle that will appear on a leaderboard, on a projector, in
// front of a class. It got two things backwards at once:
//
//   It refused real students. The list was matched as a raw substring, so `ass`
//   blocked Hassan, Cassandra, Cassidy and class_rep; `hell` blocked Michelle
//   and Hellen; `kill` blocked Killian. Telling a student their own name is
//   inappropriate is a worse failure than most of what the list is for.
//
//   It let slurs through. Leet spellings only worked where somebody had hand-
//   typed the variant: `sh1t` was listed, so it was caught; `n1gg3r` was not,
//   so it was not. The one that got through is the one that matters.
//
// Two changes fix both. Spellings are NORMALISED before matching, so one entry
// covers its variants. And the list has two tiers: things that are never part
// of an ordinary name are matched anywhere, and mild words are matched only as
// a whole word, so Hassan keeps his name and `shit_lord` still does not.
//
// ── This filter is not the safety net, and must not be treated as one ───────
//
// No word list is complete, and a determined fifteen-year-old will beat this
// one before lunch. The real backstop is a teacher who can see a handle and
// remove it. Until that exists, this is the only line, which is a reason to
// keep it honest about its own limits rather than to trust it.

import VENDORED from './sfw-words.json' with { type: 'json' };

/**
 * Letters that get swapped for lookalikes. Applied before matching, so one
 * list entry covers its spellings instead of needing a row per variant.
 */
const LOOKALIKES = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g',
  '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i',
  '|': 'i', '+': 't', 'v': 'u'
};

/**
 * A handle reduced to the shape a word list can be compared against:
 * lower-cased, separators dropped, lookalikes resolved, and runs of a repeated
 * letter collapsed so padding does not hide anything.
 */
export function normaliseForMatching(text) {
  const lower = String(text).toLowerCase();
  let out = '';
  for (const ch of lower) {
    const mapped = LOOKALIKES[ch] ?? ch;
    if (/[a-z]/.test(mapped)) out += mapped;
  }
  return out.replace(/(.)\1+/g, '$1');
}

/**
 * Never part of an ordinary name or word, so matched anywhere in the handle.
 * Slurs, sexual content, and violence.
 */
export const BLOCKED_ANYWHERE = [
  'nigger', 'nigga', 'faggot', 'kike', 'chink', 'wetback', 'tranny',
  'fuck', 'cunt', 'whore', 'pussy', 'bitch', 'bastard', 'wanker', 'twat',
  'retard', 'rape', 'rapist', 'molest', 'porn', 'blowjob', 'handjob',
  'nazi', 'hitler', 'stalin', 'isis', 'jihad', 'lynch',
  'cocaine', 'heroin', 'meth',
  // Normalisation resolves LOOKALIKES — 1 for i, 3 for e — but not a deliberate
  // vowel swap: `f4ck` normalises to `fack`, which matches nothing. A short
  // list of the stubborn spellings covers what the mapping cannot, and each is
  // matched the same way as any other entry.
  'fck', 'fack', 'fuk', 'fuq', 'phuck', 'biatch', 'shyt', 'boob',
  // Words that do not occur inside real names, so they can be matched anywhere
  // and catch compounds: shithead, dumbass-style constructions. Contrast with
  // `dick`, `cock` and `fag`, which ARE inside Dickens, Cockburn and Fagan and
  // therefore have to stay in the whole-word tier below.
  'shit', 'slut', 'wank', 'turd'
];

/**
 * Ordinary words that also appear inside real names, so matched only as a
 * whole word. `shit_lord` is refused; Hassan, Michelle and Killian are not.
 */
export const BLOCKED_AS_WORD = [
  'ass', 'arse', 'crap', 'piss', 'damn', 'hell', 'dick', 'cock',
  'fag', 'dyke', 'spic', 'sex', 'nude', 'naked', 'xxx',
  'kill', 'murder', 'crack', 'kkk', 'bollocks'
];

/**
 * The curated list above plus 274 terms from the standard English word list
 * (LDNOOBW, CC-BY-4.0 — see NOTICE.md), all matched as WHOLE TOKENS.
 *
 * Substring matching over a list this size would be a disaster. It contains
 * `paki`, `mong`, `coon`, `tit`, `butt`, `scat` and `cum`, which sit inside
 * Pakistan, among, raccoon, title, Butterworth, scatter and accumulate. A
 * student refused their own name, or their country, is a worse outcome than
 * the one the list exists to prevent — which is exactly the failure this file
 * started with.
 *
 * Multi-word entries were dropped when vendoring: they cannot be one token.
 */
// Normalised on BOTH sides or it matches nothing useful: a token is compared
// after lookalikes are resolved and repeats collapsed, so `ass` in the list has
// to become `as` too, or `a55hole` and even plain `asshole` sail past.
export const BLOCKED_WORD_SET = new Set(
  [...BLOCKED_AS_WORD, ...(VENDORED.words || [])]
    .map(normaliseForMatching)
    .filter(Boolean)
);

// Some of those are ambiguous and no list can fix it. `dyke` is a slur and a
// surname; `spic` is a slur and the start of `spicer`; `cock` is a slur and a
// surname. Token matching handles the second case in each pair, but a student
// actually called Dyke still cannot use their surname on its own.
//
// That is not solvable here. It is solvable by a teacher who can look at a
// handle and approve or change it — which is the control this product does not
// yet have, and the reason this file should not be mistaken for the safety net.

export const BLOCKED_PATTERNS = [
  { pattern: /(.)\1{3,}/, reason: 'Too many repeated characters' },
  { pattern: /^[0-9]+$/, reason: 'Handle cannot be purely numbers' },
  { pattern: /admin/i, reason: 'Handle cannot contain reserved term "admin"' },
  { pattern: /moderator/i, reason: 'Handle cannot contain reserved term "moderator"' },
  { pattern: /staff/i, reason: 'Handle cannot contain reserved term "staff"' },
  { pattern: /system/i, reason: 'Handle cannot contain reserved term "system"' },
  { pattern: /support/i, reason: 'Handle cannot contain reserved term "support"' },
  { pattern: /official/i, reason: 'Handle cannot contain reserved term "official"' },
  { pattern: /root/i, reason: 'Handle cannot contain reserved term "root"' }
];

/**
 * The words a handle is built from: split on separators, on digit runs, and on
 * a lower-to-upper case change, so `shitLord`, `shit_lord` and `shit99` all
 * yield `shit` while `Cassandra` yields only `cassandra`.
 */
function wordsIn(handle) {
  return String(handle)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+|(?<=[a-zA-Z])(?=[0-9])|(?<=[0-9])(?=[a-zA-Z])/)
    .filter(Boolean)
    .map(normaliseForMatching)
    .filter(Boolean);
}

export const checkSFW = (text) => {
  if (!text || typeof text !== 'string') {
    return { safe: false, reason: 'Handle is required' };
  }

  const trimmed = text.trim();

  if (trimmed.length < 3) {
    return { safe: false, reason: 'Handle must be at least 3 characters' };
  }

  if (trimmed.length > 20) {
    return { safe: false, reason: 'Handle must be 20 characters or less' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { safe: false, reason: 'Only letters, numbers, underscores, and hyphens allowed' };
  }

  // The whole handle as one run, so separators and padding cannot hide a word:
  // f_u_c_k, n1gg3r and niiigger all reduce to the same thing as the entry.
  const whole = normaliseForMatching(trimmed);
  for (const word of BLOCKED_ANYWHERE) {
    if (whole.includes(normaliseForMatching(word))) {
      return { safe: false, reason: 'Contains inappropriate content' };
    }
  }

  const words = new Set(wordsIn(trimmed));
  // The whole handle counts as a word too, so a bare `hell` is refused while
  // `michelle` is not.
  words.add(whole);
  for (const word of words) {
    if (BLOCKED_WORD_SET.has(word)) {
      return { safe: false, reason: 'Contains inappropriate content' };
    }
  }

  for (const item of BLOCKED_PATTERNS) {
    if (item.pattern.test(trimmed)) {
      return { safe: false, reason: item.reason };
    }
  }

  return { safe: true, handle: trimmed };
};
