// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds brand mark: a prompt cursor in a ring, crosshaired.
// It carried through the rename untouched.

import React from 'react';

export const BrandMark = ({ size = 24, className = 'text-term-green' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Outer ring */}
    <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
    {/* Inner focus */}
    <circle cx="14" cy="14" r="6" stroke="currentColor" strokeWidth="1.75" />
    <circle cx="14" cy="14" r="2" fill="currentColor" />
    {/* Crosshairs */}
    <path d="M14 1v4M14 23v4M1 14h4M23 14h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);
