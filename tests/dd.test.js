// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// dd: the restricted subset the simulator implements, and what it refuses.
//
// The test that matters most here is the skip= one. skip counts BLOCKS of bs
// bytes, not bytes, and a version that got that wrong would still print a
// plausible summary and still write a file — it would simply copy the wrong
// region of every disk image, forever, without looking broken. Any exercise
// that carves a partition out of an image depends on this arithmetic being
// right, so it is pinned from both directions: the right bytes come out, and
// the byte-offset reading of skip is shown to be a different answer.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { buildFS, file } from '../packages/engine/vfs/builder.js';
import { registry } from '../packages/engine/commands/registry.js';
import { REAL_LINUX } from '../packages/engine/unknown-command.js';
import { REAL_LINUX_FLAGS } from '../packages/engine/commands/realFlags.js';

// Three 512-byte blocks, each filled with a different letter, so the block a
// copy started from is readable from the first character of the output.
const BLOCK_A = 'A'.repeat(512);
const BLOCK_B = 'B'.repeat(512);
const BLOCK_C = 'C'.repeat(512);
const IMAGE = BLOCK_A + BLOCK_B + BLOCK_C;

function makeFs() {
  return buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        'disk.img': file(IMAGE),
        'short.txt': file('hello\n'),
        'work': {}
      }
    }
  }).fs;
}

function run(cmd, fs = makeFs()) {
  return runPipeline(cmd, '/home/student', fs, 'linux', { user: 'student' });
}

describe('dd exists as a real command', () => {
  it('is registered for Linux', () => {
    expect(registry.get('dd', 'linux')).toBeTruthy();
  });

  it('is not also listed as a real-but-unsimulated command', () => {
    // REAL_LINUX is the list of commands that exist and are NOT simulated.
    // Leaving dd there once it is implemented would make the simulator lie
    // about its own contents.
    expect(REAL_LINUX.has('dd')).toBe(false);
  });

  it('claims no short option letters, because dd takes none', () => {
    // dd's arguments are key=value operands. A dd entry in the flag table
    // would assert that dd accepts `-b` and friends, which it does not.
    expect(REAL_LINUX_FLAGS.dd).toBeUndefined();
  });

  it('has a manual page', () => {
    const res = run('man dd');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('convert and copy a file');
    expect(res.stdout).toContain('skip=N');
  });
});

describe('dd copies bytes', () => {
  it('copies a whole file when given only if= and of=', () => {
    const res = run('dd if=disk.img of=copy.img');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/copy.img'].content).toBe(IMAGE);
  });

  it('copies count= blocks from the start', () => {
    const res = run('dd if=disk.img of=first.img bs=512 count=1');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/first.img'].content).toBe(BLOCK_A);
  });

  it('writes to standard output when of= is absent', () => {
    const res = run('dd if=disk.img bs=512 count=1');
    expect(res.stdout).toBe(BLOCK_A);
  });

  it('reads standard input when if= is absent', () => {
    const res = run('echo hello | dd bs=1 count=3');
    expect(res.stdout).toBe('hel');
  });

  it('truncates an existing output file rather than appending to it', () => {
    const fs = makeFs();
    const first = run('dd if=disk.img of=out.img bs=512 count=2', fs);
    const second = run('dd if=disk.img of=out.img bs=512 count=1', first.fs);
    expect(second.fs['/home/student/out.img'].content).toBe(BLOCK_A);
  });

  it('copies the whole file when if= and of= are given in either order', () => {
    const res = run('dd of=copy.img if=disk.img bs=512 skip=2 count=1');
    expect(res.fs['/home/student/copy.img'].content).toBe(BLOCK_C);
  });
});

describe('skip is counted in blocks, not in bytes', () => {
  it('skip=1 bs=512 starts at byte 512', () => {
    const res = run('dd if=disk.img of=part.img bs=512 skip=1 count=1');
    expect(res.fs['/home/student/part.img'].content).toBe(BLOCK_B);
  });

  it('skip=2 bs=512 starts at byte 1024', () => {
    const res = run('dd if=disk.img of=part.img bs=512 skip=2 count=1');
    expect(res.fs['/home/student/part.img'].content).toBe(BLOCK_C);
  });

  it('does NOT read skip as a byte offset', () => {
    // Reading skip=2 as two BYTES would start inside the first block and copy
    // 510 A's followed by 2 B's. That is the defect this whole file exists to
    // stop, so it is named rather than merely avoided.
    const res = run('dd if=disk.img of=part.img bs=512 skip=2 count=1');
    const byteOffsetAnswer = IMAGE.slice(2, 2 + 512);
    expect(res.fs['/home/student/part.img'].content).not.toBe(byteOffsetAnswer);
  });

  it('scales with bs: the same skip over a bigger block lands further in', () => {
    const res = run('dd if=disk.img of=part.img bs=1024 skip=1 count=1');
    expect(res.fs['/home/student/part.img'].content).toBe(BLOCK_C);
  });

  it('reads nothing, and reports no error, when skip passes the end', () => {
    const res = run('dd if=disk.img of=part.img bs=512 skip=99');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/part.img'].content).toBe('');
    expect(res.stderr).toContain('0+0 records in');
  });
});

describe('the records summary', () => {
  it('goes to stderr, not stdout, exactly as real dd does', () => {
    const res = run('dd if=disk.img bs=512 count=1');
    expect(res.stderr).toContain('records in');
    expect(res.stdout).not.toContain('records in');
  });

  it('counts whole blocks as N+0', () => {
    const res = run('dd if=disk.img of=part.img bs=512 count=3');
    expect(res.stderr).toBe('3+0 records in\n3+0 records out\n1536 bytes (1.5 kB, 1.5 KiB) copied\n');
  });

  it('counts a short final block as the +1', () => {
    const res = run('dd if=short.txt of=part.txt bs=512');
    expect(res.stderr).toBe('0+1 records in\n0+1 records out\n6 bytes copied\n');
  });

  it('says "1 byte" and not "1 bytes"', () => {
    const res = run('dd if=disk.img bs=1 count=1');
    expect(res.stderr).toContain('1 byte copied');
  });

  it('adds the SI and IEC readings only above 1000 bytes', () => {
    const small = run('dd if=disk.img of=a.img bs=512 count=1');
    expect(small.stderr).toContain('512 bytes copied');
    expect(small.stderr).not.toContain('(');

    const big = run('dd if=disk.img of=b.img bs=1024 count=1');
    expect(big.stderr).toContain('1024 bytes (1.0 kB, 1.0 KiB) copied');
  });

  it('reports nothing copied as 0+0', () => {
    const res = run('dd if=disk.img of=part.img bs=512 count=0');
    expect(res.stderr).toBe('0+0 records in\n0+0 records out\n0 bytes copied\n');
    expect(res.fs['/home/student/part.img'].content).toBe('');
  });

  it('leaves stdout clean enough to pipe', () => {
    const res = run('dd if=disk.img bs=512 count=1 | wc -c');
    expect(res.stdout.trim()).toBe('512');
  });
});

describe('dd refuses what it cannot do, in dd\'s own words', () => {
  it('reports a missing input file the way dd reports it', () => {
    const res = run('dd if=nowhere.img of=out.img');
    expect(res.status).toBe(1);
    expect(res.stderr).toBe("dd: failed to open 'nowhere.img': No such file or directory\n");
  });

  it('reports an output file it cannot create', () => {
    const res = run('dd if=disk.img of=/nodir/out.img');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("dd: failed to open '/nodir/out.img'");
  });

  it('rejects an invented operand', () => {
    const res = run('dd if=disk.img frobnicate=2');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("dd: unrecognized operand 'frobnicate=2'");
  });

  it('rejects a bare word that is not key=value', () => {
    const res = run('dd disk.img');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("dd: unrecognized operand 'disk.img'");
  });

  it('says a real operand it has not built is real', () => {
    // conv=, seek= and status= exist. Calling them "unrecognized" would tell
    // the student something false about dd, and a learner cannot tell an
    // incomplete simulator from their own mistake unless it says which.
    for (const operand of ['conv=noerror', 'seek=1', 'status=none', 'iflag=direct']) {
      const res = run(`dd if=disk.img ${operand}`);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('is real, but it is not simulated here');
    }
  });

  it('rejects a block size that is not a number', () => {
    const res = run('dd if=disk.img bs=big');
    expect(res.status).toBe(1);
    expect(res.stderr).toBe("dd: invalid number: 'big'\n");
  });

  it('rejects a block size of zero', () => {
    const res = run('dd if=disk.img bs=0');
    expect(res.status).toBe(1);
    expect(res.stderr).toBe("dd: invalid number: '0'\n");
  });

  it('accepts the size suffixes real dd accepts', () => {
    const res = run('dd if=disk.img of=part.img bs=1K skip=1 count=1');
    expect(res.status).toBe(0);
    expect(res.fs['/home/student/part.img'].content).toBe(BLOCK_C);
  });

  it('does not write an output file when the input cannot be read', () => {
    const res = run('dd if=nowhere.img of=out.img');
    expect(res.fs['/home/student/out.img']).toBeUndefined();
  });
});
