// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Content pack registry and loader.

import { GENERATED_PACKS } from './registry.gen.js';

// The registry is generated from the packs/ directory by
// scripts/build-registry.mjs, so adding or importing a pack no longer means
// hand-editing this file. Both the browser bundle and the Netlify functions
// import it, and Vite's import.meta.glob only solves the browser half — hence a
// generated file of plain static imports, committed so deploying needs no
// extra step. Regenerate with:  node scripts/build-registry.mjs
export const PACKS = GENERATED_PACKS;

export const DEFAULT_PACK_ID = 'forensics-cli-101';

// Which pack owns a challenge id. The server resolves the pack from the
// submitted id rather than from the session token, because the token's pack was
// fixed at registration and the browser had no way to change it — which made 67
// of the 97 challenges impossible to score.
//
// That only works while ids are globally unique, so a collision throws at
// import time. A duplicate would silently score a challenge against another
// pack's filesystem; failing to boot is much kinder than that.
export const CHALLENGE_INDEX = (() => {
  const index = new Map();
  for (const pack of Object.values(PACKS)) {
    for (const c of pack.challenges) {
      const existing = index.get(c.id);
      if (existing) {
        throw new Error(
          `Duplicate challenge id '${c.id}' in packs '${existing.id}' and '${pack.id}'. ` +
          'Challenge ids must be unique across all packs.'
        );
      }
      index.set(c.id, pack);
    }
  }
  return index;
})();

export function getPackForChallenge(challengeId) {
  return CHALLENGE_INDEX.get(challengeId) || null;
}

// Never index PACKS with a bare bracket on caller-supplied text. Every member
// of Object.prototype answers truthily: PACKS['constructor'] returned the Object
// constructor, and a session token minted with packId 'constructor' made
// /api/manifest throw for 72 hours.
export function hasPack(packId) {
  return typeof packId === 'string' && Object.prototype.hasOwnProperty.call(PACKS, packId);
}

export function getPack(packId = DEFAULT_PACK_ID) {
  return hasPack(packId) ? PACKS[packId] : PACKS[DEFAULT_PACK_ID];
}

export function listPacks() {
  return Object.values(PACKS).map(p => ({
    id: p.id,
    name: p.manifest.name,
    version: p.manifest.version,
    platforms: p.manifest.platforms,
    theme: p.manifest.theme,
    acts: p.manifest.acts,
    badges: p.manifest.badges
  }));
}
