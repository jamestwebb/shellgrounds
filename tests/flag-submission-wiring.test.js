// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The sidebar's find box and the handler behind it must agree.
//
// They did not, and nothing noticed. ChallengeSidebar called
// `onSubmitFlag(challengeId, flag, hintsUsed)`; App's handler was written
// `async (flagValue)`. So every find submitted from the box arrived at the
// server as the challenge id -- `act1-hidden` where `FIND{...}` belonged --
// and was refused. Seventeen of the thirty challenges in the demo's own
// default pack could not be solved from that box at all.
//
// The handler also returned nothing, so the sidebar's `res.success` threw, and
// the student read "Cannot read properties of undefined" in the box where
// their answer went.
//
// Both are wiring between two files, which unit tests on either file alone
// cannot see. This reads the source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Source with comments removed, so a check never matches its own explanation. */
const sourceOf = (rel) => readFileSync(join(root, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(line => !line.trim().startsWith('//'))
  .join('\n');

const app = sourceOf('src/App.jsx');
const sidebar = sourceOf('src/components/ChallengeSidebar.jsx');

/** The arguments of the first `onSubmitFlag(...)` call, split at the top level. */
function callArgs(src) {
  const at = src.indexOf('onSubmitFlag(');
  expect(at, 'ChallengeSidebar must call onSubmitFlag').toBeGreaterThan(-1);
  let depth = 0;
  let end = -1;
  for (let i = at + 'onSubmitFlag('.length - 1; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(at + 'onSubmitFlag('.length, end).split(',').map(s => s.trim());
}

/** The parameter names of `const handleFlagSubmit = async (...)`. */
function handlerParams(src) {
  const m = src.match(/const handleFlagSubmit\s*=\s*async\s*\(([^)]*)\)/);
  expect(m, 'App must define handleFlagSubmit').not.toBeNull();
  return m[1].split(',').map(s => s.trim()).filter(Boolean);
}

describe('the find box and its handler agree', () => {
  it('passes the challenge first and the find second', () => {
    const args = callArgs(sidebar);
    expect(args[0]).toMatch(/challenge/i);
    expect(args[1]).toMatch(/flag/i);
  });

  it('accepts them in the order the sidebar sends them', () => {
    const params = handlerParams(app);
    expect(params.length).toBeGreaterThanOrEqual(2);
    expect(params[0]).toMatch(/challenge/i);
    expect(params[1]).toMatch(/flag/i);
  });

  it('never takes the find in the first slot', () => {
    // The exact shape of the original defect: one parameter, and it is the find.
    const params = handlerParams(app);
    expect(params.length === 1 && /flag/i.test(params[0])).toBe(false);
  });

  it('returns a result on every path, because the sidebar reads one', () => {
    const body = app.slice(app.indexOf('const handleFlagSubmit'));
    const end = body.indexOf('\n  };');
    const fn = body.slice(0, end);
    expect(fn).toMatch(/return res;/);
    expect(fn.match(/return \{ success:/g)?.length || 0).toBeGreaterThanOrEqual(2);
    expect(fn).not.toMatch(/\n\s+return;\n/);
  });

  it('reads the points field the server actually sends', () => {
    expect(sidebar).not.toMatch(/pointsAwarded/);
  });
});
