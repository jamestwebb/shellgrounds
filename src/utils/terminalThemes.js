// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Colour schemes for the terminal, chosen by the student.
//
// This is not decoration, and it is not a WCAG requirement either — the
// default palette has to pass on its own merits, and a picker does not excuse
// it. It is here because one compliant palette cannot serve everyone:
//
//   Low vision. 4.5:1 is a floor, not a target. Somebody who needs 15:1 needs
//   a scheme built for it, not a slider.
//
//   Irlen syndrome and scotopic sensitivity, where black-on-white (or its
//   inverse) produces visual stress, glare and swimming text, and a coloured
//   background measurably helps. This is why `blue` and `paper` exist, and it
//   is the single most common reason a student asks to change a screen.
//
//   Colour vision deficiency. Green on black is close to the worst default
//   available for a deuteranope, who cannot separate the green prompt from the
//   red error text. `accessible` uses blue and orange, which stay distinct
//   under every common form of CVD.
//
//   Preference, which is not a lesser reason than the others. A student who
//   can bear to look at the screen for an hour learns more than one who cannot.
//
// ── The rule for adding one ─────────────────────────────────────────────────
//
// Every colour that carries text must reach 4.5:1 against its own background,
// and a test enforces it. A scheme that looks wonderful and reads at 3:1 is a
// scheme that fails 1.4.3 for everybody who picks it, and "the student chose
// it" is not a defence: they chose a colour, not a violation.
//
// Colour is never the only signal anywhere in this interface, so a scheme is
// free to differ in hue without carrying meaning on its own.

/** Relative luminance, per the WCAG 2.x definition. */
function luminance(hex) {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colours: 1 (identical) to 21 (black/white). */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The floor for body text at WCAG 2.1 Level AA (1.4.3). */
export const MIN_TEXT_CONTRAST = 4.5;

/** Keys whose colour carries text and must therefore clear the floor. */
export const TEXT_KEYS = ['fg', 'input', 'user', 'path', 'punct', 'success', 'error', 'coach', 'dim'];

export const TERMINAL_THEMES = {
  green: {
    name: 'Terminal green',
    note: 'The default. Green on near-black, the way a terminal has looked since 1975.',
    bg: '#0a0a09', bar: '#111110', border: '#2b2a27',
    fg: '#d4d4d4', input: '#ffffff', user: '#4ade80', path: '#22d3ee', punct: '#a3a3a3',
    success: '#34d399', error: '#f87171', coach: '#67e8f9', dim: '#a3a3a3', caret: '#34d399'
  },

  blue: {
    name: 'Deep blue',
    note: 'White on blue. A coloured background rather than black reduces visual stress for '
      + 'some readers, and glare for most.',
    bg: '#0b2545', bar: '#0a1f3a', border: '#1e3a5f',
    fg: '#e8eef7', input: '#ffffff', user: '#7dd3fc', path: '#fcd34d', punct: '#b3c4dd',
    success: '#6ee7b7', error: '#fca5a5', coach: '#a5d8ff', dim: '#b3c4dd', caret: '#ffffff'
  },

  amber: {
    name: 'Amber CRT',
    note: 'Warm amber on near-black. No blue light, and easy on the eyes late in the day.',
    bg: '#0d0a06', bar: '#150f08', border: '#3a2c17',
    fg: '#f5c77e', input: '#ffe4b5', user: '#fbbf24', path: '#fcd34d', punct: '#c9a227',
    success: '#a3e635', error: '#fb923c', coach: '#fde68a', dim: '#c9a227', caret: '#fbbf24'
  },

  paper: {
    name: 'Paper',
    note: 'Dark text on warm off-white. Some readers cannot use a dark screen at all, and '
      + 'off-white is gentler than pure white.',
    bg: '#f5f1e8', bar: '#e8e2d4', border: '#c8bfa8',
    fg: '#2b2a27', input: '#000000', user: '#166534', path: '#1e40af', punct: '#57534e',
    success: '#146c34', error: '#b91c1c', coach: '#1e40af', dim: '#57534e', caret: '#2b2a27'
  },

  contrast: {
    name: 'High contrast',
    note: 'Pure white on pure black, at the maximum the screen can produce. Built for low '
      + 'vision rather than for looks.',
    bg: '#000000', bar: '#000000', border: '#ffffff',
    fg: '#ffffff', input: '#ffffff', user: '#00ff00', path: '#00ffff', punct: '#ffffff',
    success: '#00ff00', error: '#ff6b6b', coach: '#00ffff', dim: '#e0e0e0', caret: '#ffffff'
  },

  accessible: {
    name: 'Colour-blind safe',
    note: 'Blue and orange instead of green and red. They differ in lightness as well as in '
      + 'hue, so they stay apart under every form of colour vision deficiency — and in greyscale.',
    bg: '#0d1117', bar: '#161b22', border: '#30363d',
    fg: '#e6edf3', input: '#ffffff', user: '#79c0ff', path: '#ffa657', punct: '#b1bac4',
    // Hue alone was not enough. The first draft paired #79c0ff with #ffa657,
    // which a deuteranope separates easily and a tritanope — or a greyscale
    // printout — does not: they sit at 1.00:1 against each other. Lightness is
    // the channel no form of CVD takes away, so success is now much the paler
    // of the two.
    success: '#c6e6ff', error: '#e07b28', coach: '#d2a8ff', dim: '#b1bac4', caret: '#ffffff'
  }
};

export const DEFAULT_THEME_ID = 'green';

const STORAGE_KEY = 'shellgrounds.terminalTheme';

export function isThemeId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TERMINAL_THEMES, id);
}

export function getTheme(id) {
  return TERMINAL_THEMES[isThemeId(id) ? id : DEFAULT_THEME_ID];
}

/**
 * The student's choice, from this browser. Wrapped because a private window, a
 * locked-down school profile, or blocked site data all make localStorage throw
 * rather than return nothing — and a terminal that will not render because it
 * could not read a preference is a much worse failure than a default colour.
 */
export function readStoredTheme() {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    return isThemeId(id) ? id : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function storeTheme(id) {
  try {
    if (isThemeId(id)) window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* Preference not remembered. The scheme still applies for this session. */
  }
}

/** The theme as CSS custom properties, for a `style` attribute on the terminal root. */
export function themeVars(id) {
  const t = getTheme(id);
  return {
    '--sg-bg': t.bg, '--sg-bar': t.bar, '--sg-border': t.border,
    '--sg-fg': t.fg, '--sg-input': t.input, '--sg-user': t.user, '--sg-path': t.path,
    '--sg-punct': t.punct, '--sg-success': t.success, '--sg-error': t.error,
    '--sg-coach': t.coach, '--sg-dim': t.dim, '--sg-caret': t.caret
  };
}

/**
 * Every text colour in a scheme, measured against that scheme's background.
 * Used by the test that stops a new scheme shipping below the line.
 */
export function auditTheme(id) {
  const t = getTheme(id);
  return TEXT_KEYS.map(key => ({
    key,
    ratio: contrastRatio(t[key], t.bg),
    passes: contrastRatio(t[key], t.bg) >= MIN_TEXT_CONTRAST
  }));
}
