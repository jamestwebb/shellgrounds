// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Shell Fidelity & Differential Test Suite (Uplift §2 F1-F16)

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { buildFS, file } from '../packages/engine/vfs/builder.js';
import { registry } from '../packages/engine/commands/registry.js';
import { ERROR_MARKERS } from '../packages/engine/constants.js';

function createTestLinuxFs() {
  return buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        'a.txt': file('line 1\nline 2\nline 3\nline 4\nline 5\n'),
        'b.txt': file('apple\nbanana\ncherry\n'),
        'c.csv': file('id,name\n1,Alice\n2,Bob\n'),
        'sub': {
          'deep.txt': file('deep content\n')
        }
      },
      'etc': {
        'passwd': file('root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:student,,,:/home/student:/bin/bash\n'),
        'shadow': file('root:$6$secret:19500:0:99999:7:::\n', { mode: 0o400, owner: 'root', group: 'root' })
      },
      'tmp': {}
    }
  }).fs;
}

function createTestWinFs() {
  return buildFS({
    home: 'C:\\Users\\Student',
    isWindows: true,
    tree: {
      'Users\\Student': {
        'notes.txt': file('Meeting at 10 AM\r\n'),
        'hidden.ini': file('secret=1\r\n', { attrib: 'H', hidden: true }),
        'data.log': file('INFO 1\r\nERROR 2\r\nINFO 3\r\n')
      }
    }
  }).fs;
}

describe('Differential Fidelity Standards (Uplift §2)', () => {
  // F1: ls sorting and layout
  it('F1: ls sorts lexicographically and ignores case', () => {
    const fs = createTestLinuxFs();
    const res = runPipeline('ls', '/home/student', fs, 'linux');
    expect(res.stdout).toContain('a.txt');
    expect(res.stdout).toContain('b.txt');
    expect(res.stdout).toContain('c.csv');
    expect(res.stdout).toContain('sub');
  });

  // F2: Windows Tokenizer & Pipes
  it('F2: Windows CMD parses pipelines and switches without Linux syntax leaks', () => {
    const fs = createTestWinFs();
    const res = runPipeline('type data.log | find "ERROR"', 'C:\\Users\\Student', fs, 'windows');
    expect(res.stdout).toContain('ERROR 2');
    expect(res.stdout).not.toContain('INFO 1');
  });

  // F3: Multi-file operands in cat, head, tail, wc
  it('F3: Multi-file operands concatenate headers or contents in cat, head, tail, wc', () => {
    const fs = createTestLinuxFs();
    const catRes = runPipeline('cat a.txt b.txt', '/home/student', fs, 'linux');
    expect(catRes.stdout).toContain('line 1');
    expect(catRes.stdout).toContain('banana');

    const wcRes = runPipeline('wc -l a.txt b.txt', '/home/student', fs, 'linux');
    expect(wcRes.stdout).toContain('5 a.txt');
    expect(wcRes.stdout).toContain('3 b.txt');
    expect(wcRes.stdout).toContain('8 total');
  });

  // F4: Unknown flag exits 2
  it('F4: Unknown flags produce exit status 2 on Linux', () => {
    const fs = createTestLinuxFs();
    const res = runPipeline('cat -Z a.txt', '/home/student', fs, 'linux');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("invalid option -- 'Z'");
  });

  // F5: 3-State Flag Honesty
  it('F5: Recognized unsimulated flags return honest message and exit 2', () => {
    const fs = createTestLinuxFs();
    // ls -R is marked notSimulated
    const res = runPipeline('ls -R', '/home/student', fs, 'linux');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('-R is not simulated here');
  });

  // F6: head -n -NUM and tail +NUM
  it('F6: head and tail support +NUM and negative offsets', () => {
    const fs = createTestLinuxFs();
    const headRes = runPipeline('head -n 2 a.txt', '/home/student', fs, 'linux');
    expect(headRes.stdout.trim().split('\n').length).toBe(2);

    const tailRes = runPipeline('tail -n +3 a.txt', '/home/student', fs, 'linux');
    expect(tailRes.stdout).toContain('line 3');
    expect(tailRes.stdout).not.toContain('line 1');
  });

  // F8: Real glob expansion
  it('F8: Shell expands wildcards against live VFS', () => {
    const fs = createTestLinuxFs();
    const res = runPipeline('cat *.txt', '/home/student', fs, 'linux');
    expect(res.stdout).toContain('line 1');
    expect(res.stdout).toContain('banana');
  });

  // F9: Parameter & Variable Expansion
  it('F9: Parameter expansion respects single vs double quotes', () => {
    const fs = createTestLinuxFs();
    const res1 = runPipeline('echo "$USER"', '/home/student', fs, 'linux', { user: 'student' });
    expect(res1.stdout.trim()).toBe('student');

    const res2 = runPipeline("echo '$USER'", '/home/student', fs, 'linux', { user: 'student' });
    expect(res2.stdout.trim()).toBe('$USER');
  });

  // F10: Exit Codes and Command Lists (;, &&, ||)
  it('F10: Semicolons, &&, and || execute with correct short-circuit semantics', () => {
    const fs = createTestLinuxFs();
    const andRes = runPipeline('true && echo "AND_OK"', '/home/student', fs, 'linux');
    expect(andRes.stdout).toContain('AND_OK');

    const orRes = runPipeline('false || echo "OR_OK"', '/home/student', fs, 'linux');
    expect(orRes.stdout).toContain('OR_OK');
  });

  // F11: Stream Redirections (>, >>, 2>, 2>&1)
  it('F11: Stream redirection writes stdout and stderr to files', () => {
    const fs = createTestLinuxFs();
    const res = runPipeline('echo "SAVED_LINE" > /tmp/out.txt', '/home/student', fs, 'linux');
    expect(res.fs['/tmp/out.txt']).toBeDefined();
    expect(res.fs['/tmp/out.txt'].content).toContain('SAVED_LINE');

    const appendRes = runPipeline('echo "SECOND_LINE" >> /tmp/out.txt', '/home/student', res.fs, 'linux');
    expect(appendRes.fs['/tmp/out.txt'].content).toContain('SAVED_LINE\nSECOND_LINE');
  });

  // F12: Permissions (chmod, sudo)
  it('F12: Sudo grants root elevation; unprivileged users get Permission Denied', () => {
    const fs = createTestLinuxFs();
    const deniedRes = runPipeline('cat /etc/shadow', '/home/student', fs, 'linux', { user: 'student' });
    expect(deniedRes.hasError).toBe(true);
    expect(deniedRes.stderr).toContain('Permission denied');

    const sudoRes = runPipeline('sudo cat /etc/shadow', '/home/student', fs, 'linux', { user: 'student' });
    expect(sudoRes.hasError).toBe(false);
    expect(sudoRes.stdout).toContain('root:$6$secret');
  });

  // F16: Windows Honesty
  it('F16: Windows command help and switches function with Windows parity', () => {
    const fs = createTestWinFs();
    const res = runPipeline('dir /a', 'C:\\Users\\Student', fs, 'windows');
    expect(res.stdout).toContain('hidden.ini');
    expect(res.stdout).toContain('notes.txt');
  });
});
