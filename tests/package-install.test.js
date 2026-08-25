// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// "Install it, then use it" has to be two commands that are both true.
//
// This was one bug wearing two halves, and each half hid the other:
//
//   packs/forensics-cli-101/commands.js asked
//     context.installedPackages?.has('evtrace') || true
//   which is a constant. The refusal below it could never run, so evtrace
//   worked whether or not the student had installed anything.
//
//   src/App.jsx never called setInstalledPackages. runPipeline has returned
//   `installedPackage` since it was written and nothing read it, so the Set
//   stayed empty for a whole session.
//
// Fixing either one alone breaks the challenge: a real guard with no persisted
// install refuses forever, and a persisted install with a constant guard
// changes nothing. Both are asserted here for that reason.
//
// Found by a linter, of all things — `no-unused-vars` noticed the setter was
// dead, and the dead setter is what led to the constant.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PACKS } from '../packs/index.js';
import { runPipeline } from '../packages/engine/shell/exec.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const pack = PACKS['forensics-cli-101'];
const base = { packCommands: pack.commands, packHelp: pack.help, user: pack.manifest.linux.user };
const HOME = pack.manifest.linux.home;

const run = (line, installed) =>
  runPipeline(line, HOME, pack.createFs('linux'), 'linux', { ...base, installedPackages: installed });

describe('a pack tool that must be installed', () => {
  it('refuses before it is installed', () => {
    const res = run('evtrace -a', new Set());
    expect(res.status).not.toBe(0);
    expect(res.output).toMatch(/command not found/);
  });

  it('runs once it is installed', () => {
    const res = run('evtrace -a', new Set(['evtrace']));
    expect(res.status).toBe(0);
    expect(res.output).toMatch(/evtrace .* initialised/);
  });

  // The guard has to depend on the Set. A constant passes both tests above
  // only by accident of which one you write first, so assert the shape too.
  it('has a guard that can actually fail', () => {
    const src = fs.readFileSync(path.join(ROOT, 'packs/forensics-cli-101/commands.js'), 'utf8');
    expect(src).not.toMatch(/installedPackages\?\.has\([^)]*\)\s*\|\|\s*true/);
  });
});

describe('an install survives to the next command line', () => {
  it('runPipeline reports what was installed', () => {
    const res = run('sudo apt-get install evtrace -y', new Set());
    expect(res.installedPackage).toBe('evtrace');
  });

  // Without this the first test in this file is the student's whole experience:
  // they install correctly, and the tool still refuses them.
  it('the browser carries that report into the next command', () => {
    const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    expect(app).toMatch(/res\.installedPackage/);
    expect(app).toMatch(/setInstalledPackages\(/);
  });

  it('end to end: refused, installed, accepted', () => {
    let installed = new Set();
    expect(run('evtrace -a', installed).status).not.toBe(0);

    const install = run('sudo apt-get install evtrace -y', installed);
    if (install.installedPackage) installed = new Set(installed).add(install.installedPackage);

    expect(run('evtrace -a', installed).status).toBe(0);
  });
});
