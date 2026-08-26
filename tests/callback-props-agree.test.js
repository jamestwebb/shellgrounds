// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// A callback prop is a contract between two files, and nothing was checking it.
//
// The defect that prompted this: ChallengeSidebar called
// `onSubmitFlag(challengeId, flag, hintsUsed)` while App's handler was written
// `async (flagValue)`. Every find a student typed arrived at the server as the
// challenge id and was refused, and the handler returned nothing so the child
// threw a TypeError into the student's feedback box.
//
// Neither file was wrong on its own, which is why 963 unit tests passed over
// it. The mismatch only exists BETWEEN them, so this reads both.
//
// Two shapes are caught:
//   - a call passing more arguments than the handler accepts, which means at
//     least one argument is silently dropped and the rest may be shifted;
//   - a caller reading a result from a handler that returns nothing.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');

/** Source with comments removed, so a check never matches its own explanation. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const files = new Map([
  ['App.jsx', strip(readFileSync(join(SRC, 'App.jsx'), 'utf8'))],
  ...readdirSync(join(SRC, 'components'))
    .filter(f => f.endsWith('.jsx'))
    .map(f => [f, strip(readFileSync(join(SRC, 'components', f), 'utf8'))])
]);

function paramsOf(text, name) {
  const m = text.match(new RegExp(`const\\s+${name}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`));
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : null;
}

function returnsValue(text, name) {
  const at = text.indexOf(`const ${name} =`);
  if (at < 0) return null;
  const tail = text.slice(at);
  const end = tail.indexOf('\n  };');
  return /return\s+[^;\s]/.test(tail.slice(0, end < 0 ? 4000 : end));
}

/** The top-level arguments of a call starting at `at`. */
function argsOf(text, at, name) {
  let depth = 0, end = -1;
  for (let i = at + name.length; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (!depth) { end = i; break; } }
  }
  const inner = text.slice(at + name.length + 1, end);
  if (!inner.trim()) return [];
  const out = [];
  let nest = 0, cur = '';
  for (const ch of inner) {
    if ('([{'.includes(ch)) nest++;
    if (')]}'.includes(ch)) nest--;
    if (ch === ',' && !nest) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function sweep() {
  const found = [];
  for (const [parent, ptext] of files) {
    for (const [, prop, handler] of ptext.matchAll(/(\bon[A-Z]\w*)=\{(\w+)\}/g)) {
      const params = paramsOf(ptext, handler);
      if (!params) continue;
      for (const [child, ctext] of files) {
        if (child === parent) continue;
        const re = new RegExp(`(?<![\\w.])${prop}\\s*\\(`, 'g');
        for (const m of ctext.matchAll(re)) {
          const args = argsOf(ctext, m.index, prop);
          const before = ctext.slice(Math.max(0, m.index - 60), m.index);
          const reads = /(const|let|var)\s+\w+\s*=\s*(await\s+)?$/.test(before)
            || /\.then\s*\($/.test(before);
          if (args.length > params.length) {
            found.push(`${parent} -> ${child}: ${prop} called with ${args.length} argument(s) `
              + `[${args.join(', ')}] but ${handler} accepts ${params.length} [${params.join(', ')}]`);
          }
          if (reads && returnsValue(ptext, handler) === false) {
            found.push(`${parent} -> ${child}: ${prop} result is read, but ${handler} returns nothing`);
          }
        }
      }
    }
  }
  return found;
}

describe('callback props agree with their call sites', () => {
  it('finds no handler called with more arguments than it takes', () => {
    expect(sweep()).toEqual([]);
  });

  it('can actually see the defect it exists for', () => {
    // A guard on the guard. The first version of this sweep called exec()
    // before matchAll() on the same global regex, which advanced lastIndex
    // past the only match and reported the codebase clean while the bug was
    // still in it.
    const app = files.get('App.jsx');
    expect(app).toMatch(/const handleFlagSubmit\s*=\s*async\s*\(\s*challengeId\s*,/);
    const at = app.indexOf('onSubmitFlag={');
    expect(at).toBeGreaterThan(-1);
    const sidebar = files.get('ChallengeSidebar.jsx');
    const calls = [...sidebar.matchAll(/(?<![\w.])onSubmitFlag\s*\(/g)];
    expect(calls.length).toBeGreaterThan(0);
  });
});
