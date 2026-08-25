/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'term-black': '#0a0a09',
        'term-void': '#070706',
        'term-gray': '#111110',
        'term-panel': '#171614',
        'term-panel-light': '#181818',
        'term-border': '#2b2a27',
        // Two deliberately different surfaces so students can tell at a glance
        // which pane is which: the sidebar is a neutral gray "workbook"...
        'term-sidebar': '#17181b',
        'term-sidebar-deep': '#101113',
        'term-sidebar-raised': '#212327',
        'term-sidebar-border': '#33363d',
        // ...and the terminal is deep navy — the machine you type into.
        'term-shell': '#0a1220',
        'term-shell-deep': '#060c16',
        'term-shell-bar': '#101c30',
        'term-shell-border': '#1e3a5f',
        'term-border-bright': '#3a3a3a',
        // ── neutral-500 / neutral-600 overridden for WCAG 1.4.3 (A4) ──────
        // Tailwind's stock neutral-500 (#737373) and neutral-600 (#525252) are
        // the tertiary text colour across 10 components — timestamps, counts,
        // "N of M finds", placeholders, borders. Measured with contrastRatio
        // from src/utils/terminalThemes.js against term-gray (#111110), the
        // surface the worst offender (the feed's timestamps) sits on:
        //   neutral-500 #737373 → 3.98:1  (fails 4.5:1 — 67 uses)
        //   neutral-600 #525252 → 2.42:1  (fails 4.5:1 — the worst value shipped)
        // Overriding the ramp step here fixes every existing use and every
        // future one without a find-and-replace across the tree. Measured
        // again after the override, against term-gray:
        //   neutral-500 #a3a3a3 → 7.49:1
        //   neutral-600 #8a8a8a → 5.47:1
        // Both still clear 4.5:1 against every surface the chrome actually
        // draws text on, including the tightest case — neutral-600 on
        // term-sidebar-raised (#212327), the lightest surface it appears on
        // — which lands at 4.56:1. tests/chrome-contrast.test.js holds this
        // line for every chrome surface; it does not re-derive it.
        'neutral-500': '#a3a3a3',
        'neutral-600': '#8a8a8a',
        // Warm tones for the brand mark and anything that should read as calm
        // rather than as a console. The shell is sand; the terminal stays green.
        'sand': '#e0c58c',
        'sand-deep': '#c9a86a',
        'term-green': '#34d399',
        'term-green-dim': '#0f9b6c',
        'term-green-faint': 'rgba(52, 211, 153, 0.14)',
        'term-amber': '#f59e0b',
        'term-cyan': '#06b6d4',
        'term-red': '#ef4444',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Courier New"', 'Courier', 'monospace'],
        display: ['"VT323"', '"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        }
      },
      animation: {
        blink: 'blink 1s step-start infinite',
        scanline: 'scanline 8s linear infinite',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
