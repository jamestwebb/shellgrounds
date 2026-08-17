import { describe, it, expect } from 'vitest';
import { tokenizeCommandLine } from '../src/engine/tokenizer.js';

describe('Tokenizer', () => {
  it('parses simple commands into single stage', () => {
    const res = tokenizeCommandLine('ls -la /home/analyst');
    expect(res.error).toBeUndefined();
    expect(res.pipeline).toHaveLength(1);
    expect(res.pipeline[0].argv).toEqual(['ls', '-la', '/home/analyst']);
  });

  it('handles double and single quoting with spaces', () => {
    const res = tokenizeCommandLine('grep "rabbit hole" \'my notes.txt\'');
    expect(res.error).toBeUndefined();
    expect(res.pipeline[0].argv).toEqual(['grep', 'rabbit hole', 'my notes.txt']);
  });

  it('handles piped commands', () => {
    const res = tokenizeCommandLine('cat access.log | grep -v ALLOW | wc -l');
    expect(res.error).toBeUndefined();
    expect(res.pipeline).toHaveLength(3);
    expect(res.pipeline[0].argv).toEqual(['cat', 'access.log']);
    expect(res.pipeline[1].argv).toEqual(['grep', '-v', 'ALLOW']);
    expect(res.pipeline[2].argv).toEqual(['wc', '-l']);
  });

  it('parses stdout redirection (> and >>)', () => {
    const res1 = tokenizeCommandLine('grep ERROR logs.txt > /tmp/errors.log');
    expect(res1.pipeline[0].redirectOut).toEqual({ file: '/tmp/errors.log', append: false });

    const res2 = tokenizeCommandLine('echo "extra line" >> output.txt');
    expect(res2.pipeline[0].redirectOut).toEqual({ file: 'output.txt', append: true });
  });

  it('parses stderr redirection (2>/dev/null and 2>&1)', () => {
    const res1 = tokenizeCommandLine('find / -name secrets.txt 2>/dev/null');
    expect(res1.pipeline[0].redirectErr).toBe('null');

    const res2 = tokenizeCommandLine('cat file.txt 2>&1');
    expect(res2.pipeline[0].redirectErr).toBe('stdout');
  });

  it('rejects unmatched quotes', () => {
    const res = tokenizeCommandLine('grep "unmatched string file.txt');
    expect(res.error).toContain('unmatched quote');
  });

  it('provides friendly error for unsupported shell features', () => {
    const res1 = tokenizeCommandLine('ls ; cat file.txt');
    expect(res1.error).toContain("you'll meet it on the WorkBench VM");

    const res2 = tokenizeCommandLine('cmd1 || cmd2');
    expect(res2.error).toContain("you'll meet it on the WorkBench VM");
  });
});
