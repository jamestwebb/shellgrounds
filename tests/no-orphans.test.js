// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// No test may be the only thing keeping a module alive.
//
// src/engine/ held two full copies of engine modules — a 281-line tokenizer
// that had drifted 432 lines from the shipping one, and a 152-line filesystem
// builder missing the ownership rule that stops a student owning /etc/passwd.
// Nothing in the product imported either. Nine tests passed against them.
//
// That is worse than nine tests fewer. They read like coverage of the parser
// students type into and the filesystem they explore, and were coverage of
// files that could have been deleted with no effect on anything. One of them
// asserted that `;` and `||` are unsupported — retired Warren-era behaviour —
// so pointed at the real module it would have failed against a working feature
// that a whole act now teaches.
//
// The defect is not the duplication. It is that the duplication was invisible:
// a green suite reported confidence it did not have. This test makes the shape
// visible instead of relying on somebody noticing.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every source file the project ships or builds from. */
function sourceFiles() {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.netlify', 'docs', '.termai']);
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.(js|mjs|jsx)$/.test(entry)) out.push(full);
    }
  };
  walk(ROOT);
  return out;
}

const FILES = sourceFiles();
const SOURCES = new Map(FILES.map(f => [f, readFileSync(f, 'utf8')]));

const isTest = (f) => /[/\\]tests[/\\]/.test(f) || /\.test\.[jt]sx?$/.test(f);

/** Files that import the given module, split by whether they are tests. */
function importersOf(target) {
  const base = target.replace(/\.(js|jsx|mjs)$/, '');
  const name = base.split(/[/\\]/).pop();
  const production = [];
  const tests = [];

  for (const [file, src] of SOURCES) {
    if (file === target) continue;
    // Any specifier ending in this module's name, with or without extension.
    // Both forms count: a static `from '...'` and a dynamic `import('...')`.
    // A module loaded dynamically is still reachable, and loading it that way
    // is often deliberate -- it keeps code out of the bundle for everyone who
    // never takes that branch.
    const tail = `[^'"]*${name}(\\.js|\\.jsx|\\.mjs)?['"]`;
    const re = new RegExp(`(from\\s+['"]${tail}|import\\s*\\(\\s*['"]${tail})`);
    if (!re.test(src)) continue;
    (isTest(file) ? tests : production).push(relative(ROOT, file));
  }
  return { production, tests };
}

describe('every module is reachable from something that ships', () => {
  // Entry points and files loaded by a tool rather than by an import.
  const ENTRY = [
    /[/\\]src[/\\]main\.jsx$/,
    /[/\\]bin[/\\]/,
    /[/\\]scripts[/\\]/,
    /[/\\]netlify[/\\]functions[/\\][^/\\]+\.js$/,
    // Edge functions are discovered by directory too, and are entry points
    // for the same reason: Netlify calls them, nothing imports them.
    /[/\\]netlify[/\\]edge-functions[/\\][^/\\]+\.js$/,
    /[/\\]packs[/\\][^/\\]+[/\\]/,          // pack modules, named by the registry
    /registry\.gen\.js$/,
    /vite\.config\.js$/,
    /tailwind\.config\.js$/,
    /postcss\.config\.js$/,
    /eslint\.config\.js$/
  ];
  const isEntry = (f) => ENTRY.some(re => re.test(f));

  const candidates = FILES.filter(f => !isTest(f) && !isEntry(f));

  it('found the source tree', () => {
    expect(candidates.length).toBeGreaterThan(20);
  });

  it('has no module that only tests import', () => {
    const orphans = [];
    for (const f of candidates) {
      const { production, tests } = importersOf(f);
      if (production.length === 0 && tests.length > 0) {
        orphans.push(`${relative(ROOT, f)} — imported only by ${tests.join(', ')}`);
      }
    }
    expect(orphans, 'a test is the only thing keeping these alive').toEqual([]);
  });

  it('has no module nothing imports at all', () => {
    const dead = [];
    for (const f of candidates) {
      const { production, tests } = importersOf(f);
      if (production.length === 0 && tests.length === 0) dead.push(relative(ROOT, f));
    }
    expect(dead, 'nothing imports these; delete them or wire them up').toEqual([]);
  });
});

describe('the browser and the server share one engine', () => {
  // The server replays a command to grade it and the browser runs the same
  // command to show the student what happened. Two implementations of that
  // would eventually disagree, and the student would be told their correct
  // answer was wrong. There must be exactly one of each of these.
  const SINGLE = ['tokenizer.js', 'builder.js', 'predicates.js', 'exec.js'];

  it('has one implementation of each engine module, not two', () => {
    for (const name of SINGLE) {
      const found = FILES
        .filter(f => f.endsWith(`/${name}`) && !isTest(f))
        .map(f => relative(ROOT, f));
      expect(found, `${name} should exist once`).toHaveLength(1);
      expect(found[0], `${name} belongs in packages/engine`).toMatch(/^packages[/\\]engine[/\\]/);
    }
  });

  it('grades with the same module in both places', () => {
    const browser = readFileSync(join(ROOT, 'src/App.jsx'), 'utf8');
    const server = readFileSync(join(ROOT, 'netlify/functions/submit-flag.js'), 'utf8');
    for (const src of [browser, server]) {
      expect(src).toMatch(/from '[^']*packages\/engine\/validate\/predicates\.js'/);
    }
  });
});
