// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
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
