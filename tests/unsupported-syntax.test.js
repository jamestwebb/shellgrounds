// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Syntax this shell does not implement must say so, and must say so only when
// the syntax is really there.
//
// Two failures are being pinned, and they pull in opposite directions.
//
//   1. `echo $(date)` used to print the literal string $(date) and exit 0.
//      Nothing about that looks broken, so a student reads the output as what
//      bash does. A silent wrong answer teaches more falsehood than an error.
//
//   2. The obvious fix — refuse any line containing `if`, `for`, `while` or
//      `case` — breaks `grep if file`, which is a perfectly good command.
//      Those words are keywords ONLY in command position, so the false
//      positives are tested as hard as the detections.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { tokenizeCommandLine, detectUnsupportedSyntax } from '../packages/engine/shell/tokenizer.js';
import { buildFS, file } from '../packages/engine/vfs/builder.js';

const NOTES = 'if this\nfor that\nwhile waiting\ncase closed\nplain line\n';

function makeFs() {
  return buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        'notes.txt': file(NOTES),
        'a.txt': file('b\na\n'),
        'b.txt': file('a\nb\n'),
        'if': file('a file actually called if\n')
      }
    }
  }).fs;
}

function run(cmd, context = {}) {
  return runPipeline(cmd, '/home/student', makeFs(), 'linux', { user: 'student', ...context });
}

const UNSUPPORTED = 'real bash syntax, but not simulated here';

describe('constructs this shell cannot run', () => {
  const cases = [
    ['command substitution', 'echo $(date)', '$(...)'],
    ['command substitution inside double quotes', 'echo "today is $(date)"', '$(...)'],
    ['command substitution spanning a semicolon', 'echo $(cd /tmp; ls)', '$(...)'],
    ['command substitution spanning a pipe', 'echo $(ls | wc -l)', '$(...)'],
    ['backticks', 'echo `date`', '`...`'],
    ['backticks inside double quotes', 'echo "it is `date`"', '`...`'],
    ['arithmetic expansion', 'echo $((2 + 2))', '$((...))'],
    ['process substitution on input', 'diff <(sort a.txt) <(sort b.txt)', '<(...)'],
    ['process substitution on output', 'ls > >(cat)', '>(...)'],
    ['an if statement', 'if [ -f a.txt ]; then echo yes; fi', 'if'],
    ['a for loop', 'for f in *.txt; do echo $f; done', 'for'],
    ['a while loop', 'while true; do echo x; done', 'while'],
    ['a case statement', 'case $x in a) echo a;; esac', 'case']
  ];

  for (const [label, command, marker] of cases) {
    it(`answers ${label} with the unsupported message`, () => {
      const res = run(command);
      expect(res.stderr).toContain(UNSUPPORTED);
      expect(res.stderr).toContain(marker);
      expect(res.hasError).toBe(true);
      expect(res.status).not.toBe(0);
    });

    it(`does not silently pass ${label} through to a command`, () => {
      const res = run(command);
      expect(res.stdout).toBe('');
    });
  }

  it('leaves the filesystem alone when it refuses a line', () => {
    // The refusal happens during tokenization, so nothing runs at all — even
    // the part of the line that would have worked on its own.
    const res = run('rm notes.txt; echo $(date)');
    expect(res.fs['/home/student/notes.txt']).toBeTruthy();
  });

  it('names the construct in the tokenizer result, not just in the message', () => {
    const tokenized = tokenizeCommandLine('echo $(date)', false);
    expect(tokenized.unsupportedSyntax).toBeTruthy();
    expect(tokenized.unsupportedSyntax.syntax).toBe('$(...)');
    expect(tokenized.lists).toEqual([]);
  });

  it('keeps an ordinary syntax error in bash\'s own voice', () => {
    // An unmatched quote IS the student's mistake, and must not be dressed up
    // as an unimplemented feature.
    const res = run('echo "unclosed');
    expect(res.stderr).toContain('bash:');
    expect(res.stderr).not.toContain(UNSUPPORTED);
  });
});

describe('a pack can supply its own wording', () => {
  it('uses context.unsupportedSyntaxMessage when one is given', () => {
    const res = run('echo $(date)', { unsupportedSyntaxMessage: 'Not in this course. One command per line.' });
    expect(res.stderr).toBe('Not in this course. One command per line.\n');
  });

  it('falls back to the engine wording when none is given', () => {
    const res = run('echo $(date)');
    expect(res.stderr).toContain(UNSUPPORTED);
  });

  it('does not use the pack wording for an ordinary syntax error', () => {
    const res = run("echo 'unclosed", { unsupportedSyntaxMessage: 'Not in this course.' });
    expect(res.stderr).not.toContain('Not in this course.');
  });
});

describe('the detection must not fire on ordinary commands', () => {
  it('grep if file still works', () => {
    // The whole reason the keyword check looks at command position only.
    const res = run('grep if notes.txt');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('if this\n');
    expect(res.stderr).toBe('');
  });

  it('keeps working for every keyword used as a search word', () => {
    for (const word of ['if', 'for', 'while', 'case']) {
      const res = run(`grep ${word} notes.txt`);
      expect(res.status).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout).toContain(word);
    }
  });

  it('allows a keyword as an argument in any position', () => {
    const res = run('grep -n case notes.txt');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('case closed');
  });

  it('allows a file named after a keyword', () => {
    const res = run('cat if');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('a file actually called if\n');
  });

  it('allows a keyword as the command in a later pipe stage', () => {
    const res = run('cat notes.txt | grep while');
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('while waiting\n');
  });

  it('treats a quoted first word as a command name, not a keyword', () => {
    const res = run('"if" notes.txt');
    // Not the unsupported-syntax answer: it is an unknown command, which is
    // what bash would also say once the quotes stop it being a keyword.
    expect(res.stderr).not.toContain(UNSUPPORTED);
  });

  it('does not fire inside single quotes', () => {
    const res = run("echo '$(date)'");
    expect(res.status).toBe(0);
    expect(res.stdout).toBe('$(date)\n');
  });

  it('does not fire on an escaped dollar sign', () => {
    const res = run('echo \\$(date)');
    expect(res.status).toBe(0);
    expect(res.stderr).toBe('');
  });

  it('does not fire on a lone backtick with no partner', () => {
    const res = run('echo a`b');
    expect(res.stderr).not.toContain(UNSUPPORTED);
  });

  it('does not fire on plain redirection', () => {
    const res = run('echo hi > out.txt');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/out.txt'].content).toBe('hi\n');
  });

  it('does not fire on a plain variable, glob, or comparison', () => {
    for (const command of ['echo $HOME', 'ls *.txt', 'test 1 -lt 2']) {
      const res = run(command);
      expect(res.stderr).not.toContain(UNSUPPORTED);
    }
  });

  it('is off for Windows, where none of these forms exist', () => {
    const tokenized = tokenizeCommandLine('echo $(date)', true);
    expect(tokenized.unsupportedSyntax).toBeUndefined();
  });
});

describe('detectUnsupportedSyntax on its own', () => {
  it('returns null for a line with nothing unsupported in it', () => {
    expect(detectUnsupportedSyntax('ls -la | grep if')).toBeNull();
  });

  it('reports the first construct it meets', () => {
    expect(detectUnsupportedSyntax('echo $(date)').syntax).toBe('$(...)');
    expect(detectUnsupportedSyntax('echo `date`').syntax).toBe('`...`');
  });

  it('tells arithmetic expansion apart from command substitution', () => {
    // $(( and $( differ by one character and mean different things. Naming
    // arithmetic as a command substitution would send the student to fix the
    // wrong thing.
    expect(detectUnsupportedSyntax('echo $((1+1))').syntax).toBe('$((...))');
  });
});
