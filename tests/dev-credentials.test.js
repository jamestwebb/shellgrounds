// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The dev credential panel must not survive a production build.
//
// The gate shows the class password and the instructor setup code while you
// develop, which is a convenience and a liability in the same feature. It is
// gated twice, and this file checks both gates against real artefacts rather
// than against the intention:
//
//   1. The panel is behind `import.meta.env.DEV`, a literal `false` in a
//      production build, so the bundler deletes it. Proven by building the
//      real app and reading the output.
//   2. The endpoint lives in scripts/dev-functions.mjs, which Netlify never
//      deploys. Proven by checking netlify/functions/ does not answer it.
//
// A run-time `if (process.env.NODE_ENV !== 'production')` would pass a review
// and still leak the day somebody deploys with the wrong variable set. These
// two gates cannot be reached by a misconfiguration.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every byte the browser would download, concatenated. */
function bundleText(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.(js|css|html|map)$/.test(entry)) out.push(readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return out.join('\n');
}

describe('a production build carries no credential panel', () => {
  let dist, built;

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'shellgrounds-distcheck-'));
    execFileSync('node_modules/.bin/vite', ['build', '--outDir', dist, '--emptyOutDir'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production' }
    });
    built = bundleText(dist);
  }, 120_000);

  afterAll(() => { if (dist) rmSync(dist, { recursive: true, force: true }); });

  it('produced a bundle to inspect', () => {
    expect(built.length).toBeGreaterThan(10_000);
  });

  // The route name is the one string that would let a page ask for the code.
  it('never names a dev endpoint', () => {
    for (const route of ['dev-credentials', 'dev-signin']) {
      expect(built, `the bundle must not name ${route}`).not.toContain(route);
    }
  });

  // dev-signin mints a session token for any handle with no password at all.
  // On a real site that would be a complete authentication bypass, which is
  // exactly why it lives in a file Netlify never uploads.
  it('carries nothing that could sign a person in without a password', () => {
    for (const marker of ['instructor · @', 'signing in…', 'createSessionToken']) {
      expect(built, `bundle should not contain ${JSON.stringify(marker)}`).not.toContain(marker);
    }
  });

  it('carries none of the panel that would display it', () => {
    for (const marker of ['Local development only', 'Fill the form as the instructor',
                          'Instructor setup code'.toUpperCase()]) {
      expect(built, `bundle should not contain ${JSON.stringify(marker)}`).not.toContain(marker);
    }
  });

  // The bundle may NAME a variable -- the gate's help text tells a teacher
  // which setting to look for. It may never READ one: `process.env.X` is what
  // a bundler replaces with the value itself.
  it('reads no credential variable', () => {
    for (const name of ['INSTRUCTOR_SETUP_CODE', 'CLASS_PASSWORD', 'SESSION_SECRET',
                        'ADMIN_HANDLES']) {
      expect(built, `bundle should not read process.env.${name}`)
        .not.toContain(`process.env.${name}`);
    }
  });

  // The strongest form of the same check: whatever this machine's .env holds
  // must not appear anywhere in what the browser downloads. This is the test
  // that would catch a leak by a route nobody thought to forbid.
  it('contains no value from this machine\'s .env', () => {
    let env;
    try {
      env = readFileSync(join(ROOT, '.env'), 'utf8');
    } catch {
      return;   // No local .env (CI): the assertions above still stand.
    }

    const values = env.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, ''))
      .filter(v => v.length >= 6);

    expect(values.length, 'expected some values to check').toBeGreaterThan(0);
    for (const value of values) {
      // Never print the value, only whether it leaked.
      expect(built.includes(value), 'a .env value appears in the built bundle').toBe(false);
    }
  });
});

describe('the endpoint is not deployable', () => {
  it('lives in scripts/, which Netlify does not upload', () => {
    const dev = readFileSync(join(ROOT, 'scripts/dev-functions.mjs'), 'utf8');
    expect(dev).toContain("name === 'dev-credentials'");
    expect(dev).toContain("name === 'dev-signin'");
  });

  it('is absent from every deployed function', () => {
    const dir = join(ROOT, 'netlify/functions');
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d)) {
        const full = join(d, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (e.endsWith('.js')) files.push(full);
      }
    };
    walk(dir);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), `${f} should not serve dev-credentials`)
        .not.toContain('dev-credentials');
    }
  });

  // A deployed function may COMPARE the setup code. None may return it.
  it('returns the setup code from no deployed function', () => {
    const admin = readFileSync(join(ROOT, 'netlify/functions/utils/admin.js'), 'utf8');
    expect(admin, 'admin.js may read the code to compare it')
      .toContain('INSTRUCTOR_SETUP_CODE');
    for (const bad of ['setupCode: process.env', 'code: process.env.INSTRUCTOR_SETUP_CODE']) {
      expect(admin).not.toContain(bad);
    }
  });
});
