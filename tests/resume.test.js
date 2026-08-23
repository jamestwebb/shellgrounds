// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Where a returning student lands.
//
// `resumeSelection` was written, reviewed, and then left uncalled for several
// commits. Every student who signed in was put back on challenge one however
// far through the course they were, and nothing looked wrong: the first screen
// of a course is a perfectly plausible first screen, so the only way to notice
// was to be a student with progress and to remember having made it.
//
// So there are two tests here, and the second one matters more than the first.
// One checks that the function is right. The other checks that it is CALLED --
// a correct function nobody runs is what this file exists to catch.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resumeSelection, homeFor, cwdExists } from '../src/App.jsx';
import { PACKS } from '../packs/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Source with comments removed, for assertions about what the code DOES.
 * A file that documents a mistake contains the mistake as prose, and a plain
 * search cannot tell the difference.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('a returning student lands where they stopped', () => {
  const challenges = [
    { id: 'a', act: 1, platform: 'linux' },
    { id: 'b', act: 1, platform: 'linux' },
    { id: 'c', act: 2, platform: 'linux' },
    { id: 'w', act: 3, platform: 'windows' }
  ];

  it('starts a new student at the beginning', () => {
    expect(resumeSelection(challenges, {}).id).toBe('a');
  });

  it('skips what they have already done', () => {
    expect(resumeSelection(challenges, { a: {}, b: {} }).id).toBe('c');
  });

  it('prefers the main course over the Windows parity act', () => {
    // 'w' is unsolved and earlier in nothing, but the bonus track is not the
    // next step for somebody still working through the Linux acts.
    expect(resumeSelection(challenges, { a: {} }).id).toBe('b');
  });

  it('falls through to the parity act once the main course is done', () => {
    expect(resumeSelection(challenges, { a: {}, b: {}, c: {} }).id).toBe('w');
  });

  // The exact case that was reported: a student with every challenge solved was
  // dropped back on "Where Am I?", which is the one screen they had certainly
  // finished with.
  it('does not send a finished student back to challenge one', () => {
    const all = Object.fromEntries(challenges.map(c => [c.id, {}]));
    expect(resumeSelection(challenges, all).id).not.toBe('a');
    expect(resumeSelection(challenges, all).id).toBe('w');
  });

  it('survives a pack with one challenge, and an empty one', () => {
    expect(resumeSelection([{ id: 'only', act: 1 }], { only: {} }).id).toBe('only');
    expect(resumeSelection([], {})).toBeUndefined();
  });

  it('lands on a real challenge for every shipped pack', () => {
    for (const pack of Object.values(PACKS)) {
      const first = resumeSelection(pack.challenges, {});
      expect(first, pack.id).toBeTruthy();
      expect(pack.challenges.some(c => c.id === first.id), pack.id).toBe(true);

      const done = Object.fromEntries(pack.challenges.map(c => [c.id, {}]));
      const last = resumeSelection(pack.challenges, done);
      expect(pack.challenges.some(c => c.id === last.id), pack.id).toBe(true);
    }
  });
});

describe('the resume is actually wired up', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

  // The regression was not a wrong function. It was a right function with no
  // caller, so this is the assertion that would have caught it.
  it('App.jsx calls resumeSelection, not just declares it', () => {
    // Matches a CALL whose result is used -- `= resumeSelection(`. The
    // declaration reads `resumeSelection = (`, so it cannot satisfy this by
    // accident, which is the entire point of the assertion.
    expect(app).toMatch(/=\s*resumeSelection\(/);
  });

  it('applies the result to the selected challenge', () => {
    expect(app).toMatch(/setSelectedChallengeId\(resume\.id\)/);
  });

  // Silence after a correct answer reads as a broken terminal, which is how the
  // dead resume was first noticed at all.
  it('answers a student who redoes a challenge they already own', () => {
    expect(app).toMatch(/Still right/);
  });
});

describe('a student always stands somewhere that exists', () => {
  // '/home/analyst' was the initial cwd and the fallback on both platform
  // branches, and no pack has ever contained it. Anybody who reached it was in
  // a directory that is not there: `ls` answered "cannot access '.'", and every
  // relative path in every brief was wrong.
  it('never falls back to a directory no pack has', () => {
    // Comments are stripped first. The file explains this bug at length, and a
    // naive search finds the explanation and calls it the bug -- which is how
    // this assertion failed the first time it was written.
    const code = stripComments(fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8'));
    expect(code).not.toMatch(/home\/analyst/);
    expect(code).not.toMatch(/Users\\\\Analyst/);
    // And the replacement is actually used on both platform branches.
    expect((code.match(/setCwd\(homeFor\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('every pack home is a real directory in that pack', () => {
    for (const pack of Object.values(PACKS)) {
      for (const platform of pack.manifest.platforms || ['linux']) {
        const home = homeFor(pack, platform);
        const vfs = pack.createFs(platform);
        expect(cwdExists(vfs, home), `${pack.id} ${platform} home ${home}`).toBe(true);
      }
    }
  });

  // Every challenge declares the directory the server replays it from. If the
  // client puts the student anywhere else, the brief's relative paths are wrong
  // for them and right for the grader.
  it('every declared setup.cwd is a real directory', () => {
    for (const pack of Object.values(PACKS)) {
      for (const c of pack.challenges) {
        if (!c.setup?.cwd) continue;
        const platform = c.platform || pack.manifest.platforms?.[0] || 'linux';
        const vfs = pack.createFs(platform);
        expect(cwdExists(vfs, c.setup.cwd), `${pack.id}/${c.id} -> ${c.setup.cwd}`).toBe(true);
      }
    }
  });

  it('the resume puts the student where the challenge expects', () => {
    const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/resume\.setup\?\.cwd/);
  });
});
