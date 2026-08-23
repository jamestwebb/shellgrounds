// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The tokenizer that actually ships.
//
// This file used to import src/engine/tokenizer.js, a 281-line copy that
// nothing in the product imports and which had drifted 432 lines away from the
// real one. Seven tests passed against it for as long as it existed, which is
// worse than seven tests fewer: they read like coverage of the parser students
// type into, and were coverage of a file that could be deleted with no effect.
//
// One of them asserted that `;` and `||` produce "you'll meet it on the
// WorkBench VM" — a limitation from the retired Warren fiction. The shipping
// tokenizer parses command lists, and Linux Fundamentals Act IV teaches them.
// Pointed at the real module, that test would have failed against a working
// feature. It is now the opposite assertion.

import { describe, it, expect } from 'vitest';
import { tokenizeCommandLine } from '../packages/engine/shell/tokenizer.js';

/** The stages of the first (or only) command list. */
const stages = (res) => res.lists?.[0]?.stages || [];

/** A stage's tokens flattened back to the words a shell would pass as argv. */
const argv = (stage) => (stage.rawTokens || []).map(tok => tok.map(t => t.value).join(''));

describe('the tokenizer', () => {
  it('parses a simple command into one stage', () => {
    const res = tokenizeCommandLine('ls -la /home/student');
    expect(res.error).toBeUndefined();
    expect(stages(res)).toHaveLength(1);
    expect(argv(stages(res)[0])).toEqual(['ls', '-la', '/home/student']);
  });

  it('keeps a quoted argument as one word, in either quote style', () => {
    const res = tokenizeCommandLine('grep "night shift" \'my notes.txt\'');
    expect(res.error).toBeUndefined();
    expect(argv(stages(res)[0])).toEqual(['grep', 'night shift', 'my notes.txt']);
  });

  it('splits a pipeline into a stage per command', () => {
    const res = tokenizeCommandLine('cat access.log | grep -v ALLOW | wc -l');
    expect(res.error).toBeUndefined();
    expect(stages(res)).toHaveLength(3);
    expect(argv(stages(res)[0])).toEqual(['cat', 'access.log']);
    expect(argv(stages(res)[1])).toEqual(['grep', '-v', 'ALLOW']);
    expect(argv(stages(res)[2])).toEqual(['wc', '-l']);
  });

  it('reads > and >> as write and append', () => {
    expect(stages(tokenizeCommandLine('grep ERROR logs.txt > /tmp/errors.log'))[0].redirectOut)
      .toEqual({ file: '/tmp/errors.log', append: false });
    expect(stages(tokenizeCommandLine('echo "extra line" >> output.txt'))[0].redirectOut)
      .toEqual({ file: 'output.txt', append: true });
  });

  it('reads 2>/dev/null and 2>&1 as the two things they mean', () => {
    expect(stages(tokenizeCommandLine('find / -name secrets.txt 2>/dev/null'))[0].redirectErr)
      .toBe('null');
    expect(stages(tokenizeCommandLine('cat file.txt 2>&1'))[0].redirectErr)
      .toBe('stdout');
  });

  it('refuses an unmatched quote rather than guessing where it ended', () => {
    const res = tokenizeCommandLine('grep "unmatched string file.txt');
    expect(res.error).toContain('unmatched quote');
  });

  // The assertion this replaces said `;` and `||` were not simulated. They are,
  // and a whole act is built on them.
  // `op` is the operator that FOLLOWS a segment, so it sits on the left-hand
  // one and the last segment's op is null. Easy to read the other way round,
  // so it is asserted rather than assumed.
  it('parses a command list, because the course teaches one', () => {
    for (const [line, op] of [
      ['ls ; cat notes.txt', ';'],
      ['test -f a.txt || echo missing', '||'],
      ['mkdir out && cd out', '&&']
    ]) {
      const res = tokenizeCommandLine(line);
      expect(res.error, line).toBeUndefined();
      expect(res.lists, line).toHaveLength(2);
      expect(res.lists[0].op, `${line}: the operator belongs to the segment before it`).toBe(op);
      expect(res.lists[1].op, `${line}: nothing follows the last segment`).toBeNull();
    }
  });

  it('reads a pipeline inside one branch of a list', () => {
    const res = tokenizeCommandLine('grep ERROR log.txt | wc -l && echo done');
    expect(res.lists).toHaveLength(2);
    expect(res.lists[0].stages, 'the pipeline is inside the first branch').toHaveLength(2);
    expect(res.lists[0].op).toBe('&&');
    expect(res.lists[1].stages).toHaveLength(1);
  });
});
