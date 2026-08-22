// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Linux Command Execution Tests

import { describe, it, expect } from 'vitest';
import { executeLinuxCommand } from '../src/engine/exec.linux.js';
import { createWarrenFilesystem } from '../src/engine/fs.warren.js';

describe('Linux Command Executor', () => {
  const fs = createWarrenFilesystem();

  it('handles pwd', () => {
    const res = executeLinuxCommand(['pwd'], '/home/analyst/training', fs);
    expect(res.stdout.trim()).toBe('/home/analyst/training');
  });

  it('handles ls and ls -la with hidden files', () => {
    const res1 = executeLinuxCommand(['ls'], '/home/analyst', fs);
    expect(res1.stdout).not.toContain('.stash');
    expect(res1.stdout).toContain('Documents');

    const res2 = executeLinuxCommand(['ls', '-la'], '/home/analyst', fs);
    expect(res2.stdout).toContain('.stash');
    expect(res2.stdout).toContain('.bashrc');
  });

  it('handles cd with relative and parent navigation', () => {
    const res1 = executeLinuxCommand(['cd', 'training/level_1'], '/home/analyst', fs);
    expect(res1.newCwd).toBe('/home/analyst/training/level_1');

    const res2 = executeLinuxCommand(['cd', '..'], '/home/analyst/training/level_1', fs);
    expect(res2.newCwd).toBe('/home/analyst/training');

    const res3 = executeLinuxCommand(['cd', '~'], '/home/analyst/training', fs, '', { user: 'analyst' });
    expect(res3.newCwd).toBe('/home/analyst');
  });

  it('handles cat, head, tail', () => {
    const resHead = executeLinuxCommand(['head', '-n', '2', 'Documents/logs.txt'], '/home/analyst', fs);
    expect(resHead.stdout.trim().split('\n')).toHaveLength(2);

    const resTail = executeLinuxCommand(['tail', '-n', '2', 'Documents/logs.txt'], '/home/analyst', fs);
    expect(resTail.stdout.trim().split('\n')).toHaveLength(2);
  });

  it('handles grep with -i and -v', () => {
    const resI = executeLinuxCommand(['grep', '-i', 'error', 'Documents/logs.txt'], '/home/analyst', fs);
    expect(resI.stdout.trim().split('\n')).toHaveLength(7);

    const resV = executeLinuxCommand(['grep', '-v', 'ALLOW', 'Documents/network_stream.log'], '/home/analyst', fs);
    expect(resV.stdout).not.toContain('STATUS=ALLOW');
    expect(resV.stdout).toContain('DENY');
  });

  it('handles find with -name and -type', () => {
    const resFind = executeLinuxCommand(['find', '/var/log', '-name', '*.log'], '/home/analyst', fs);
    expect(resFind.stdout).toContain('sensor_audit.log');
  });

  it('handles file and strings forensics commands', () => {
    const resFile = executeLinuxCommand(['file', 'evidence/mystery_file'], '/home/analyst', fs);
    expect(resFile.stdout).toContain('PNG image data');

    const resStrings = executeLinuxCommand(['strings', 'evidence/binary_data'], '/home/analyst', fs);
    expect(resStrings.stdout).toContain('Target signature: 0xDEADBEEF');
  });

  it('handles md5sum and sha256sum', () => {
    const resMd5 = executeLinuxCommand(['md5sum', 'welcome.txt'], '/home/analyst', fs);
    expect(resMd5.stdout).toMatch(/^[a-f0-9]{32}\s+welcome\.txt/);

    const resSha = executeLinuxCommand(['sha256sum', 'welcome.txt'], '/home/analyst', fs);
    expect(resSha.stdout).toMatch(/^[a-f0-9]{64}\s+welcome\.txt/);
  });

  it('handles man pages', () => {
    const resMan = executeLinuxCommand(['man', 'grep'], '/home/analyst', fs);
    expect(resMan.stdout).toContain('NAME');
    expect(resMan.stdout).toContain('SYNOPSIS');
    expect(resMan.stdout).toContain('grep - print lines matching a pattern');
  });

  it('handles Capstone scan and extract commands', () => {
    const resScan = executeLinuxCommand(['scan', 'evidence/suspect_drive.raw'], '/home/analyst', fs);
    expect(resScan.stdout).toContain('206848');

    const resExtract = executeLinuxCommand(['extract', '-o', '206848', 'evidence/suspect_drive.raw'], '/home/analyst', fs);
    expect(resExtract.stdout).toContain('RECOVERED EVIDENCE CONTAINER');
  });
});
