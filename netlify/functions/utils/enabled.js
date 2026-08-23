// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Which packs this site is currently offering.
//
// There are two sources and they are not equal:
//
//   1. The saved settings record, written from the instructor screen. This
//      wins, and it changes the moment a teacher clicks a toggle.
//   2. ENABLED_PACKS, the deploy-time variable. It is the seed: what the site
//      offers before anybody has been through setup, and what a teacher who
//      never opens the screen gets.
//
// The variable is not overwritten when a teacher saves. That would make the
// dashboard lie about what the site is doing, and there is no way for a site
// to write back to its own build configuration anyway.
//
// Why this file is separate from packs/index.js: that module is imported by
// the browser bundle, and reading a settings record means reaching the blob
// store, which exists only inside a Netlify function.

import { getSettings } from './store.js';
import { PACKS, hasPack, enabledPackIds as enabledFromEnvironment } from '../../../packs/index.js';

/**
 * @returns {Promise<{ enabledPacks: string[], configured: boolean, source: 'settings'|'environment' }>}
 *   `configured` is false until an instructor saves, which is what puts them on
 *   the pack screen at first login instead of the class view.
 */
export async function readEnabledPacks() {
  let saved = null;
  try {
    saved = await getSettings();
  } catch (err) {
    // A store that cannot be read must not take the site down. Fall back to
    // the deploy-time setting, which is the behaviour before this existed.
    console.error('Could not read site settings; using ENABLED_PACKS:', err);
  }

  const listed = Array.isArray(saved?.enabledPacks) ? saved.enabledPacks.filter(hasPack) : [];
  if (listed.length > 0) {
    return { enabledPacks: listed, configured: true, source: 'settings' };
  }

  return {
    enabledPacks: enabledFromEnvironment(),
    configured: false,
    source: 'environment'
  };
}

export async function enabledPackIds() {
  return (await readEnabledPacks()).enabledPacks;
}

/** True when a student of this site may see and be graded on the pack. */
export async function isPackEnabled(packId) {
  if (!hasPack(packId)) return false;
  return (await enabledPackIds()).includes(packId);
}

/** The pack a student lands on: the first one this site offers. */
export async function defaultPackId() {
  return (await enabledPackIds())[0];
}

/**
 * Validates a list an instructor submitted.
 * @returns {{ ok: true, ids: string[] } | { ok: false, error: string }}
 */
export function validateEnabledPacks(value) {
  if (!Array.isArray(value)) {
    return { ok: false, error: 'Expected a list of pack ids.' };
  }

  const seen = new Set();
  const ids = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return { ok: false, error: 'Every pack id must be text.' };
    const id = raw.trim();
    if (!hasPack(id)) return { ok: false, error: `There is no pack called '${id}'.` };
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  // A site offering nothing is a broken site, and the teacher who did it would
  // see an empty page with no way back in. Switching off the last pack has to
  // be refused where it happens, with a reason.
  if (ids.length === 0) {
    return {
      ok: false,
      error: 'Keep at least one pack switched on. A site with none shows students an empty page.'
    };
  }

  return { ok: true, ids };
}

/** Everything the instructor screen needs to draw the list. */
export function packCatalogue() {
  return Object.values(PACKS).map(pack => ({
    id: pack.id,
    name: pack.manifest.name,
    version: pack.manifest.version,
    platforms: pack.manifest.platforms || [],
    challenges: pack.challenges.length,
    acts: (pack.manifest.acts || []).length,
    builtIn: true
  }));
}
