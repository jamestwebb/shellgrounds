import { describe, it, expect } from 'vitest';
import { executeWindowsCommand } from '../src/engine/exec.windows.js';
import { createTopsideFilesystem } from '../src/engine/fs.topside.js';

describe('Windows Command Executor', () => {
  const fs = createTopsideFilesystem();

  it('handles cd alone to show current path', () => {
    const res = executeWindowsCommand(['cd'], 'C:\\Users\\Analyst', fs);
    expect(res.stdout.trim()).toBe('C:\\Users\\Analyst');
  });

  it('handles dir and dir /a', () => {
    const res1 = executeWindowsCommand(['dir'], 'C:\\Users\\Analyst\\evidence', fs);
    expect(res1.stdout).not.toContain('mystery_file'); // Hidden by attrib

    const res2 = executeWindowsCommand(['dir', '/a'], 'C:\\Users\\Analyst\\evidence', fs);
    expect(res2.stdout).toContain('mystery_file');
  });

  it('handles type', () => {
    const res = executeWindowsCommand(['type', 'Documents\\readme.txt'], 'C:\\Users\\Analyst', fs);
    expect(res.stdout).toContain('Welcome to Topside');
  });

  it('handles findstr /i', () => {
    const res = executeWindowsCommand(['findstr', '/i', 'marker', 'Documents\\logs.txt'], 'C:\\Users\\Analyst', fs);
    expect(res.stdout).toContain('Topside Marker Identified');
  });

  it('handles certutil -hashfile', () => {
    const res = executeWindowsCommand(['certutil', '-hashfile', 'evidence\\evidence.img', 'MD5'], 'C:\\Users\\Analyst', fs);
    expect(res.stdout).toContain('MD5 hash of evidence\\evidence.img');
    expect(res.stdout).toContain('CertUtil: -hashfile command completed successfully');
  });

  it('handles attrib', () => {
    const res = executeWindowsCommand(['attrib', 'evidence\\mystery_file'], 'C:\\Users\\Analyst', fs);
    expect(res.stdout).toContain('H');
  });
});
