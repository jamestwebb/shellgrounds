// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Pipeline Engine Integration Tests

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { createLinuxFilesystem } from '../src/engine/fs.linux.js';

describe('Pipeline Engine', () => {
  it('threads stdout through multi-stage pipes', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('cat Documents/security_events.csv | grep FLAG_EMIT | cut -d, -f5', '/home/examiner', fs, 'linux');
    expect(res.output.trim().split('\n')).toEqual(['FLAG_EMIT']);
  });

  it('counts lines accurately via wc -l in pipeline', () => {
    const fs = createLinuxFilesystem();
    const res = runPipeline('cat Documents/logs.txt | grep -i error | wc -l', '/home/examiner', fs, 'linux');
    expect(res.output.trim()).toBe('7');
  });

  it('writes redirected output into VFS and allows subsequent cat', () => {
    let fs = createLinuxFilesystem();
    // Derive the expectation from the fixture rather than quoting the pack's
    // prose. This test is about redirection, and it should not go red the next
    // time somebody rewrites a log file's contents.
    const source = fs['/home/examiner/Documents/logs.txt'].content;
    const expected = source.split('\n').filter(l => /error/i.test(l));
    expect(expected.length, 'fixture should contain some error lines').toBeGreaterThan(0);

    const res1 = runPipeline('grep -i error Documents/logs.txt > /tmp/error_summary.txt', '/home/examiner', fs, 'linux');
    expect(res1.output).toBe(''); // Suppressed from screen
    expect(res1.fs['/tmp/error_summary.txt']).toBeDefined();

    const res2 = runPipeline('cat /tmp/error_summary.txt', '/home/examiner', res1.fs, 'linux');
    for (const line of expected) expect(res2.output).toContain(line);
    // and nothing that did not match
    const nonMatching = source.split('\n').filter(l => l.trim() && !/error/i.test(l));
    for (const line of nonMatching) expect(res2.output).not.toContain(line);
  });

  it('appends with >> operator', () => {
    let fs = createLinuxFilesystem();
    const res1 = runPipeline('echo "line 1" > /tmp/append_test.txt', '/home/examiner', fs, 'linux');
    const res2 = runPipeline('echo "line 2" >> /tmp/append_test.txt', '/home/examiner', res1.fs, 'linux');
    const res3 = runPipeline('cat /tmp/append_test.txt', '/home/examiner', res2.fs, 'linux');
    expect(res3.output).toContain('line 1');
    expect(res3.output).toContain('line 2');
  });
});
