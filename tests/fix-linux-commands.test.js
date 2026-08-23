// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Regression suite for the Linux command implementations.
//
// Covers four confirmed engine defects:
//   1. sudo and xargs threw away the wrapped command's flags.
//   2. test / [ were unusable (every option was rejected as invalid).
//   3. ls printed a `name:` header for plain file operands.
//   4. Flags that were parsed and then silently ignored.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { buildFS, file, dir } from '../packages/engine/vfs/builder.js';
import { md5 } from '../packages/engine/crypto-utils.js';

const README = 'hello\nworld\n';
const OLD_TEXT = 'alpha\nbeta\ngamma\ndelta\nepsilon\n';
const NEW_TEXT = 'alpha\nBETA\ngamma\ndelta\nepsilon\nzeta\n';

function makeFs() {
  return buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        'readme.txt': file(README),
        'empty.txt': file(''),
        'old.txt': file(OLD_TEXT),
        'new.txt': file(NEW_TEXT),
        'sums.md5': file(`${md5(README)}  readme.txt\n00000000000000000000000000000000  old.txt\n`),
        'locked.txt': file('do not touch\n', { mode: 0o444 }),
        'script.sh': file('#!/bin/sh\necho hi\n', { mode: 0o755 }),
        'patterns.txt': file('cat\ncot\ncaat\na|b\n'),
        'Documents': {
          'notes.txt': file('note one\n'),
          'todo.txt': file('todo one\n')
        },
        'Pictures': {
          'photo.png': file('PNGDATA')
        },
        'nest': {
          'inner': {}
        }
      },
      'var/log': {
        'sys.log': file('boot ok\n')
      },
      'tmp': {}
    }
  }).fs;
}

function run(cmd, opts = {}) {
  return runPipeline(cmd, opts.cwd || '/home/student', opts.fs || makeFs(), 'linux', {
    user: 'student',
    ...opts.context
  });
}

// ---------------------------------------------------------------------------
// Defect 1: wrapper commands must hand the wrapped command its own flags
// ---------------------------------------------------------------------------

describe('Defect 1: sudo passes the wrapped command its flags', () => {
  it('runs `sudo ls -l` as a long listing, not as ls of a file named -l', () => {
    const res = run('sudo ls -l');
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^total \d+\n/);
    expect(res.stdout).toContain('readme.txt');
    expect(res.stdout).not.toContain("cannot access '-l'");
  });

  it('gives `sudo ls -l` the same output as bare `ls -l`', () => {
    expect(run('sudo ls -l').stdout).toBe(run('ls -l').stdout);
  });

  it('handles combined flags and an operand: sudo ls -la /var/log', () => {
    const res = run('sudo ls -la /var/log');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('sys.log');
    // -a asked for the dot entries; -l asked for the long format.
    expect(res.stdout).toMatch(/^total \d+\n/);
    expect(res.stdout).toContain(' .\n');
    expect(res.stdout).toContain(' ..\n');
  });

  it('handles `sudo cat -n file`', () => {
    const res = run('sudo cat -n readme.txt');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('     1  hello\n     2  world\n');
  });

  it('reports the wrapped command\'s own option errors', () => {
    const res = run('sudo ls --bogus');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("ls: unrecognized option '--bogus'");
  });

  it('still elevates to root, so a root-only file is readable', () => {
    const fs = buildFS({
      home: '/home/student',
      isWindows: false,
      tree: {
        'home/student': { 'a.txt': file('x\n') },
        'etc': { 'shadow': file('root:$6$secret:19500:0:99999:7:::\n', { mode: 0o400, owner: 'root', group: 'root' }) }
      }
    }).fs;
    expect(run('cat /etc/shadow', { fs }).status).not.toBe(0);
    const elevated = run('sudo cat /etc/shadow', { fs });
    expect(elevated.status).toBe(0);
    expect(elevated.stdout).toContain('root:$6$secret');
  });

  it('accepts -u USER and runs as that user', () => {
    const res = run('sudo -u root wc -l readme.txt');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('readme.txt');
  });

  it('still handles the simulated apt-get install', () => {
    const res = run('sudo apt-get install tracker -y');
    expect(res.status).toBe(0);
    expect(res.installedPackage).toBe('tracker');
  });

  it('reports usage when given no command', () => {
    const res = run('sudo');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('usage: sudo');
  });
});

describe('Defect 1: xargs passes the built command its flags', () => {
  it('runs `xargs grep -n pattern` with -n belonging to grep', () => {
    const res = run('echo readme.txt | xargs grep -n hello');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('1:hello\n');
  });

  it('gives the same result as invoking grep directly', () => {
    expect(run('echo readme.txt | xargs grep -n world').stdout)
      .toBe(run('grep -n world readme.txt').stdout);
  });

  it('passes -l through to grep rather than swallowing it', () => {
    const res = run('echo readme.txt | xargs grep -l hello');
    expect(res.stdout).toBe('readme.txt\n');
  });

  it('keeps its own -n as a batch size', () => {
    const res = run('ls Documents | xargs -n 1 echo');
    expect(res.stdout).toBe('notes.txt\ntodo.txt\n');
  });

  it('keeps its own -I as a replacement string', () => {
    const res = run('echo readme.txt | xargs -I {} cat {}');
    expect(res.stdout).toBe(README);
  });

  it('does not confuse its own -n with the command\'s -n', () => {
    const withBatch = run('echo readme.txt | xargs -n 1 grep -n hello');
    expect(withBatch.stdout).toBe('1:hello\n');
  });

  it('reports an unknown command honestly', () => {
    const res = run('echo x | xargs nosuchtool');
    expect(res.status).toBe(127);
    expect(res.stderr).toContain('xargs: nosuchtool');
  });
});

// ---------------------------------------------------------------------------
// Defect 2: test and [
// ---------------------------------------------------------------------------

describe('Defect 2: test file operators', () => {
  const cases = [
    ['test -e readme.txt', 0],
    ['test -e nosuch.txt', 1],
    ['test -e Documents', 0],
    ['test -f readme.txt', 0],
    ['test -f Documents', 1],
    ['test -f nosuch.txt', 1],
    ['test -d Documents', 0],
    ['test -d readme.txt', 1],
    ['test -r readme.txt', 0],
    ['test -w readme.txt', 0],
    ['test -w locked.txt', 1],
    ['test -x script.sh', 0],
    ['test -x readme.txt', 1],
    ['test -s readme.txt', 0],
    ['test -s empty.txt', 1],
    ['test -s nosuch.txt', 1]
  ];

  for (const [cmd, status] of cases) {
    it(`${cmd} exits ${status}`, () => {
      const res = run(cmd);
      expect(res.status).toBe(status);
      expect(res.stdout).toBe('');
      expect(res.stderr).toBe('');
    });
  }
});

describe('Defect 2: test string and integer operators', () => {
  const cases = [
    ['test -z ""', 0],
    ['test -z abc', 1],
    ['test -n abc', 0],
    ['test -n ""', 1],
    ['test abc = abc', 0],
    ['test abc = xyz', 1],
    ['test abc != xyz', 0],
    ['test abc != abc', 1],
    ['test 3 -eq 3', 0],
    ['test 3 -eq 4', 1],
    ['test 3 -ne 4', 0],
    ['test 3 -ne 3', 1],
    ['test 3 -lt 4', 0],
    ['test 4 -lt 3', 1],
    ['test 3 -le 3', 0],
    ['test 4 -le 3', 1],
    ['test 4 -gt 3', 0],
    ['test 3 -gt 4', 1],
    ['test 3 -ge 3', 0],
    ['test 2 -ge 3', 1],
    ['test ! -f nosuch.txt', 0],
    ['test ! -f readme.txt', 1],
    ['test', 1],
    ['test abc', 0],
    ['test ""', 1]
  ];

  for (const [cmd, status] of cases) {
    it(`${cmd} exits ${status}`, () => {
      const res = run(cmd);
      expect(res.status).toBe(status);
      expect(res.stdout).toBe('');
      expect(res.stderr).toBe('');
    });
  }

  it('rejects a non-integer for an integer comparison', () => {
    const res = run('test 1 -eq x');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe('test: x: integer expression expected\n');
  });

  it('rejects an unknown unary operator', () => {
    const res = run('test -q readme.txt');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe("test: -q: unary operator expected\n");
  });

  it('rejects an unknown binary operator', () => {
    const res = run('test a -zz b');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe('test: -zz: binary operator expected\n');
  });

  it('rejects too many arguments', () => {
    const res = run('test a b c d');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe('test: too many arguments\n');
  });
});

describe('Defect 2: the [ form', () => {
  it('accepts a closing ]', () => {
    const res = run('[ -f readme.txt ]');
    expect(res.status).toBe(0);
    expect(res.output).toBe('');
  });

  it('evaluates every operator family the same as test', () => {
    expect(run('[ -d Documents ]').status).toBe(0);
    expect(run('[ -z "" ]').status).toBe(0);
    expect(run('[ abc = abc ]').status).toBe(0);
    expect(run('[ 5 -gt 2 ]').status).toBe(0);
    expect(run('[ 5 -lt 2 ]').status).toBe(1);
  });

  it("errors with [: missing ']' when the bracket is not closed", () => {
    const res = run('[ -f readme.txt');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe("[: missing ']'\n");
  });

  it("errors on a bare [", () => {
    const res = run('[');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe("[: missing ']'\n");
  });

  it('reports its own name in operator errors', () => {
    const res = run('[ -q x ]');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe("[: -q: unary operator expected\n");
  });
});

describe('Defect 2: exit status drives && and ||', () => {
  it('runs the right-hand side of && on success', () => {
    const res = run('test -f readme.txt && echo found');
    expect(res.stdout).toBe('found\n');
    expect(res.status).toBe(0);
  });

  it('short-circuits && on failure', () => {
    const res = run('test -f nosuch.txt && echo found');
    expect(res.stdout).toBe('');
    expect(res.status).toBe(1);
  });

  it('runs the right-hand side of || on failure', () => {
    const res = run('test -f nosuch.txt || echo missing');
    expect(res.stdout).toBe('missing\n');
    expect(res.status).toBe(0);
  });

  it('short-circuits || on success', () => {
    const res = run('test -d Documents || echo missing');
    expect(res.stdout).toBe('');
    expect(res.status).toBe(0);
  });

  it('works through the [ form too', () => {
    expect(run('[ -d Documents ] && echo isdir').stdout).toBe('isdir\n');
    expect(run('[ -d readme.txt ] || echo notdir').stdout).toBe('notdir\n');
  });

  it('exposes the status in $?', () => {
    expect(run('test -f readme.txt; echo $?').stdout.trim()).toBe('0');
    expect(run('test -f nosuch.txt; echo $?').stdout.trim()).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// Defect 3: ls operand headers
// ---------------------------------------------------------------------------

describe('Defect 3: ls prints headers only for directory operands', () => {
  it('one file operand prints the path as given, with no header', () => {
    const res = run('ls Documents/notes.txt');
    expect(res.stdout).toBe('Documents/notes.txt\n');
  });

  it('two file operands print two paths and no headers', () => {
    const res = run('ls Documents/notes.txt Documents/todo.txt');
    expect(res.stdout).toBe('Documents/notes.txt\nDocuments/todo.txt\n');
    expect(res.stdout).not.toContain(':');
  });

  it('a glob over files behaves the same (l1-glob-doc)', () => {
    const res = run('ls Documents/*.txt');
    expect(res.stdout).toBe('Documents/notes.txt\nDocuments/todo.txt\n');
  });

  it('one directory operand prints its contents with no header', () => {
    const res = run('ls Documents');
    expect(res.stdout).toBe('notes.txt  todo.txt\n');
  });

  it('two directory operands print name: headers separated by a blank line', () => {
    const res = run('ls Documents Pictures');
    expect(res.stdout).toBe('Documents:\nnotes.txt  todo.txt\n\nPictures:\nphoto.png\n');
  });

  it('sorts the directory operands themselves', () => {
    expect(run('ls Pictures Documents').stdout).toBe(run('ls Documents Pictures').stdout);
  });

  it('a mixed set puts the files first, then each directory block', () => {
    const res = run('ls readme.txt Documents');
    expect(res.stdout).toBe('readme.txt\n\nDocuments:\nnotes.txt  todo.txt\n');
  });

  it('a mixed set with -l gives the file no total line', () => {
    const res = run('ls -l readme.txt Documents');
    const lines = res.stdout.split('\n');
    expect(lines[0]).toMatch(/^-rw.* readme\.txt$/);
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('Documents:');
    expect(lines[3]).toMatch(/^total \d+$/);
  });

  it('still reports a missing operand and exits 2', () => {
    const res = run('ls nosuch Documents');
    expect(res.status).toBe(2);
    expect(res.stderr).toBe("ls: cannot access 'nosuch': No such file or directory\n");
    // One operand survived, but two were given, so the header stays.
    expect(res.stdout).toBe('Documents:\nnotes.txt  todo.txt\n');
  });
});

// ---------------------------------------------------------------------------
// Defect 4: flags that used to be parsed and then dropped
// ---------------------------------------------------------------------------

describe('Defect 4: ls -h', () => {
  it('abbreviates sizes in the long listing', () => {
    const res = run('ls -lh');
    expect(res.stdout).toMatch(/4\.0K .* Documents/);
  });

  it('leaves small sizes as plain byte counts', () => {
    expect(run('ls -lh readme.txt').stdout).toMatch(/ {4}12 .*readme\.txt/);
  });
});

describe('Defect 4: head -v / -q', () => {
  it('-v forces the ==> header for a single file', () => {
    const res = run('head -v readme.txt');
    expect(res.stdout).toBe('==> readme.txt <==\nhello\nworld\n');
  });

  it('-q suppresses the headers for several files', () => {
    const res = run('head -q readme.txt Documents/notes.txt');
    expect(res.stdout).toBe('hello\nworld\nnote one\n');
  });

  it('the later of -q and -v wins', () => {
    expect(run('head -q -v readme.txt').stdout).toContain('==>');
    expect(run('head -v -q readme.txt readme.txt').stdout).not.toContain('==>');
  });
});

describe('Defect 4: echo -n / -e / -E', () => {
  it('-e interprets escapes', () => {
    expect(run('echo -e "a\\tb"').stdout).toBe('a\tb\n');
  });

  it('escapes are off by default', () => {
    expect(run('echo "a\\tb"').stdout).toBe('a\\tb\n');
  });

  it('-E after -e turns escapes back off', () => {
    expect(run('echo -e -E "a\\tb"').stdout).toBe('a\\tb\n');
  });

  it('options must lead: `echo hi -n` prints the -n', () => {
    expect(run('echo hi -n').stdout).toBe('hi -n\n');
  });

  it('-n still drops the trailing newline', () => {
    expect(run('echo -n hi').stdout).toBe('hi');
  });
});

describe('Defect 4: grep is a BRE by default and an ERE under -E', () => {
  it('treats | as a literal without -E', () => {
    expect(run('grep "a|b" patterns.txt').stdout).toBe('a|b\n');
  });

  it('treats | as alternation with -E', () => {
    expect(run('grep -E "c(a|o)t" patterns.txt').stdout).toBe('cat\ncot\n');
  });

  it('still honours . and * in a BRE', () => {
    expect(run('grep "c.t" patterns.txt').stdout).toBe('cat\ncot\n');
    expect(run('grep "ca*t" patterns.txt').stdout).toBe('cat\ncaat\n');
  });

  it('-F still matches literally', () => {
    expect(run('grep -F "a|b" patterns.txt').stdout).toBe('a|b\n');
  });
});

describe('Defect 4: md5sum -c and sha256sum -c', () => {
  it('reports OK and FAILED per line and exits 1 on a mismatch', () => {
    const res = run('md5sum -c sums.md5');
    expect(res.stdout).toBe('readme.txt: OK\nold.txt: FAILED\n');
    expect(res.stderr).toContain('WARNING: 1 computed checksum did NOT match');
    expect(res.status).toBe(1);
  });

  it('exits 0 when every checksum matches', () => {
    const fs = makeFs();
    const written = run(`md5sum readme.txt > /tmp/all.md5`, { fs });
    const res = run('md5sum -c /tmp/all.md5', { fs: written.fs });
    expect(res.stdout).toBe('readme.txt: OK\n');
    expect(res.status).toBe(0);
  });

  it('round-trips for sha256sum too', () => {
    const fs = makeFs();
    const written = run('sha256sum readme.txt > /tmp/all.sha', { fs });
    const res = run('sha256sum -c /tmp/all.sha', { fs: written.fs });
    expect(res.stdout).toBe('readme.txt: OK\n');
    expect(res.status).toBe(0);
  });
});

describe('Defect 4: rmdir -p', () => {
  it('removes the emptied parents too', () => {
    const fs = makeFs();
    const res = run('rmdir -p nest/inner', { fs });
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/nest/inner']).toBeUndefined();
    expect(res.fs['/home/student/nest']).toBeUndefined();
  });

  it('without -p leaves the parent alone', () => {
    const res = run('rmdir nest/inner');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/nest']).toBeDefined();
  });
});

describe('Defect 4: du -s and -a', () => {
  it('charges a 4K block for the directory and for each file it holds', () => {
    // Documents itself (4) + notes.txt (4) + todo.txt (4).
    const res = run('du Documents');
    expect(res.stdout).toBe('12\tDocuments\n');
  });

  it('-s prints only the total', () => {
    const res = run('du -s Documents');
    expect(res.stdout).toBe('12\tDocuments\n');
  });

  it('-a also lists the files', () => {
    const res = run('du -a Documents');
    expect(res.stdout.split('\n').filter(Boolean)).toEqual([
      '4\tDocuments/notes.txt',
      '4\tDocuments/todo.txt',
      '12\tDocuments'
    ]);
  });

  it('reports nested directories bottom-up', () => {
    const res = run('du nest');
    expect(res.stdout).toBe('4\tnest/inner\n8\tnest\n');
  });

  it('refuses -s together with -a, as GNU du does', () => {
    const res = run('du -sa Documents');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('cannot both summarize and show all entries');
  });
});

describe('Defect 4: ps a / u / x', () => {
  it('shows only this terminal in the short format by default', () => {
    const res = run('ps');
    expect(res.stdout.split('\n')[0]).toBe('    PID TTY          TIME CMD');
    expect(res.stdout).not.toContain('sshd');
  });

  it('ps aux shows other users in the user-oriented format', () => {
    const res = run('ps aux');
    expect(res.stdout.split('\n')[0]).toContain('USER');
    expect(res.stdout).toContain('/usr/sbin/sshd');
    expect(res.stdout).toContain('student');
  });

  it('accepts the dashed spelling too', () => {
    expect(run('ps -aux').stdout).toBe(run('ps aux').stdout);
  });

  it('rejects a letter it does not simulate', () => {
    const res = run('ps auxZ');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('unsupported option');
  });
});

describe('Defect 4: diff normal format by default, unified under -u', () => {
  it('prints < / > with NcN headers without -u', () => {
    const res = run('diff old.txt new.txt');
    expect(res.stdout).toBe('2c2\n< beta\n---\n> BETA\n5a6\n> zeta\n');
    expect(res.status).toBe(1);
  });

  it('prints a real unified diff with -u', () => {
    const res = run('diff -u old.txt new.txt');
    expect(res.stdout).toContain('--- old.txt\t');
    expect(res.stdout).toContain('+++ new.txt\t');
    expect(res.stdout).toContain('@@ -1,5 +1,6 @@');
    expect(res.stdout).toContain('-beta\n+BETA\n');
    expect(res.stdout).toContain('+zeta\n');
    // Context lines are kept, not every line reprinted with a sign.
    expect(res.stdout).toContain(' alpha\n');
  });

  it('exits 0 with no output for identical files', () => {
    const res = run('diff old.txt old.txt');
    expect(res.stdout).toBe('');
    expect(res.status).toBe(0);
  });

  it('-q reports only that they differ', () => {
    const res = run('diff -q old.txt new.txt');
    expect(res.stdout).toBe('Files old.txt and new.txt differ\n');
    expect(res.status).toBe(1);
  });
});

describe('Defect 4: find -size, and honest refusal for the rest', () => {
  it('-size -N matches only what rounds below N units (an argument that starts with a dash)', () => {
    const res = run('find . -size -1k');
    expect(res.status).toBe(0);
    // empty.txt occupies zero units; everything else rounds up to at least one.
    expect(res.stdout.split('\n').filter(Boolean)).toEqual(['./empty.txt']);
  });

  it('-size +N excludes files at or below the threshold', () => {
    const res = run('find . -size +3k');
    // Only directories (4096 bytes) clear a 3 KiB threshold here.
    expect(res.stdout).toContain('./Documents');
    expect(res.stdout).not.toContain('readme.txt');
  });

  it('rejects an unknown predicate instead of ignoring it', () => {
    const res = run('find . -bogus');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('unknown predicate');
  });

  it('rejects an unparsable -size argument', () => {
    const res = run('find . -size 1Q');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('invalid -size type');
  });

  const refused = ['find . -mtime 1', 'find . -delete', 'find . -exec ls'];
  for (const cmd of refused) {
    it(`${cmd} says it is not simulated instead of quietly ignoring the flag`, () => {
      const res = run(cmd);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('is not simulated here');
      expect(res.hasError).toBe(true);
    });
  }

  it('still supports -name, -iname, -type and -maxdepth', () => {
    expect(run('find . -name "*.txt"').stdout).toContain('./readme.txt');
    expect(run('find . -iname "*.TXT"').stdout).toContain('./readme.txt');
    expect(run('find Documents -type f').stdout.split('\n').filter(Boolean)).toEqual([
      'Documents/notes.txt', 'Documents/todo.txt'
    ]);
    expect(run('find . -maxdepth 1 -type d').stdout.split('\n').filter(Boolean).length)
      .toBe(4); // ., Documents, Pictures, nest
  });
});

describe('Defect 4: flags that cannot be honoured are refused, not ignored', () => {
  const refusals = [
    ['touch -a readme.txt', 'touch', '-a'],
    ['cp -i readme.txt copy.txt', 'cp', '-i'],
    ['mv -i readme.txt moved.txt', 'mv', '-i'],
    ['rm -i readme.txt', 'rm', '-i'],
    ['tar -czf out.tar.gz Documents', 'tar', '-c'],
    ['ls -R', 'ls', '-R'],
    ['tail -f readme.txt', 'tail', '-f']
  ];

  for (const [cmd, tool, flag] of refusals) {
    it(`${cmd} refuses ${flag} honestly`, () => {
      const res = run(cmd);
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain('is not simulated here');
      expect(res.hasError).toBe(true);
    });
  }

  it('touch -a does not silently rewrite the modification time', () => {
    const fs = makeFs();
    const before = fs['/home/student/readme.txt'].mtime;
    const res = run('touch -a readme.txt', { fs });
    expect((res.fs['/home/student/readme.txt'] || {}).mtime).toBe(before);
  });

  it('gzip reports that compression is unsimulated instead of exiting 0', () => {
    const res = run('gzip readme.txt');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('not simulated here');
    expect(res.fs['/home/student/readme.txt.gz']).toBeUndefined();
  });

  it('touch -m is honoured and still creates a missing file', () => {
    const res = run('touch -m fresh.txt');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/fresh.txt']).toBeDefined();
  });
});

describe('Defect 4: cp -f and mv -f overwrite an unwritable destination', () => {
  it('cp without -f refuses to overwrite a read-only file', () => {
    const res = run('cp readme.txt locked.txt');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Permission denied');
  });

  it('cp -f removes the destination and retries', () => {
    const res = run('cp -f readme.txt locked.txt');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/locked.txt'].content).toBe(README);
  });

  it('mv -f does the same', () => {
    const res = run('mv -f readme.txt locked.txt');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/locked.txt'].content).toBe(README);
    expect(res.fs['/home/student/readme.txt']).toBeUndefined();
  });
});

describe('Defect 4: pwd -L / -P and strings -a are true no-ops here', () => {
  it('pwd -L and -P print the same path (no symlinks exist in this VFS)', () => {
    expect(run('pwd -L').stdout).toBe('/home/student\n');
    expect(run('pwd -P').stdout).toBe('/home/student\n');
  });

  it('strings -a matches strings with no options', () => {
    expect(run('strings -a patterns.txt').stdout).toBe(run('strings patterns.txt').stdout);
  });
});

// ---------------------------------------------------------------------------
// Whole-file guard: no linux command may declare a flag it never reads.
// ---------------------------------------------------------------------------

describe('Simulation honesty guard', () => {
  it('every implemented linux flag is either read by its run() or refused', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../packages/engine/commands/linux/index.js', import.meta.url), 'utf8');

    // Commands whose run() reads argv directly instead of the flags object.
    const READS_ARGV = new Set(['findCmd', 'echoCmd', 'psCmd', 'xargsCmd', 'testCmd']);
    const ALLOWED = {
      // -q / -v are order-sensitive, so head reads them off argv.
      headCmd: ['q', 'v'],
      // No symlink node type exists here, so -L and -P give the same path.
      pwdCmd: ['L', 'P'],
      // Simulated files have no section table, so every scan is already -a.
      stringsCmd: ['a'],
      // mtime is the only timestamp kept, so -m is the default behaviour.
      touchCmd: ['m']
    };

    const parts = src.split(/\nexport const (\w+) = \{/);
    const offenders = [];

    for (let i = 1; i < parts.length; i += 2) {
      const name = parts[i];
      const body = parts[i + 1];
      if (READS_ARGV.has(name)) continue;

      const flagMatch = body.match(/\n {2}flags: \{([\s\S]*?)\n {2}\},/);
      if (!flagMatch) continue;

      const runIdx = body.indexOf('\n  run(');
      const runBody = runIdx >= 0 ? body.slice(runIdx) : '';
      const allowed = ALLOWED[name] || [];

      const specs = [...flagMatch[1].matchAll(/^\s*(?:'([^']+)'|([\w\d]+)):\s*\{([^}]*)\}/gm)];
      for (const m of specs) {
        const key = m[1] || m[2];
        const spec = m[3];
        if (/notSimulated/.test(spec)) continue;
        if (allowed.includes(key)) continue;

        const longName = (spec.match(/long:\s*'([^']+)'/) || [])[1];
        const probes = [`flags.${key}`, `flags['${key}']`];
        if (longName) probes.push(`flags.${longName}`, `flags['${longName}']`);
        if (!probes.some(p => runBody.includes(p))) {
          offenders.push(`${name}: -${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
