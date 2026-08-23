// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Every colour scheme a student can pick has to be readable.
//
// A picker is not a licence to ship an unreadable palette. "The student chose
// it" is not a defence at 3:1 -- they chose a colour, not a WCAG violation, and
// the institution deploying this is the one on the hook for 1.4.3.
//
// The paper scheme shipped at 4.45:1 on one colour and this test is what
// caught it, before anybody looked at it.

import { describe, it, expect } from 'vitest';
import {
  TERMINAL_THEMES, DEFAULT_THEME_ID, TEXT_KEYS, MIN_TEXT_CONTRAST,
  contrastRatio, getTheme, isThemeId, themeVars, auditTheme
} from '../src/utils/terminalThemes.js';

describe('the contrast maths', () => {
  // Anchored against the two ratios the WCAG definition fixes exactly, so a
  // broken formula cannot pass by agreeing with itself.
  it('agrees with the values WCAG pins down', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('does not care which way round the colours come', () => {
    expect(contrastRatio('#0a0a09', '#34d399')).toBeCloseTo(contrastRatio('#34d399', '#0a0a09'), 10);
  });
});

describe('every shipped scheme is readable', () => {
  for (const [id, theme] of Object.entries(TERMINAL_THEMES)) {
    describe(`${id} — ${theme.name}`, () => {
      it.each(TEXT_KEYS)('%s reaches 4.5:1 against its own background', (key) => {
        const ratio = contrastRatio(theme[key], theme.bg);
        expect(ratio, `${id}.${key} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      });

      it('defines every colour the terminal asks for', () => {
        for (const key of [...TEXT_KEYS, 'bg', 'bar', 'border', 'caret']) {
          expect(theme[key], `${id} is missing ${key}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      });

      // A scheme a student cannot tell apart from another in the menu is not a
      // choice, and the note is what explains who it is for.
      it('says what it is and who it is for', () => {
        expect(theme.name).toBeTruthy();
        expect(theme.note.length).toBeGreaterThan(30);
      });
    });
  }

  it('audits clean across the board', () => {
    const failures = Object.keys(TERMINAL_THEMES)
      .flatMap(id => auditTheme(id).filter(r => !r.passes).map(r => `${id}.${r.key} ${r.ratio.toFixed(2)}`));
    expect(failures).toEqual([]);
  });

  // Distinguishing a success from an error is the terminal's most important
  // colour job, and green-on-red is precisely the pair a deuteranope cannot
  // separate. The safe scheme must not merely differ -- it must differ in
  // lightness, which survives every form of colour vision deficiency.
  it('the colour-blind safe scheme separates success from error by lightness', () => {
    const t = TERMINAL_THEMES.accessible;
    expect(contrastRatio(t.success, t.error)).toBeGreaterThanOrEqual(1.6);
  });
});

describe('choosing a scheme', () => {
  it('falls back to the default for anything unknown', () => {
    for (const bad of [undefined, null, '', 'neon', 42, 'constructor', '__proto__', 'toString']) {
      expect(isThemeId(bad)).toBe(false);
      expect(getTheme(bad)).toBe(TERMINAL_THEMES[DEFAULT_THEME_ID]);
    }
  });

  it('the default exists', () => {
    expect(TERMINAL_THEMES[DEFAULT_THEME_ID]).toBeTruthy();
  });

  it('hands the terminal a full set of custom properties', () => {
    const vars = themeVars('blue');
    expect(vars['--sg-bg']).toBe(TERMINAL_THEMES.blue.bg);
    expect(Object.keys(vars).every(k => k.startsWith('--sg-'))).toBe(true);
    expect(Object.values(vars).every(Boolean)).toBe(true);
  });

  it('gives an unknown scheme the default properties rather than blanks', () => {
    expect(themeVars('nonsense')['--sg-bg']).toBe(TERMINAL_THEMES[DEFAULT_THEME_ID].bg);
  });
});
