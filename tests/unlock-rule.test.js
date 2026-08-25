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

  // The risk named in the linux-fundamentals content pass: moving a challenge
  // to an earlier act (l4-list-and, act 4 -> act 3, to put the && lesson ahead
  // of l3-boss) and adding new ones (l2-sort split in two, l2-uniq added)
  // change how many challenges sit in front of a gated act. If the required
  // COUNT rises as a result, a student who had already unlocked that act under
  // the old layout -- sitting at exactly the old required number, no more --
  // finds it locked again on their next visit, with no solve of their own
  // undone. Nothing in the sidebar would explain why an act they had open
  // yesterday is closed today.
  it('a challenge that changed act does not re-lock an act a mid-course student had already opened', () => {
    const pack = PACKS['linux-fundamentals'];
    // Reconstruct the pack roughly as it shipped before this content pass:
    // l4-list-and back in act 4, and without the two brand-new act-2
    // challenges (l2-sort-field, l2-uniq) this pass added.
    const ADDED_THIS_PASS = new Set(['l2-sort-field', 'l2-uniq']);
    const before = pack.challenges
      .filter(c => !ADDED_THIS_PASS.has(c.id))
      .map(c => (c.id === 'l4-list-and' ? { ...c, act: 4 } : c));

    for (const act of pack.manifest.acts) {
      if (!act.unlockThreshold) continue;
      const priorBefore = before.filter(c => c.act === act.id - 1);
      if (priorBefore.length === 0) continue;

      // A student sitting at exactly the old required count -- the tightest
      // case, the one closest to being locked out -- had this act unlocked
      // under the pack as it shipped before this pass.
      const oldRequired = serverRequired({ unlockThreshold: 0.8 }, priorBefore);
      const solved = new Set(priorBefore.slice(0, oldRequired).map(c => c.id));

      expect(
        isActUnlockedFor(act, solved, pack.challenges, pack.manifest.acts),
        `act ${act.id} was unlocked before this pass at ${oldRequired} solves and must stay unlocked`
      ).toBe(true);
    }
  });
});
