// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Content Pack Registry and Loader for The Gauntlet

import forensicsPackJson from './forensics-cli-101/pack.json' with { type: 'json' };
import forensicsChallenges from './forensics-cli-101/challenges.json' with { type: 'json' };
import forensicsHelp from './forensics-cli-101/help.json' with { type: 'json' };
import { createWarrenFilesystem } from './forensics-cli-101/fs.linux.js';
import { createTopsideFilesystem } from './forensics-cli-101/fs.windows.js';
import { FORENSICS_PACK_COMMANDS } from './forensics-cli-101/commands.js';

import linuxFundPackJson from './linux-fundamentals/pack.json' with { type: 'json' };
import linuxFundChallenges from './linux-fundamentals/challenges.json' with { type: 'json' };
import { createLinuxFundamentalsFilesystem } from './linux-fundamentals/fs.linux.js';

import winCmdPackJson from './windows-cmd-essentials/pack.json' with { type: 'json' };
import winCmdChallenges from './windows-cmd-essentials/challenges.json' with { type: 'json' };
import { createWindowsEssentialsFilesystem } from './windows-cmd-essentials/fs.windows.js';

export const PACKS = {
  'forensics-cli-101': {
    id: 'forensics-cli-101',
    manifest: forensicsPackJson,
    challenges: forensicsChallenges,
    help: forensicsHelp,
    commands: FORENSICS_PACK_COMMANDS,
    createFs: (platform) => platform === 'windows' ? createTopsideFilesystem() : createWarrenFilesystem()
  },
  'linux-fundamentals': {
    id: 'linux-fundamentals',
    manifest: linuxFundPackJson,
    challenges: linuxFundChallenges,
    help: {},
    commands: {},
    createFs: () => createLinuxFundamentalsFilesystem()
  },
  'windows-cmd-essentials': {
    id: 'windows-cmd-essentials',
    manifest: winCmdPackJson,
    challenges: winCmdChallenges,
    help: {},
    commands: {},
    createFs: () => createWindowsEssentialsFilesystem()
  }
};

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

export function getPack(packId = DEFAULT_PACK_ID) {
  return PACKS[packId] || PACKS[DEFAULT_PACK_ID];
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
