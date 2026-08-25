// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The Shellgrounds mark: a seashell resting on the ground, with a cursor
// waiting beside it.
//
// It replaces a crosshair. The old mark was a targeting reticle — dashed ring,
// centre dot, four crosshairs — which is a fine logo for something you aim at
// and the wrong one entirely for a place where a nervous first-year is meant
// to feel free to try a command and see what happens.
//
// The shape carries the name: a SHELL, on the GROUND, at a prompt. That
// matters beyond prettiness. "Shellgrounds" beside a rifle cartridge reads as
// ordnance; beside a spiral seashell it cannot. The picture settles what the
// word leaves open.
//
// Two colours on purpose. The shell takes currentColor, so it inherits
// whatever it sits in, and the cursor keeps the terminal accent — the one
// green thing on a warm mark, which is where the eye lands.


const SHELL_PATH = 'M 13.00 25.50 L 11.67 25.35 L 10.39 25.03 L 9.15 24.56 L 8.00 23.95 L 6.93 23.21 L 5.97 22.35 L 5.13 21.38 L 4.42 20.32 L 3.85 19.20 L 3.42 18.02 L 3.15 16.80 L 3.03 15.57 L 3.06 14.34 L 3.24 13.14 L 3.56 11.97 L 4.02 10.86 L 4.61 9.83 L 5.31 8.88 L 6.13 8.03 L 7.03 7.30 L 8.01 6.68 L 9.05 6.20 L 10.13 5.85 L 11.24 5.63 L 12.35 5.56 L 13.46 5.62 L 14.55 5.81 L 15.59 6.14 L 16.58 6.59 L 17.49 7.15 L 18.33 7.81 L 19.07 8.57 L 19.70 9.40 L 20.22 10.30 L 20.63 11.25 L 20.91 12.23 L 21.07 13.23 L 21.11 14.23 L 21.02 15.22 L 20.81 16.18 L 20.49 17.10 L 20.06 17.97 L 19.53 18.77 L 18.91 19.49 L 18.22 20.13 L 17.46 20.66 L 16.65 21.10 L 15.80 21.43 L 14.92 21.65 L 14.03 21.76 L 13.14 21.76 L 12.27 21.65 L 11.43 21.44 L 10.63 21.12 L 9.88 20.72 L 9.20 20.23 L 8.58 19.67 L 8.05 19.04 L 7.61 18.36 L 7.25 17.63 L 6.99 16.88 L 6.83 16.11 L 6.76 15.33 L 6.79 14.56 L 6.92 13.81 L 7.13 13.09 L 7.43 12.41 L 7.80 11.78 L 8.25 11.21 L 8.75 10.70 L 9.31 10.27 L 9.91 9.91 L 10.54 9.63 L 11.19 9.43 L 11.85 9.32 L 12.51 9.30 L 13.17 9.35 L 13.80 9.48 L 14.40 9.69 L 14.96 9.96 L 15.48 10.30 L 15.94 10.70 L 16.35 11.14 L 16.69 11.62 L 16.96 12.13 L 17.17 12.67 L 17.30 13.22 L 17.37 13.77 L 17.36 14.31 L 17.29 14.85 L 17.16 15.36 L 16.96 15.84 L 16.72 16.28 L 16.42 16.69 L 16.08 17.05 L 15.71 17.35 L 15.30 17.61 L 14.88 17.80 L 14.45 17.94 L 14.01 18.02 L 13.57 18.05 L 13.14 18.02 L 12.72 17.94 L 12.33 17.80 L 11.97 17.63 L 11.64 17.41 L 11.34 17.16 L 11.09 16.89 L 10.87 16.58 L 10.71 16.27';

export const BrandMark = ({
  size = 24,
  className = 'text-sand',
  cursorClassName = 'text-term-green',
  showGround = true
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    role="img"
    aria-label="Shellgrounds"
  >
    <path
      d={SHELL_PATH}
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {showGround && (
      <path
        d="M3.2 25.5 H28.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
    )}
    <rect
      x="23.4"
      y="18.4"
      width="4"
      height="6"
      rx="0.8"
      className={cursorClassName}
      fill="currentColor"
    />
  </svg>
);
