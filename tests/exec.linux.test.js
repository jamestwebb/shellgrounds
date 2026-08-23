// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Linux Command Execution Tests

import { describe, it, expect } from 'vitest';
import { executeLinuxCommand } from './helpers/legacy-exec.linux.js';
import { createLinuxFilesystem } from '../src/engine/fs.linux.js';

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

  it('handles Capstone scan and extract commands', () => {
    const resScan = executeLinuxCommand(['scan', 'evidence/seized_drive.raw'], '/home/examiner', fs);
    expect(resScan.stdout).toContain('206848');

    const resExtract = executeLinuxCommand(['extract', '-o', '206848', 'evidence/seized_drive.raw'], '/home/examiner', fs);
    expect(resExtract.stdout).toContain('RECOVERED');
    expect(resExtract.stdout).toContain('206848');
  });
});
