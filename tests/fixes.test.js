import { describe, it, expect } from 'vitest';
import { tokenizeCommandLine } from '../src/engine/tokenizer.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { createLinuxFilesystem } from '../src/engine/fs.linux.js';
import { createWindowsFilesystem } from '../src/engine/fs.windows.js';
import { injectFlagsIntoVFS, replaceFlagTokens, FLAG_UNAVAILABLE } from '../src/utils/vfs-injector.js';
import { generateUserFlag, createSessionToken } from '../src/engine/crypto-utils.js';
import { executeWindowsCommand } from '../src/engine/exec.windows.js';

describe('Tokenizer redirection fixes', () => {
  it('keeps parsing after > file so a trailing 2>/dev/null is honored', () => {
    const { pipeline } = tokenizeCommandLine('grep -i error logs.txt > /tmp/errors.log 2>/dev/null');
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0].argv).toEqual(['grep', '-i', 'error', 'logs.txt']);
    expect(pipeline[0].redirectOut).toEqual({ file: '/tmp/errors.log', append: false });
    expect(pipeline[0].redirectErr).toBe('null');
  });

  it('parses 2>&1 mid-stage instead of writing a file named &1', () => {
    const { pipeline } = tokenizeCommandLine('cat missing.txt 2>&1 | wc -l');
    expect(pipeline).toHaveLength(2);
    expect(pipeline[0].redirectErr).toBe('stdout');
    expect(pipeline[1].argv).toEqual(['wc', '-l']);
  });

  it('does not treat a trailing digit in a word as a stderr file descriptor', () => {
    const { pipeline } = tokenizeCommandLine('echo abc2>out.txt');
    expect(pipeline[0].argv).toEqual(['echo', 'abc2']);
    expect(pipeline[0].redirectOut).toEqual({ file: 'out.txt', append: false });
    expect(pipeline[0].redirectErr).toBeNull();
  });
});

describe('Pipeline error reporting', () => {
  it('flags failed commands with hasError so they cannot satisfy challenges', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('cat nope.txt', '/home/examiner', fs, 'linux', {});
    expect(res.hasError).toBe(true);
    expect(res.output).toMatch(/No such file/);
  });

  it('does not flag successful commands', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('pwd', '/home/examiner', fs, 'linux', {});
    expect(res.hasError).toBe(false);
    expect(res.output.trim()).toBe('/home/examiner');
  });
});

describe('Flag injection safety', () => {
  it('never synthesizes flags client-side; unknown placeholders become an explicit marker', () => {
    const rawFs = {
      '/x': { type: 'dir', contents: ['a.txt'] },
      '/x/a.txt': { type: 'file', content: 'flag here: [[FLAG:act1-hidden]]' }
    };
    const { fs, flagMap } = injectFlagsIntoVFS(rawFs, 'somebody', {});
    expect(fs['/x/a.txt'].content).toContain(FLAG_UNAVAILABLE);
    expect(fs['/x/a.txt'].content).not.toContain('[[FLAG:');
    expect(flagMap['act1-hidden']).toBeUndefined();
  });

  it('resolves placeholders in command output text via replaceFlagTokens', () => {
    const out = replaceFlagTokens('Scent Trail Flag: [[FLAG:act3-apt]]', { 'act3-apt': 'FLAG{ABCDEF234567}' });
    expect(out).toBe('Scent Trail Flag: FLAG{ABCDEF234567}');
  });
});

describe('Crypto fail-closed behavior', () => {
  it('refuses to generate flags or tokens without a secret', () => {
    expect(() => generateUserFlag('', 'alice', 'act1-hidden')).toThrow();
    expect(() => createSessionToken('', 'alice')).toThrow();
  });
});

describe('Windows executor robustness', () => {
  it('does not crash when find/findstr targets a directory', () => {
    const fs = {
      'C:': { type: 'dir', contents: ['Users'] },
      'C:\\Users': { type: 'dir', contents: [] }
    };
    const res1 = executeWindowsCommand(['find', '"x"', 'Users'], 'C:', fs, '', {});
    expect(res1.stderr).toMatch(/File not found/);
    const res2 = executeWindowsCommand(['findstr', '/i', 'x', 'Users'], 'C:', fs, '', {});
    expect(res2.stderr).toMatch(/Cannot open|File not found/);
  });

  it('reports invalid findstr regex instead of throwing', () => {
    const fs = {
      'C:': { type: 'dir', contents: ['a.txt'] },
      'C:\\a.txt': { type: 'file', content: 'hello' }
    };
    const res = executeWindowsCommand(['findstr', 'pass(', 'a.txt'], 'C:', fs, '', {});
    expect(res.stderr).toMatch(/Invalid search expression/);
  });
});

describe('Unknown-command honesty', () => {
  it('tells the truth about real Linux commands that are not simulated', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('top', '/home/examiner', fs, 'linux', {});
    expect(res.output).toMatch(/real Linux command/);
    expect(res.output).toMatch(/not simulated here/);
    expect(res.hasError).toBe(true);
  });

  it('names pack course context for unsimulated domain tools when provided in context', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('mmls disk.raw', '/home/examiner', fs, 'linux', {
      packTools: { mmls: 'Sleuth Kit tool for analyzing volume systems (used in Case 003)' }
    });
    expect(res.output).toMatch(/Sleuth Kit/);
    expect(res.output).toMatch(/Case 003/);
  });

  it('corrects cross-platform command confusion in both directions', () => {
    const linuxFs = createLinuxFilesystem();
    const winRes = runPipeline('ls', 'C:\\Users\\Examiner', createWindowsFilesystem(), 'windows', {});
    expect(winRes.output).toMatch(/On Windows CMD, use `dir`/);
    const linRes = runPipeline('dir', '/home/examiner', linuxFs, 'linux', {});
    expect(linRes.output).toMatch(/On Linux, use `ls`/);
  });

  it('still says command not found for genuine nonsense', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('asdfqwer', '/home/examiner', fs, 'linux', {});
    expect(res.output).toMatch(/command not found/);
  });
});

describe('Windows path tolerance', () => {
  it('accepts forward slashes (Linux habit) in Windows paths', () => {
    const res = runPipeline('type Documents/readme.txt', 'C:\\Users\\Examiner', createWindowsFilesystem(), 'windows', {});
    expect(res.hasError).toBeFalsy();
    expect(res.output).toMatch(/Case 1042/);
  });

  it('accepts forward slashes in the certutil challenge command', () => {
    const res = runPipeline('certutil -hashfile evidence/evidence.img MD5', 'C:\\Users\\Examiner', createWindowsFilesystem(), 'windows', {});
    expect(res.hasError).toBeFalsy();
    expect(res.output).toMatch(/MD5 hash of/);
  });
});

describe('Audit fixes: flags live in the filesystem, not just in output', () => {
  it('injects flags into VFS content so filters can match them', async () => {
    const { injectFlagsIntoVFS } = await import('../src/utils/vfs-injector.js');
    const { getPack } = await import('../packs/index.js');
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const pack = getPack('forensics-cli-101');
    const flags = { 'act3-grepi': 'FLAG{ABCDEF234567}' };
    const { fs } = injectFlagsIntoVFS(pack.createFs('linux'), 'stu', flags, pack.challenges);
    // grep must see the real flag, not the raw placeholder
    const res = runPipeline('grep -c "FLAG{" Documents/logs.txt', '/home/examiner', fs, 'linux',
      { packCommands: pack.commands, user: 'examiner' });
    expect(Number(String(res.output).trim())).toBeGreaterThan(0);
    const raw = runPipeline('grep -c "\\[\\[FLAG:" Documents/logs.txt', '/home/examiner', fs, 'linux',
      { packCommands: pack.commands, user: 'examiner' });
    expect(String(raw.output).trim()).toBe('0');
  });

  it('a failed redirection prints nothing and reports failure', async () => {
    const { getPack } = await import('../packs/index.js');
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const pack = getPack('forensics-cli-101');
    const res = runPipeline('echo secret > /etc/passwd', '/home/examiner', pack.createFs('linux'), 'linux',
      { packCommands: pack.commands, user: 'examiner' });
    expect(res.stdout || '').not.toContain('secret');
    expect(res.status).not.toBe(0);
  });

  it('stdin redirection feeds the command', async () => {
    const { getPack } = await import('../packs/index.js');
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const pack = getPack('forensics-cli-101');
    const res = runPipeline('wc -l < Documents/logs.txt', '/home/examiner', pack.createFs('linux'), 'linux',
      { packCommands: pack.commands, user: 'examiner' });
    expect(res.hasError).toBeFalsy();
    expect(Number(String(res.output).trim())).toBeGreaterThan(0);
  });

  it('act unlocking honours the threshold but always permits one skip', async () => {
    const { getPack } = await import('../packs/index.js');
    const pack = getPack('forensics-cli-101');
    for (const act of pack.manifest.acts.filter(a => a.unlockThreshold)) {
      const prior = pack.challenges.filter(c => c.act === act.id - 1);
      if (!prior.length) continue;
      const byThreshold = Math.ceil(prior.length * act.unlockThreshold);
      const required = Math.min(Math.max(1, byThreshold), Math.max(1, prior.length - 1));
      expect(required, `act ${act.id} demands 100% of the previous act`).toBeLessThan(prior.length);
    }
  });
});
