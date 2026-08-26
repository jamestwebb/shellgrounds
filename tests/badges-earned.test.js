// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The badge rule, and the fact that only one thing owns it.
//
// Thirteen badges across three packs, and the rule that awards them existed in
// exactly one place: an inline table inside netlify/functions/leaderboard.js.
// A rule the browser cannot reach can only ever produce a late answer, so the
// only way a student learned they had earned something was by opening a
// ranking, afterwards, if they ever opened one.
//
// packages/engine/badges.js now owns the rule so both sides can ask it. These
// tests pin two separate things: that the rule is right, and that the two
// copies of it have not drifted apart while nobody was looking.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { badgesEarned, badgeIdsEarned, BADGE_THRESHOLD } from '../packages/engine/badges.js';
import { PACKS, getPack } from '../packs/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const forensics = getPack('forensics-cli-101');
const act1 = forensics.challenges.filter(c => c.act === 1).map(c => c.id);
const needed = Math.ceil(act1.length * BADGE_THRESHOLD);

describe('badgesEarned', () => {
  it('awards nothing to a student who has solved nothing', () => {
    expect(badgesEarned(forensics, [])).toEqual([]);
  });

  it('awards the act badge at the threshold, and not one solve before it', () => {
    expect(badgeIdsEarned(forensics, act1.slice(0, needed - 1))).not.toContain('badge-first-on-scene');
    expect(badgeIdsEarned(forensics, act1.slice(0, needed))).toContain('badge-first-on-scene');
  });

  it('does not require every challenge in the act', () => {
    // The same reason the next act unlocks early: a student stuck on one
    // challenge must still be able to move on, and must still be paid for the
    // act they have effectively done.
    expect(needed).toBeLessThan(act1.length);
  });

  it('returns the pack\'s own badge object, so a caller can show it', () => {
    const [badge] = badgesEarned(forensics, act1);
    expect(badge).toMatchObject({ id: 'badge-first-on-scene', name: expect.any(String) });
    expect(badge.description.length).toBeGreaterThan(10);
    expect(badge.icon).toBeTruthy();
  });

  it('takes a Set as readily as an array', () => {
    expect(badgeIdsEarned(forensics, new Set(act1))).toEqual(badgeIdsEarned(forensics, act1));
  });

  it('ignores solves that belong to another pack', () => {
    const other = getPack('linux-fundamentals').challenges.map(c => c.id);
    expect(badgesEarned(forensics, other)).toEqual([]);
  });

  it('awards every act badge to a student who has finished the pack', () => {
    const all = forensics.challenges.map(c => c.id);
    const withActs = forensics.manifest.badges.filter(b => b.act).map(b => b.id);
    expect(badgeIdsEarned(forensics, all)).toEqual(withActs);
  });

  it('survives a pack with no badges and a caller with no solves', () => {
    expect(badgesEarned({ manifest: {}, challenges: [] }, ['anything'])).toEqual([]);
    expect(badgesEarned(null, null)).toEqual([]);
    expect(badgesEarned(forensics, undefined)).toEqual([]);
  });

  it('works for every shipped pack', () => {
    for (const pack of Object.values(PACKS)) {
      const all = pack.challenges.map(c => c.id);
      const earned = badgeIdsEarned(pack, all);
      expect(earned.length, `${pack.id} awards nothing for finishing it`).toBeGreaterThan(0);
      expect(badgeIdsEarned(pack, [])).toEqual([]);
    }
  });
});

describe('one rule, one implementation', () => {
  // The leaderboard function used to carry its own copy of this rule. The two
  // agreed on the day the copy was made, which is the only day two
  // implementations of one rule ever do: the drift would have been invisible,
  // showing as a celebration for a badge the board does not list, or a badge on
  // the board the student was never told about.
  const leaderboard = fs.readFileSync(
    path.join(ROOT, 'netlify/functions/leaderboard.js'), 'utf8'
  );

  it('the leaderboard calls the shared rule', () => {
    expect(leaderboard).toMatch(/import \{[^}]*badgesEarned[^}]*\} from/);
    expect(leaderboard).toContain('badgesEarned(pack, solvedSet)');
  });

  it('the leaderboard no longer carries a second copy', () => {
    expect(leaderboard, 'a duplicated threshold is how the two drift apart')
      .not.toContain('Math.ceil(');
    expect(leaderboard).not.toContain('BADGE_RULES');
  });

  it('a badge with no act is awarded to nobody', () => {
    const actless = { id: 'x', name: 'No act' };
    const pack = { manifest: { badges: [actless] }, challenges: [{ id: 'c1', act: 1 }] };
    expect(badgesEarned(pack, ['c1'])).toEqual([]);
  });
});
