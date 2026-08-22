// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Primary Challenge Manifest and Act Progression Rules for The Gauntlet

import forensicsPack from '../../packs/forensics-cli-101/pack.json' with { type: 'json' };
import forensicsChallenges from '../../packs/forensics-cli-101/challenges.json' with { type: 'json' };
import { PACKS, DEFAULT_PACK_ID, getPack, listPacks } from '../../packs/index.js';

export const ACT_DEFINITIONS = forensicsPack.acts;
export const BADGES = forensicsPack.badges;
export const BADGE_DEFINITIONS = forensicsPack.badges;
export const CHALLENGES = forensicsChallenges;
export const COURSE_TOOLS = forensicsPack.courseTools || {};

export { PACKS, DEFAULT_PACK_ID, getPack, listPacks };

/**
 * Shared unlock rule:
 * A student may skip ONE challenge per act before unlocking the next act.
 */
export function requiredSolvesToUnlock(actId, challenges = CHALLENGES) {
  const prior = challenges.filter(c => c.act === actId - 1);
  if (prior.length === 0) return 0;
  return Math.max(1, prior.length - 1);
}

export function isActUnlockedFor(act, solvedIdSet, challenges = CHALLENGES) {
  if (!act || !act.unlockThreshold) return true;
  const prior = challenges.filter(c => c.act === act.id - 1);
  if (prior.length === 0) return true;
  const solved = prior.filter(c => solvedIdSet.has(c.id)).length;
  return solved >= requiredSolvesToUnlock(act.id, challenges);
}
