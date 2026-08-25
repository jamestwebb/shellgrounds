// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Linux Command Execution Tests

import { describe, it, expect } from 'vitest';
import { executeLinuxCommand } from './helpers/legacy-exec.linux.js';
import { createLinuxFilesystem, DRIVE_CONTAINER } from '../src/engine/fs.linux.js';
import { md5 } from '../packages/engine/crypto-utils.js';
import forensicsChallenges from '../packs/forensics-cli-101/challenges.json' with { type: 'json' };

describe('Linux Command Executor', () => {
  const fs = createLinuxFilesystem();

  it('handles pwd', () => {
    const res = executeLinuxCommand(['pwd'], '/home/examiner/training', fs);
    expect(res.stdout.trim()).toBe('/home/examiner/training');
  });

  it('handles ls and ls -la with hidden files', () => {
    const res1 = executeLinuxCommand(['ls'], '/home/examiner', fs);
    expect(res1.stdout).not.toContain('.stash');
    expect(res1.stdout).toContain('Documents');

    const res2 = executeLinuxCommand(['ls', '-la'], '/home/examiner', fs);
    expect(res2.stdout).toContain('.stash');
    expect(res2.stdout).toContain('.bashrc');
  });

  it('handles cd with relative and parent navigation', () => {
    const res1 = executeLinuxCommand(['cd', 'training/level_1'], '/home/examiner', fs);
    expect(res1.newCwd).toBe('/home/examiner/training/level_1');

    const res2 = executeLinuxCommand(['cd', '..'], '/home/examiner/training/level_1', fs);
    expect(res2.newCwd).toBe('/home/examiner/training');

    const res3 = executeLinuxCommand(['cd', '~'], '/home/examiner/training', fs, '', { user: 'examiner' });
    expect(res3.newCwd).toBe('/home/examiner');
  });

  it('handles cat, head, tail', () => {
    const resHead = executeLinuxCommand(['head', '-n', '2', 'Documents/logs.txt'], '/home/examiner', fs);
    expect(resHead.stdout.trim().split('\n')).toHaveLength(2);

    const resTail = executeLinuxCommand(['tail', '-n', '2', 'Documents/logs.txt'], '/home/examiner', fs);
    expect(resTail.stdout.trim().split('\n')).toHaveLength(2);
  });

  it('handles grep with -i and -v', () => {
    const resI = executeLinuxCommand(['grep', '-i', 'error', 'Documents/logs.txt'], '/home/examiner', fs);
    expect(resI.stdout.trim().split('\n')).toHaveLength(7);

    const resV = executeLinuxCommand(['grep', '-v', 'ALLOW', 'Documents/network_stream.log'], '/home/examiner', fs);
    expect(resV.stdout).not.toContain('STATUS=ALLOW');
    expect(resV.stdout).toContain('DENY');
  });

  it('handles find with -name and -type', () => {
    const resFind = executeLinuxCommand(['find', '/var/log', '-name', '*.log'], '/home/examiner', fs);
    expect(resFind.stdout).toContain('badge_audit.log');
  });

  it('handles file and strings forensics commands', () => {
    const resFile = executeLinuxCommand(['file', 'evidence/mystery_file'], '/home/examiner', fs);
    expect(resFile.stdout).toContain('PNG image data');

    const resStrings = executeLinuxCommand(['strings', 'evidence/binary_data'], '/home/examiner', fs);
    // A stable marker in the binary fixture, not a sentence of prose.
    expect(resStrings.stdout).toContain('0xDEADBEEF');
  });

  it('handles md5sum and sha256sum', () => {
    const resMd5 = executeLinuxCommand(['md5sum', 'welcome.txt'], '/home/examiner', fs);
    expect(resMd5.stdout).toMatch(/^[a-f0-9]{32}\s+welcome\.txt/);

    const resSha = executeLinuxCommand(['sha256sum', 'welcome.txt'], '/home/examiner', fs);
    expect(resSha.stdout).toMatch(/^[a-f0-9]{64}\s+welcome\.txt/);
  });

  it('handles man pages', () => {
    const resMan = executeLinuxCommand(['man', 'grep'], '/home/examiner', fs);
    expect(resMan.stdout).toContain('NAME');
    expect(resMan.stdout).toContain('SYNOPSIS');
    expect(resMan.stdout).toContain('grep - print lines matching a pattern');
  });

  // The Act V capstone runs on real tools now. It used to run on `scan` and
  // `extract -o <offset>`, neither of which exists on any machine a student
  // will ever sit at, while the pack's own courseTools list told them the real
  // equivalents were "not simulated here". `mmls` is this pack's own Sleuth Kit
  // command; `dd` is the engine's, because dd is coreutils and is true of every
  // Linux box rather than of this course.
  //
  // The assertion that matters is the last pair. The offset mmls PRINTS is what
  // gets handed to dd, and the bytes that come back have to be the container
  // and have to hash to the number act5-capstone is graded on. If the image in
  // fs.linux.js, the table in commands.js and that hash in challenges.json ever
  // drift apart, this is what notices: a wrong skip= still writes a file and
  // still reports a plausible byte count, so nothing else looks broken.
  it('carves the container with the offset mmls reports', () => {
    const resMmls = executeLinuxCommand(['mmls', 'evidence/seized_drive.raw'], '/home/examiner', fs);
    expect(resMmls.stdout).toContain('DOS Partition Table');
    expect(resMmls.stdout).toContain('Linux (Encrypted Container)');

    const offset = /Start Sector Offset:\s*(\d+)/.exec(resMmls.stdout)?.[1];
    expect(offset).toBeTruthy();

    const carved = executeLinuxCommand(
      ['dd', 'if=evidence/seized_drive.raw', 'of=container.img', 'bs=512', `skip=${offset}`],
      '/home/examiner', fs, '', { user: 'examiner' }
    );
    expect(carved.status).toBe(0);

    const carvedFile = carved.fs['/home/examiner/container.img'];
    expect(carvedFile).toBeTruthy();
    expect(carvedFile.content).toBe(DRIVE_CONTAINER);
    expect(carvedFile.content).toContain('RECOVERED CONTAINER');

    const capstone = forensicsChallenges.find(c => c.id === 'act5-capstone');
    const hashCheck = capstone.success.predicates.find(p => p.predicate === 'fileHashEquals');
    expect(md5(carvedFile.content)).toBe(hashCheck.hex);
  });

  // The decoy partition exists so that reading the table is the lesson rather
  // than guessing. Carving it must not produce the container.
  it('carving the wrong partition does not produce the container', () => {
    const carved = executeLinuxCommand(
      ['dd', 'if=evidence/seized_drive.raw', 'of=wrong.img', 'bs=512', 'skip=1'],
      '/home/examiner', fs, '', { user: 'examiner' }
    );
    const wrong = carved.fs['/home/examiner/wrong.img'];
    expect(wrong.content).not.toBe(DRIVE_CONTAINER);
    expect(wrong.content).toContain('SYSTEM ROOT');
  });
});
