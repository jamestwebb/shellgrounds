// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Pipeline Engine Integration Tests

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { createWarrenFilesystem } from '../src/engine/fs.warren.js';

describe('Pipeline Engine', () => {
  it('threads stdout through multi-stage pipes', () => {
    const fs = createWarrenFilesystem();
    const res = runPipeline('cat Documents/security_events.csv | grep FLAG_EMIT | cut -d, -f5', '/home/analyst', fs, 'linux');
    expect(res.output.trim().split('\n')).toEqual(['FLAG_EMIT']);
  });

  it('counts lines accurately via wc -l in pipeline', () => {
    const fs = createWarrenFilesystem();
    const res = runPipeline('cat Documents/logs.txt | grep -i error | wc -l', '/home/analyst', fs, 'linux');
    expect(res.output.trim()).toBe('7');
  });

  it('writes redirected output into VFS and allows subsequent cat', () => {
    let fs = createWarrenFilesystem();
    const res1 = runPipeline('grep -i error Documents/logs.txt > /tmp/error_summary.txt', '/home/analyst', fs, 'linux');
    expect(res1.output).toBe(''); // Suppressed from screen
    expect(res1.fs['/tmp/error_summary.txt']).toBeDefined();

    const res2 = runPipeline('cat /tmp/error_summary.txt', '/home/analyst', res1.fs, 'linux');
    expect(res2.output).toContain('Database connection timeout');
    expect(res2.output).toContain('Authentication failed');
  });

  it('appends with >> operator', () => {
    let fs = createWarrenFilesystem();
    const res1 = runPipeline('echo "line 1" > /tmp/append_test.txt', '/home/analyst', fs, 'linux');
    const res2 = runPipeline('echo "line 2" >> /tmp/append_test.txt', '/home/analyst', res1.fs, 'linux');
    const res3 = runPipeline('cat /tmp/append_test.txt', '/home/analyst', res2.fs, 'linux');
    expect(res3.output).toContain('line 1');
    expect(res3.output).toContain('line 2');
  });
});
