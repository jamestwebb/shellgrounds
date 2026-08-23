// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The sidebar decides whether a student can SEE an act; the server decides
// whether their solve SCORES. If those two rules disagree, a student is shown a
// locked act the server would have accepted, and cannot reach it at all.

import { describe, it, expect } from 'vitest';
import { requiredSolvesToUnlock, isActUnlockedFor } from '../src/data/challenges.js';
import { PACKS } from '../packs/index.js';

// The server's rule, copied from netlify/functions/submit-flag.js.
function serverRequired(act, prior) {
  const byThreshold = Math.ceil(prior.length * (act.unlockThreshold ?? 0.8));
  return Math.min(Math.max(1, byThreshold), Math.max(1, prior.length - 1));
}

describe('act unlock rule agrees between client and server', () => {
  for (const pack of Object.values(PACKS)) {
    for (const act of pack.manifest.acts) {
      const prior = pack.challenges.filter(c => c.act === act.id - 1);
      if (prior.length === 0 || !act.unlockThreshold) continue;

      it(`${pack.id} act ${act.id} requires the same number either side`, () => {
        expect(requiredSolvesToUnlock(act.id, pack.challenges, pack.manifest.acts))
          .toBe(serverRequired(act, prior));
      });
    }
  }

  it('never requires every challenge in the previous act', () => {
    for (const pack of Object.values(PACKS)) {
      for (const act of pack.manifest.acts) {
        const prior = pack.challenges.filter(c => c.act === act.id - 1);
        if (prior.length < 2 || !act.unlockThreshold) continue;
        expect(requiredSolvesToUnlock(act.id, pack.challenges, pack.manifest.acts))
          .toBeLessThan(prior.length);
      }
    }
  });

  it('unlocks once the required number is solved', () => {
    const pack = PACKS['linux-fundamentals'];
    const act = pack.manifest.acts.find(a => a.unlockThreshold && a.id > 1);
    if (!act) return;
    const prior = pack.challenges.filter(c => c.act === act.id - 1);
    const need = requiredSolvesToUnlock(act.id, pack.challenges, pack.manifest.acts);
    const solved = new Set(prior.slice(0, need).map(c => c.id));
    expect(isActUnlockedFor(act, solved, pack.challenges, pack.manifest.acts)).toBe(true);

    const oneShort = new Set(prior.slice(0, need - 1).map(c => c.id));
    expect(isActUnlockedFor(act, oneShort, pack.challenges, pack.manifest.acts)).toBe(false);
  });
});
