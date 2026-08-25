// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// WCAG 1.4.3 for the app's own chrome, not just the six terminal schemes.
//
// tests/terminal-themes.test.js already holds every terminal colour scheme to
// 4.5:1 -- that discipline never reached the header, the sidebar, the dialogs
// or any other screen outside the terminal itself, which is how neutral-500
// (3.98:1) and neutral-600 (2.42:1) shipped and stayed for months (see A4 in
// docs/ACCESSIBILITY.md, and the override comment in tailwind.config.js).
//
// This test does not hand-pick a handful of pairs and call it done -- a static
// list goes stale the moment somebody adds a new screen. Instead it reads
// every `className="..."` string in App.jsx and src/components/*.jsx, and
// wherever a `text-` (or `placeholder-`) colour and a `bg-` colour sit in the
// SAME string -- which is how this codebase already writes badges, buttons,
// inputs and panels, see the grep that built this file's pair list -- it
// resolves both to hex and checks the ratio. Getting the colours right means
// reading them from the same places the app does: tailwind.config.js for the
// custom `term-*` ramp and the neutral-500/600 override, and the `tailwindcss`
// package's own colour table for everything else, rather than a hand-typed
// copy of either that could quietly drift from the real one.
//
// ── What this under-reports, on purpose ─────────────────────────────────────
//
// A text colour styled in a DIFFERENT className string than its background --
// plain body text nested a few levels under a panel div, for instance -- is
// not resolved here. Guessing which ancestor's background actually paints
// behind a given span would mean parsing the render tree, not the source
// text, and a wrong guess would fail a colour that is actually fine (or worse,
// pass one that is not). Same-string pairing only tests real, unambiguous
// pairs; nothing here is invented. That is the same trade nothing-written-is-
// unread.test.js makes about "read": it under-reports and says so, and it is
// here to catch the next regression, not to prove the chrome exhaustively.
//
// Backgrounds carrying an opacity suffix (`bg-red-950/40`) are excluded for
// the same reason: what actually renders depends on whatever is behind the
// translucency, which this test cannot see from the source alone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import tailwindColors from 'tailwindcss/colors.js';
import { contrastRatio, MIN_TEXT_CONTRAST } from '../src/utils/terminalThemes.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// The config is the one source of truth for the custom `term-*` ramp and for
// the neutral-500/600 override (tailwind.config.js). Reading it here, rather
// than copying its hex values into this file, is the same rule the brief for
// that override states in its own comment: verify against the source, don't
// trust a second copy of it.
const { default: tailwindConfig } = await import('../tailwind.config.js');
const CUSTOM_COLORS = tailwindConfig.theme.extend.colors;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Resolve a Tailwind colour token ("term-gray", "red-300", "white") to a hex
 * string, or null when it is not a colour at all ("xs", "left", "gradient-to-r")
 * or resolves to something this test cannot compare (term-green-faint is an
 * rgba() string, because it is only ever used as a translucent background). */
const resolveToken = (token) => {
  if (Object.prototype.hasOwnProperty.call(CUSTOM_COLORS, token)) {
    const v = CUSTOM_COLORS[token];
    return HEX_RE.test(v) ? v : null;
  }
  if (token === 'white') return '#ffffff';
  if (token === 'black') return '#000000';
  const cut = token.lastIndexOf('-');
  if (cut < 0) return null;
  const family = token.slice(0, cut);
  const shade = token.slice(cut + 1);
  const v = tailwindColors[family]?.[shade];
  return typeof v === 'string' && HEX_RE.test(v) ? v : null;
};

// A variant-prefixed class ("hover:bg-term-gray", "focus:text-white") is a
// state, not the resting appearance, and is deliberately not extracted here --
// this test checks what is on screen before any interaction, the same as a
// screen reader or a first glance would see. Requiring the token to start
// right after whitespace (or the start of the string) is what excludes it: a
// variant always has a colon immediately before the utility name, never a
// space.
//
// The lookahead requiring whitespace-or-end right after the token is also
// what excludes an opacity suffix ("bg-red-950/40"): the character right
// after "red-950" is "/", which satisfies neither branch, so the match fails
// there and the whole token is skipped rather than half-read. That is
// deliberate -- a translucent background blends with whatever sits behind it,
// which this test cannot see from the source, so it is excluded rather than
// scored against a colour it may never actually render on.
const TOKEN_RE = (prefix) => new RegExp(`(?:^|\\s)${prefix}-([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)(?=\\s|$)`, 'g');

/** Every resolvable, non-opacity token for a given utility prefix in one class string. */
const extractColors = (classString, prefix) => {
  const out = [];
  for (const m of classString.matchAll(TOKEN_RE(prefix))) {
    const raw = m[0].trim().slice(prefix.length + 1);
    const hex = resolveToken(raw);
    if (hex) out.push(hex);
  }
  return out;
};

const TARGET_FILES = [
  'src/App.jsx',
  ...fs.readdirSync(path.join(ROOT, 'src/components'))
    .filter(f => f.endsWith('.jsx'))
    .map(f => `src/components/${f}`)
];

// Multi-line className="..." strings (this codebase wraps long ones across
// several lines) need the dot to match newlines, hence the 's' flag.
const CLASSNAME_RE = /className="([^"]*)"/gs;

/** Every same-string (bg, text-or-placeholder) pair actually written in the source. */
const collectPairs = () => {
  const pairs = [];
  for (const rel of TARGET_FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(CLASSNAME_RE)) {
      const cls = m[1];
      const bgs = extractColors(cls, 'bg');
      const texts = [...extractColors(cls, 'text'), ...extractColors(cls, 'placeholder')];
      // More than one resolvable bg in a single string means the pairing is
      // ambiguous (it does not happen in practice -- checked below by the
      // "found a meaningful number of pairs" sanity test -- but a real
      // instance would be a stacked/gradient background this test cannot
      // reason about, so it is skipped rather than guessed).
      if (bgs.length !== 1 || texts.length === 0) continue;
      for (const text of texts) {
        pairs.push({ file: rel, bg: bgs[0], text, snippet: cls.replace(/\s+/g, ' ').trim().slice(0, 90) });
      }
    }
  }
  return pairs;
};

describe('chrome text meets 4.5:1 against the background it is actually drawn on', () => {
  const pairs = collectPairs();

  // If this drops to zero the extraction broke silently, and every check
  // below would trivially "pass" by finding nothing to check -- worse than no
  // test at all, because it would look green.
  it('finds a meaningful number of same-string colour pairs to check', () => {
    expect(pairs.length).toBeGreaterThan(30);
  });

  it.each(pairs.map(p => [`${p.file} — text ${p.text} on ${p.bg} ("${p.snippet}")`, p]))(
    '%s',
    (_label, { bg, text }) => {
      const ratio = contrastRatio(text, bg);
      expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  );
});
