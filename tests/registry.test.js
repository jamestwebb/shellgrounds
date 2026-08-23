// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// packs/registry.gen.js is generated and committed. A stale one is the obvious
// failure: a teacher imports a pack, forgets to regenerate, and the pack simply
// does not appear — with no error to explain why.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PACKS } from '../packs/index.js';

const ROOT = process.cwd();

describe('generated pack registry', () => {
  it('is in step with the packs directory', () => {
    const before = fs.readFileSync(path.join(ROOT, 'packs/registry.gen.js'), 'utf8');
    execFileSync('node', ['scripts/build-registry.mjs'], { cwd: ROOT, stdio: 'pipe' });
    const after = fs.readFileSync(path.join(ROOT, 'packs/registry.gen.js'), 'utf8');
    expect(after, 'run `npm run registry` and commit the result').toBe(before);
  });

  it('registers every directory that has a pack.json', () => {
    const dirs = fs.readdirSync(path.join(ROOT, 'packs'), { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(name => fs.existsSync(path.join(ROOT, 'packs', name, 'pack.json')));
    const registered = Object.values(PACKS).map(p => p.id).sort();
    const expected = dirs
      .map(d => JSON.parse(fs.readFileSync(path.join(ROOT, 'packs', d, 'pack.json'), 'utf8')).id || d)
      .sort();
    expect(registered).toEqual(expected);
  });

  it('gives every pack a usable filesystem on the platforms it declares', () => {
    for (const pack of Object.values(PACKS)) {
      for (const platform of pack.manifest.platforms || ['linux']) {
        const built = pack.createFs(platform);
        expect(Object.keys(built).length,
          `${pack.id} built an empty filesystem for ${platform}`).toBeGreaterThan(0);
      }
    }
  });

  it('carries the pack helpers the challenges rely on', () => {
    for (const pack of Object.values(PACKS)) {
      expect(pack.challenges.length, `${pack.id} has no challenges`).toBeGreaterThan(0);
      expect(typeof pack.commands).toBe('object');
      expect(typeof pack.help).toBe('object');
    }
  });
});
