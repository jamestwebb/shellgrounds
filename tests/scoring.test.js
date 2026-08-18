// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Regression test for the NaN leaderboard.
//
// addSolve took (handle, challengeId, points, hintPenalty) positionally while
// submit-flag.js passed an object as the third argument. The payload landed
// nested under `.points`, every reader computed `object - 0`, and every score
// and rank rendered as NaN. Records in that shape are still in the live store,
// so the reader must handle both shapes for as long as they exist.

import { describe, it, expect } from 'vitest';
import { normalizeSolve } from '../netlify/functions/utils/store.js';

describe('Solve record scoring', () => {
  it('reads the correct flat record', () => {
    const s = normalizeSolve({ points: 30, hintPenalty: 10, earnedPoints: 20, solvedAt: 'x' });
    expect(s.netPoints).toBe(20);
    expect(Number.isFinite(s.netPoints)).toBe(true);
  });

  it('reads a LEGACY record whose payload is nested under .points', () => {
    const legacy = {
      points: { points: 30, hintPenalty: 10, earnedPoints: 20, solvedAt: 'x' },
      solvedAt: 'y'
    };
    const s = normalizeSolve(legacy);
    expect(s.points).toBe(30);
    expect(s.hintPenalty).toBe(10);
    expect(s.netPoints).toBe(20);
    expect(s.solvedAt).toBe('y');
  });

  it('never returns NaN, whatever it is handed', () => {
    for (const bad of [null, undefined, {}, { points: {} }, { points: 'x' }, { points: 10 }]) {
      const s = normalizeSolve(bad);
      expect(Number.isFinite(s.netPoints), `netPoints for ${JSON.stringify(bad)}`).toBe(true);
      expect(Number.isFinite(s.points)).toBe(true);
      expect(s.netPoints).toBeGreaterThanOrEqual(0);
    }
  });

  it('derives netPoints when earnedPoints is absent, and never goes negative', () => {
    expect(normalizeSolve({ points: 30, hintPenalty: 10 }).netPoints).toBe(20);
    expect(normalizeSolve({ points: 10, hintPenalty: 40 }).netPoints).toBe(0);
  });

  it('a whole board of legacy records sums to a real number', () => {
    const board = {
      a: { points: { points: 10, hintPenalty: 0, earnedPoints: 10 } },
      b: { points: { points: 25, hintPenalty: 5, earnedPoints: 20 } },
      c: { points: 15, hintPenalty: 0, earnedPoints: 15 }
    };
    const total = Object.values(board).reduce((sum, r) => sum + normalizeSolve(r).netPoints, 0);
    expect(total).toBe(45);
  });
});
