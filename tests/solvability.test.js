// Every challenge must be completable by its canonical solution — the exact
// command a student following the brief/hints would run. This is the permanent
// regression net for the "no way to get the points" class of bug: regexes that
// reject correct commands, flags that never render, state checks that cannot
// pass, and validation that mirrors client/server drift.

import { describe, it, expect } from 'vitest';
import { CHALLENGES, ACT_DEFINITIONS, isActUnlockedFor } from '../src/data/challenges.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { createWarrenFilesystem } from '../src/engine/fs.warren.js';
import { createTopsideFilesystem } from '../src/engine/fs.topside.js';
import { injectFlagsIntoVFS, replaceFlagTokens } from '../src/utils/vfs-injector.js';
import { generateUserFlag } from '../src/engine/crypto-utils.js';
import { formatManPage } from '../src/engine/help.js';

const SECRET = 'solvability-secret';
const HANDLE = 'test_player';

// Keep in sync with submit-flag.js and App.jsx
const ERROR_MARKERS = /command not found|not available in this simulator|that is the (Linux|Windows) name|No such file|missing operand|Not a directory|Is a directory|cannot access|is not recognized|cannot find/i;

const flags = {};
for (const c of CHALLENGES) {
  if (c.success?.kind === 'flag' && !c.success.staticFlag) {
    flags[c.id] = generateUserFlag(SECRET, HANDLE, c.id);
  }
}

const freshFs = (isWindows) => {
  const base = isWindows ? createTopsideFilesystem() : createWarrenFilesystem();
  return injectFlagsIntoVFS(base, HANDLE, flags).fs;
};

// Canonical solutions: for 'command' kind the command itself; for 'flag' kind
// the command whose output reveals the flag; for 'state' kind the command that
// satisfies the check. `variants` are alternate (cwd, command) pairs students
// plausibly use that must ALSO validate.
const SOLUTIONS = {
  'act1-pwd':          { command: 'pwd' },
  'act1-ls':           { command: 'ls' },
  'act1-hidden':       { flagVia: 'cat .stash' },
  'act1-cd':           { flagVia: 'cat training/level_1/checkpoint_alpha.txt' },
  'act1-paths':        { flagVia: 'cat training/level_2/checkpoint_beta.txt' },
  'act1-tab':          { command: 'cd Documents' },
  'act1-history':      { command: 'pwd' },
  'act2-cat':          { command: 'cat Documents/case_notes.txt',
                         variants: [{ cwd: '/home/analyst/Documents', command: 'cat case_notes.txt' }] },
  'act2-head':         { command: 'head -n 5 Documents/access.log',
                         variants: [{ cwd: '/home/analyst/Documents', command: 'head -n 5 access.log' }] },
  'act2-tail':         { flagVia: 'tail Documents/access.log' },
  'act2-file':         { command: 'file evidence/mystery_file',
                         variants: [{ cwd: '/home/analyst/evidence', command: 'file mystery_file' }] },
  'act2-strings':      { flagVia: 'strings evidence/binary_data' },
  'act2-md5':          { flagVia: 'cat evidence/evidence.img' },
  'act3-grep':         { flagVia: 'grep vault_passcode Documents/secrets.txt' },
  'act3-grepi':        { flagVia: 'grep -i "error" Documents/logs.txt' },
  'act3-find':         { flagVia: 'cat /var/log/sensor_audit.log' },
  'act3-crossing':     { flagVia: 'cat /mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt' },
  'act3-crossing-solo':{ flagVia: 'cat /mnt/c/Users/analyst/Documents/surface_notes.txt' },
  'act3-man':          { flagViaMan: 'tracker' },
  'act3-apt':          { flagVia: 'tracker -a', needsPackage: 'tracker' },
  'act4-grep-v':       { flagVia: 'grep -v "ALLOW" Documents/network_stream.log' },
  'act4-pipe-count':   { command: 'grep -v "ALLOW" Documents/network_stream.log | wc -l' },
  'act4-pipe-csv':     { flagVia: 'grep "FLAG_EMIT" Documents/security_events.csv | cut -d, -f6' },
  'act4-redirect':     { stateVia: 'grep -i "error" Documents/logs.txt > /tmp/errors.log' },
  'act5-scan':         { command: 'scan evidence/suspect_drive.raw',
                         variants: [{ cwd: '/home/analyst/evidence', command: 'scan suspect_drive.raw' }] },
  'act5-capstone':     { flagVia: 'extract -o 206848 evidence/suspect_drive.raw' },
  'topside-nav':       { command: 'dir' },
  'topside-attrib':    { flagVia: 'type evidence\\mystery_file' },
  'topside-findstr':   { flagVia: 'findstr /i "marker" Documents\\logs.txt' },
  'topside-certutil':  { command: 'certutil -hashfile evidence\\evidence.img MD5' }
};

const runSolution = (challenge, command, cwdOverride) => {
  const isWindows = challenge.platform === 'windows';
  const fs = freshFs(isWindows);
  const cwd = cwdOverride || challenge.setup?.cwd || (isWindows ? 'C:\\Users\\Analyst' : '/home/analyst');
  const sol = SOLUTIONS[challenge.id];
  const ctx = { installedPackages: new Set(sol.needsPackage ? [sol.needsPackage] : []) };
  return runPipeline(command, cwd, fs, isWindows ? 'windows' : 'linux', ctx);
};

const expectClean = (res, label) => {
  expect(res.hasError, `${label}: command errored: ${res.output}`).toBeFalsy();
  expect(ERROR_MARKERS.test(res.output || ''), `${label}: output tripped ERROR_MARKERS: ${res.output}`).toBe(false);
};

describe('Solvability: every challenge has a working canonical solution', () => {
  it('covers every challenge exactly', () => {
    const ids = CHALLENGES.map(c => c.id).sort();
    expect(Object.keys(SOLUTIONS).sort()).toEqual(ids);
  });

  for (const challenge of CHALLENGES) {
    const sol = SOLUTIONS[challenge.id];
    if (!sol) continue;

    it(`${challenge.id} [${challenge.success.kind}] "${challenge.title}"`, () => {
      if (challenge.success.kind === 'command') {
        const regex = new RegExp(challenge.success.matchRegex, 'i');
        expect(regex.test(sol.command), `regex rejects canonical command: ${sol.command}`).toBe(true);
        expectClean(runSolution(challenge, sol.command), sol.command);
        for (const v of sol.variants || []) {
          expect(regex.test(v.command), `regex rejects variant: ${v.command}`).toBe(true);
          expectClean(runSolution(challenge, v.command, v.cwd), `${v.command} (from ${v.cwd})`);
        }
      } else if (challenge.success.kind === 'flag') {
        const expected = challenge.success.staticFlag || flags[challenge.id];
        expect(expected, 'no flag derivable for this challenge').toBeTruthy();
        let revealed;
        if (sol.flagViaMan) {
          revealed = replaceFlagTokens(formatManPage(sol.flagViaMan), flags);
        } else {
          const res = runSolution(challenge, sol.flagVia);
          expectClean(res, sol.flagVia);
          revealed = replaceFlagTokens(res.output, flags);
        }
        expect(revealed, `flag not revealed by: ${sol.flagVia || 'man ' + sol.flagViaMan}`).toContain(expected);
      } else if (challenge.success.kind === 'state') {
        const res = runSolution(challenge, sol.stateVia);
        expectClean(res, sol.stateVia);
        expect(!!challenge.success.check(res.fs), `state check fails after: ${sol.stateVia}`).toBe(true);
      } else {
        throw new Error(`unknown success kind: ${challenge.success.kind}`);
      }
    });
  }
});

// Beginner variants that must ALSO be accepted — a correct command must never
// be silently ignored (the "no way to get the points" bug class).
describe('Variant tolerance for command challenges', () => {
  const VARIANTS = [
    ['act1-pwd', 'pwd '], ['act1-ls', 'ls .'],
    ['act1-tab', 'cd ./Documents'], ['act1-tab', 'cd /home/analyst/Documents'], ['act1-tab', 'cd ~/Documents'],
    ['act2-cat', 'cat ./Documents/case_notes.txt'], ['act2-cat', 'cat "Documents/case_notes.txt"'],
    ['act2-head', 'head -n 5 "Documents/access.log"'], ['act2-head', 'head -n5 Documents/access.log'],
    ['act2-file', 'file ./evidence/mystery_file'],
    ['act5-scan', 'scan "evidence/suspect_drive.raw"'],
    ['topside-nav', 'dir '],
    ['topside-certutil', 'certutil -hashfile evidence/evidence.img md5']
  ];
  for (const [id, variant] of VARIANTS) {
    it(`${id} accepts: ${variant}`, () => {
      const challenge = CHALLENGES.find(c => c.id === id);
      expect(new RegExp(challenge.success.matchRegex, 'i').test(variant.trim()),
        `regex rejected "${variant}"`).toBe(true);
      const isWindows = challenge.platform === 'windows';
      const baseFs = isWindows ? createTopsideFilesystem() : createWarrenFilesystem();
      const { fs } = injectFlagsIntoVFS(baseFs, HANDLE, flags);
      const cwd = challenge.setup?.cwd || (isWindows ? 'C:\\Users\\Analyst' : '/home/analyst');
      const res = runPipeline(variant, cwd, fs, isWindows ? 'windows' : 'linux', { installedPackages: new Set() });
      expect(res.hasError, `"${variant}" errored: ${res.output}`).toBeFalsy();
    });
  }
});

describe('Act progression allows exactly one skip', () => {
  it('every gated act unlocks with one challenge skipped in the prior act', () => {
    for (const act of ACT_DEFINITIONS.filter(a => a.unlockThreshold > 0)) {
      const prior = CHALLENGES.filter(c => c.act === act.id - 1);
      const allButOne = new Set(prior.slice(0, prior.length - 1).map(c => c.id));
      expect(isActUnlockedFor(act, allButOne, CHALLENGES),
        `Act ${act.id} demands 100% of the previous act`).toBe(true);
    }
  });
});
