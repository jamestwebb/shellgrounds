/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'term-black': '#050505',
        'term-void': '#030303',
        'term-gray': '#0a0a0a',
        'term-panel': '#111111',
        'term-panel-light': '#181818',
        'term-border': '#262626',
        'term-border-bright': '#3a3a3a',
        'term-green': '#22c55e',
        'term-green-dim': '#15803d',
        'term-green-faint': 'rgba(34, 197, 94, 0.15)',
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
