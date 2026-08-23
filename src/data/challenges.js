// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Act progression rules, shared by the sidebar and kept in step with the server.
//
// The forensics re-exports below are legacy defaults only: every component now
// receives its pack's own acts, badges and challenges as props.

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
 * Shared unlock rule. This MUST agree with isActUnlocked in
 * netlify/functions/submit-flag.js, because the two gate different things: the
 * server decides whether a solve scores, and this decides whether the student
 * is even shown the act.
 *
 * It used to be the stricter `prior.length - 1` here and a threshold on the
 * server. On an act of ten challenges the server would accept the ninth solve
 * while the sidebar still showed the next act locked, so the student could not
 * reach a challenge the server was willing to score.
 *
 * The rule: honour the author's configured threshold, but never require every
 * challenge — a student stuck on one must still be able to move on.
 */
export function requiredSolvesToUnlock(actId, challenges = CHALLENGES, acts = ACT_DEFINITIONS) {
  const prior = challenges.filter(c => c.act === actId - 1);
  if (prior.length === 0) return 0;
  const act = (acts || []).find(a => a.id === actId);
  const byThreshold = Math.ceil(prior.length * (act?.unlockThreshold ?? 0.8));
  return Math.min(Math.max(1, byThreshold), Math.max(1, prior.length - 1));
}

export function isActUnlockedFor(act, solvedIdSet, challenges = CHALLENGES, acts = ACT_DEFINITIONS) {
  if (!act || !act.unlockThreshold) return true;
  const prior = challenges.filter(c => c.act === act.id - 1);
  if (prior.length === 0) return true;
  const solved = prior.filter(c => solvedIdSet.has(c.id)).length;
  return solved >= requiredSolvesToUnlock(act.id, challenges, acts);
}
