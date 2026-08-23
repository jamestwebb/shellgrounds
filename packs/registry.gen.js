// GENERATED FILE — do not edit by hand.
// Written by scripts/build-registry.mjs, which scans packs/*/pack.json.
// Add a pack directory (or run `gauntlet import`), then regenerate:
//   node scripts/build-registry.mjs

import forensicsCli101Manifest from './forensics-cli-101/pack.json' with { type: 'json' };
import forensicsCli101Challenges from './forensics-cli-101/challenges.json' with { type: 'json' };
import forensicsCli101Help from './forensics-cli-101/help.json' with { type: 'json' };
import { FORENSICS_PACK_COMMANDS as forensicsCli101Commands } from './forensics-cli-101/commands.js';
import { createLinuxFilesystem as forensicsCli101Linux } from './forensics-cli-101/fs.linux.js';
import { createWindowsFilesystem as forensicsCli101Windows } from './forensics-cli-101/fs.windows.js';

import linuxFundamentalsManifest from './linux-fundamentals/pack.json' with { type: 'json' };
import linuxFundamentalsChallenges from './linux-fundamentals/challenges.json' with { type: 'json' };
import { createLinuxFundamentalsFilesystem as linuxFundamentalsLinux } from './linux-fundamentals/fs.linux.js';

import windowsCmdEssentialsManifest from './windows-cmd-essentials/pack.json' with { type: 'json' };
import windowsCmdEssentialsChallenges from './windows-cmd-essentials/challenges.json' with { type: 'json' };
import { createWindowsEssentialsFilesystem as windowsCmdEssentialsWindows } from './windows-cmd-essentials/fs.windows.js';

export const GENERATED_PACKS = {
  'forensics-cli-101': {
    id: 'forensics-cli-101',
    manifest: forensicsCli101Manifest,
    challenges: forensicsCli101Challenges,
    help: forensicsCli101Help,
    commands: forensicsCli101Commands,
    createFs: (platform) => platform === 'windows' ? forensicsCli101Windows() : forensicsCli101Linux()
  },
  'linux-fundamentals': {
    id: 'linux-fundamentals',
    manifest: linuxFundamentalsManifest,
    challenges: linuxFundamentalsChallenges,
    help: {},
    commands: {},
    createFs: (platform) => platform === 'windows' ? linuxFundamentalsLinux() : linuxFundamentalsLinux()
  },
  'windows-cmd-essentials': {
    id: 'windows-cmd-essentials',
    manifest: windowsCmdEssentialsManifest,
    challenges: windowsCmdEssentialsChallenges,
    help: {},
    commands: {},
    createFs: (platform) => platform === 'windows' ? windowsCmdEssentialsWindows() : windowsCmdEssentialsWindows()
  },
};
