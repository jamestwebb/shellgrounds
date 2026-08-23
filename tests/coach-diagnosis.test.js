// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The coach has to name the real mistake, not the visible symptom.
//
// A student wrote `grep ./Documents/data.csv Weather`, which is grep's two
// arguments the wrong way round. grep answered honestly -- "grep: Weather: No
// such file or directory" -- and the coach matched that text against its
// generic list and replied "check the path and the spelling, paths are
// case-sensitive". The path was correct and correctly spelled. The student was
// sent to re-read a working path while the actual error sat untouched.
//
// Advice that confidently points at the wrong thing is worse than no advice.

import { describe, it, expect } from 'vitest';
import { explainCommand, reversedArgumentAdvice } from '../packages/engine/coach.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { PACKS } from '../packs/index.js';

const linuxFs = () => PACKS['linux-fundamentals'].createFs('linux');
const run = (cmd, cwd = '/home/student') => runPipeline(cmd, cwd, linuxFs(), 'linux', {});
const coach = (cmd, cwd = '/home/student') => explainCommand(cmd, run(cmd, cwd), 'linux', cwd, {});

describe('reversed arguments are named as reversed', () => {
  it('spots the exact command the student typed, and shows the fix', () => {
    const advice = coach('grep ./Documents/data.csv Weather > /tmp/weather_team.txt');
    expect(advice).toMatch(/wrong way round/);
    expect(advice).toMatch(/grep Weather \.\/Documents\/data\.csv/);
    expect(advice, 'must not send them to check a correct path').not.toMatch(/case-sensitive/);
  });

  it('keeps the flags when it suggests the fix', () => {
    expect(coach('grep -i Documents/data.csv weather')).toMatch(/grep -i weather Documents\/data\.csv/);
  });

  it('ignores everything after a redirect or a pipe', () => {
    // /tmp/out.txt looks like a path but belongs to the shell, not to grep.
    expect(coach('grep Documents/data.csv Weather > /tmp/out.txt')).toMatch(/wrong way round/);
  });
});

describe('a genuinely missing file still gets the path advice', () => {
  it('does not cry "reversed" when the file is simply not there', () => {
    const advice = coach('grep Weather Documents/nosuchfile.csv');
    expect(advice).toMatch(/case-sensitive/);
    expect(advice).not.toMatch(/wrong way round/);
  });

  it('leaves other commands alone', () => {
    expect(coach('cat Documents/nope.txt')).toMatch(/case-sensitive/);
  });
});

describe('the detector refuses to guess', () => {
  it('needs two operands, a path-shaped first one, and a plain later one', () => {
    // Only one operand: nothing to have reversed.
    expect(reversedArgumentAdvice('grep', ['grep', 'Weather'], 'No such file or directory')).toBeNull();
    // First operand is not path-shaped, so this is an ordinary missing file.
    expect(reversedArgumentAdvice('grep', ['grep', 'Weather', 'nope'], 'nope: No such file or directory')).toBeNull();
    // Both look like paths: cannot tell, so it says nothing.
    expect(reversedArgumentAdvice('grep', ['grep', 'a/b.txt', 'c/d.txt'], 'c/d.txt: No such file or directory')).toBeNull();
    // Not a pattern-first command at all.
    expect(reversedArgumentAdvice('cat', ['cat', 'a/b.txt', 'x'], 'x: No such file or directory')).toBeNull();
    // Right shape, but the error is not about a missing file.
    expect(reversedArgumentAdvice('grep', ['grep', 'a/b.txt', 'x'], 'Permission denied')).toBeNull();
  });
});

describe('grep accepts the POSIX way of naming a pattern', () => {
  // `-e` is how you search for a pattern beginning with a dash, and the form a
  // student who has met real grep will reach for. It answered "invalid option",
  // which tells somebody they are wrong when they are right.
  it('-e names the pattern and leaves the operands as files', () => {
    const r = run('grep -e Weather Documents/data.csv');
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/Dana Ilves/);
    expect(r.output).toMatch(/Fiona Marsh/);
  });

  it('--regexp= works the same way', () => {
    expect(run('grep --regexp=Weather Documents/data.csv').output).toMatch(/Dana Ilves/);
  });

  it('combines with other flags', () => {
    expect(run('grep -i -e weather Documents/data.csv').output).toMatch(/Dana Ilves/);
  });

  it('still refuses a grep with no pattern at all', () => {
    expect(run('grep').status).toBe(2);
  });
});
