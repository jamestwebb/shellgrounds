// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Redoing something you already solved.
//
// The rules being defended here are learning-design decisions, not arithmetic,
// so each test says which decision it is holding in place. They are all easy to
// undo by accident: paying for a re-solve is a one-line change, and so is
// leaving the answer on screen while a student tries to recall it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAY_MS, REVISIT_AFTER_DAYS,
  daysSinceSolved, sinceLabel, practiceState, revisitQueue
} from '../packages/engine/practice.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-08-23T12:00:00.000Z');
const agoDays = (d) => ({ solvedAt: new Date(NOW - d * DAY_MS).toISOString() });

describe('how long ago a challenge was solved', () => {
  it('counts whole days', () => {
    expect(daysSinceSolved(agoDays(0), NOW)).toBe(0);
    expect(daysSinceSolved(agoDays(1), NOW)).toBe(1);
    expect(daysSinceSolved(agoDays(30), NOW)).toBe(30);
  });

  it('returns null rather than NaN for a record with no usable date', () => {
    for (const bad of [undefined, null, {}, { solvedAt: null }, { solvedAt: 'whenever' }]) {
      expect(daysSinceSolved(bad, NOW)).toBeNull();
    }
  });

  // A machine whose clock is a few minutes fast should not report a solve from
  // the future, which would read as a negative age and sort to the top of the
  // revisit queue for ever.
  it('never goes negative when the clock is skewed forward', () => {
    expect(daysSinceSolved({ solvedAt: new Date(NOW + 5 * DAY_MS).toISOString() }, NOW)).toBe(0);
  });

  it('says it in words a student can act on', () => {
    expect(sinceLabel(0)).toBe('today');
    expect(sinceLabel(1)).toBe('yesterday');
    expect(sinceLabel(3)).toBe('3 days ago');
    expect(sinceLabel(9)).toBe('last week');
    expect(sinceLabel(21)).toBe('3 weeks ago');
    expect(sinceLabel(90)).toBe('3 months ago');
    expect(sinceLabel(null)).toBeNull();
  });
});

describe('which solves are worth going back to', () => {
  it('leaves a fresh solve alone', () => {
    expect(practiceState(agoDays(0), NOW).worthRevisiting).toBe(false);
    expect(practiceState(agoDays(REVISIT_AFTER_DAYS - 1), NOW).worthRevisiting).toBe(false);
  });

  it('suggests one that has had time to fade', () => {
    expect(practiceState(agoDays(REVISIT_AFTER_DAYS), NOW).worthRevisiting).toBe(true);
    expect(practiceState(agoDays(40), NOW).worthRevisiting).toBe(true);
  });

  // Records written before solvedAt existed have no date. Treating "unknown" as
  // "stale" would put a revisit marker on a student's entire history at once.
  it('does not nag about a solve it cannot date', () => {
    const state = practiceState({ points: 10 }, NOW);
    expect(state.solved).toBe(true);
    expect(state.worthRevisiting).toBe(false);
  });

  it('reports an unsolved challenge as unsolved, not as fresh', () => {
    expect(practiceState(undefined, NOW)).toEqual({
      solved: false, days: null, worthRevisiting: false, sinceLabel: null
    });
  });
});

describe('the revisit queue', () => {
  const challenges = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'unsolved' }
  ];
  const solves = { a: agoDays(3), b: agoDays(30), c: agoDays(9), d: agoDays(60) };

  // Ordered by forgetting, not by score. A challenge solved cleanly a month ago
  // has decayed more than one fumbled through yesterday.
  it('puts the stalest first', () => {
    expect(revisitQueue(challenges, solves, NOW, 5).map(c => c.id)).toEqual(['d', 'b', 'c']);
  });

  it('leaves out anything fresh, and anything never solved', () => {
    const ids = revisitQueue(challenges, solves, NOW, 5).map(c => c.id);
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('unsolved');
  });

  it('respects the limit and survives silly input', () => {
    expect(revisitQueue(challenges, solves, NOW, 2).map(c => c.id)).toEqual(['d', 'b']);
    expect(revisitQueue(challenges, solves, NOW, 0)).toEqual([]);
    expect(revisitQueue([], {}, NOW)).toEqual([]);
    expect(revisitQueue()).toEqual([]);
  });
});

describe('the rules survive in the interface, not only in this module', () => {
  const sidebar = fs.readFileSync(path.join(ROOT, 'src/components/ChallengeSidebar.jsx'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

  // Rule 1: acknowledge, never pay. A re-solve returns before any scoring, and
  // it says something first -- silence was the original bug.
  it('answers a re-solve and scores nothing for it', () => {
    expect(app).toMatch(/if \(solvesMap\[challenge\.id\]\)/);
    expect(app).toMatch(/Still right/);
  });

  // Rule 2: recall, not recognition. Practice swaps the paid hint count for a
  // local one that starts at zero, so what the student owns is hidden until
  // they ask for it back.
  it('hides the answer while practising', () => {
    expect(sidebar).toMatch(/practising \? practiceHintsShown : paidHints/);
    expect(sidebar).toMatch(/setPracticeHintsShown\(0\)/);
  });

  // Rule 3: do not charge twice. Reopening a bought hint is local and never
  // reaches onOpenHint, which is what prices and records a penalty.
  it('reopens a bought hint without calling the server', () => {
    const guard = sidebar.indexOf('if (practising && practiceHintsShown < paidHints)');
    const call = sidebar.indexOf('await onOpenHint(');
    expect(guard).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(guard);
  });
});
