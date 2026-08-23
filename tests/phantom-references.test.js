// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// References to things that are not there.
//
// This project has no type checker and no linter, so a name that does not
// resolve is found by a student, not by a build. Two of them shipped:
//
//   `sounds.playKey` and `sounds.playEnter` were called five times and never
//   written. The Enter handler threw before the line that runs the command, so
//   the terminal stopped working entirely. tests/audio.test.js guards that one.
//
//   `/home/analyst` was the terminal's starting directory and the fallback on
//   both platform branches, and no pack has ever contained it. A student stood
//   in a directory that does not exist, where `ls` fails and every relative
//   path in every brief is wrong -- while the prompt displayed the phantom path
//   as though it were a real place.
//
// The second is the one this file catches, and the shape generalises: a string
// literal that names a location, an id, or a file, and is checked against
// nothing. A plausible-looking wrong value is far more expensive than an
// obviously wrong one, because it looks like the feature working.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS } from '../packs/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
  return /\.(js|jsx)$/.test(e.name) ? [full] : [];
});

const sources = ['src', 'packages', 'netlify']
  .map(d => path.join(ROOT, d))
  .filter(fs.existsSync)
  .flatMap(walk);

/** Every path any pack's filesystem actually contains, on either platform. */
const realPaths = (() => {
  const set = new Set();
  for (const pack of Object.values(PACKS)) {
    for (const platform of ['linux', 'windows']) {
      let vfs;
      try { vfs = pack.createFs(platform); } catch { continue; }
      if (vfs) for (const key of Object.keys(vfs)) set.add(key);
    }
  }
  return set;
})();

describe('the codebase names only places that exist', () => {
  it('found the packs to check against, so an empty pass is not a pass', () => {
    expect(realPaths.size).toBeGreaterThan(50);
    expect(sources.length).toBeGreaterThan(20);
  });

  it('no source file hardcodes a home directory no pack has', () => {
    const offenders = [];
    for (const file of sources) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Comments describe this bug at length; they are not the bug.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const m of line.matchAll(/['"](\/home\/[A-Za-z0-9_.\/-]+|[A-Z]:\\\\Users\\\\[A-Za-z0-9_.\\\\-]+)['"]/g)) {
          const literal = m[1].replace(/\\\\/g, '\\');
          if (realPaths.has(literal)) continue;
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${literal}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('no source file names a challenge id no pack defines', () => {
    const ids = new Set(Object.values(PACKS).flatMap(p => p.challenges.map(c => c.id)));
    const offenders = [];
    for (const file of sources) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const m of line.matchAll(/['"]((?:act|l|w)\d+-[a-z0-9-]+)['"]/g)) {
          if (ids.has(m[1])) continue;
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${m[1]}`);
        }
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  // Every pack must be able to answer "where does a student start?" with a
  // directory it really has. This is the positive form of the same rule.
  it('every pack home is a directory that pack contains', () => {
    for (const pack of Object.values(PACKS)) {
      for (const platform of pack.manifest.platforms || ['linux']) {
        const home = platform === 'windows'
          ? pack.manifest.windows?.home
          : pack.manifest.linux?.home;
        expect(home, `${pack.id} declares no ${platform} home`).toBeTruthy();
        const vfs = pack.createFs(platform);
        expect(Object.keys(vfs), `${pack.id} ${platform} home ${home}`).toContain(home);
      }
    }
  });
});
