// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The single-file pack format: round-trip fidelity, the no-code guard, and the
// validator categories added alongside it.
//
// The round-trip tests are the load-bearing ones. A pack exchange is only
// trustworthy if a pack that goes out and comes back is the SAME pack — not
// nearly, not visually. So these compare the whole flat filesystem node by node
// and field by field, not a summary of it.

import { readFileSync } from 'node:fs';
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PACKS } from '../packs/index.js';
import { validatePack, checkGlobalChallengeIds } from '../packages/engine/validate/packValidator.js';
import {
  serializePack, loadPackFile, parsePackFile, expandFilesystem, collapseFilesystem,
  validatePackFileStructure, assertNoCode, stripComments, modeToString, modeToNumber,
  PackFormatError, PACK_FORMAT_VERSION
} from '../packages/engine/validate/packFile.js';
import { loadPackDirectory } from '../packages/engine/validate/packSource.js';
import { exportPack } from '../scripts/pack-export.mjs';
import { importPack } from '../scripts/pack-import.mjs';
import { scaffoldPack } from '../scripts/pack-scaffold.mjs';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';

const tempDirs = [];
async function tmp(prefix) {
  const d = await mkdtemp(join(tmpdir(), `shellgrounds-${prefix}-`));
  tempDirs.push(d);
  return d;
}
afterAll(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true });
});

/**
 * Order-independent deep comparison. A key whose value is `undefined` and a
 * missing key are the same thing here, because that is exactly what a trip
 * through JSON does to `attrib: undefined` on a Linux directory node.
 */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] === undefined) continue;
      out[k] = canon(value[k]);
    }
    return out;
  }
  return value;
}
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** A minimal pack file that is valid, used as the base for the negative tests. */
function minimalPackFile(overrides = {}) {
  return {
    formatVersion: PACK_FORMAT_VERSION,
    kind: 'shellgrounds-pack',
    id: 'test-pack',
    manifest: {
      id: 'test-pack',
      name: 'Test Pack',
      version: '1.0.0',
      platforms: ['linux'],
      linux: { home: '/home/student', user: 'student', host: 'sandbox', shell: 'bash' }
    },
    acts: [{ id: 1, name: 'Act I', unlockThreshold: 0 }],
    badges: [{ id: 'b1', name: 'Badge', act: 1 }],
    challenges: [{
      id: 'tp-1-ls',
      act: 1,
      title: 'List',
      points: 10,
      brief: 'Run `ls`.',
      setup: { cwd: '/home/student' },
      success: { predicate: 'outputContains', text: 'hello.txt' },
      hints: [{ cost: 0, text: 'Type `ls`.' }],
      teaches: ['ls'],
      acceptedVariants: ['ls']
    }],
    help: {},
    commands: {},
    filesystems: {
      linux: {
        platform: 'linux',
        root: '/',
        defaults: { owner: 'student', group: 'student', fileMode: '0644', dirMode: '0755', mtime: '2026-08-17T09:30:00.000Z' },
        tree: {
          home: {
            type: 'dir',
            children: {
              student: {
                type: 'dir',
                children: { 'hello.txt': { type: 'file', content: 'hello\n' } }
              }
            }
          }
        }
      }
    },
    ...overrides
  };
}

// ───────────────────────────────────────────────────────────────────────────
describe('round trip: every shipped pack survives export and import unchanged', () => {
  for (const [packId, pack] of Object.entries(PACKS)) {
    it(`${packId}: in-memory export -> load is byte-identical`, () => {
      const { file } = serializePack({ ...pack, id: packId });
      // Through real JSON, so anything JSON cannot carry is caught here.
      const reloaded = loadPackFile(JSON.parse(JSON.stringify(file)));

      expect(reloaded.id).toBe(packId);
      expect(same(reloaded.challenges, pack.challenges)).toBe(true);
      expect(reloaded.challenges.map(c => c.id)).toEqual(pack.challenges.map(c => c.id));
      expect(same(reloaded.manifest.acts, pack.manifest.acts)).toBe(true);
      expect(same(reloaded.manifest.badges, pack.manifest.badges)).toBe(true);
      expect(same(reloaded.manifest, pack.manifest)).toBe(true);

      for (const platform of pack.manifest.platforms) {
        const original = pack.createFs(platform);
        const rebuilt = reloaded.createFs(platform);
        expect(Object.keys(rebuilt).sort()).toEqual(Object.keys(original).sort());
        for (const key of Object.keys(original)) {
          expect(
            same(rebuilt[key], original[key]),
            `${packId}/${platform} node ${key} differs:\n  was ${JSON.stringify(canon(original[key]))}\n  now ${JSON.stringify(canon(rebuilt[key]))}`
          ).toBe(true);
        }
      }
    });

    it(`${packId}: export to disk -> import to a directory -> load is identical`, async () => {
      const dir = await tmp(`rt-${packId}`);
      const filePath = join(dir, `${packId}.pack.json`);
      await exportPack(packId, filePath);

      // Prove the file on disk is JSON with no executable anything in it.
      const text = await readFile(filePath, 'utf8');
      const raw = JSON.parse(text);
      expect(() => assertNoCode(raw)).not.toThrow();

      const { outDir } = await importPack(filePath, join(dir, 'out'));
      const roundTripped = await loadPackDirectory(outDir);
      // No JavaScript was executed to build this filesystem: the directory the
      // importer wrote carries fs.<platform>.json, so loadPackDirectory takes
      // the data path and reports no warning about running author code.
      expect(roundTripped.warnings).toEqual([]);

      expect(same(roundTripped.challenges, pack.challenges)).toBe(true);
      for (const platform of pack.manifest.platforms) {
        expect(same(roundTripped.createFs(platform), pack.createFs(platform))).toBe(true);
      }
    });
  }
});

describe('round trip: the flat filesystem and the nested tree are inverses', () => {
  for (const [packId, pack] of Object.entries(PACKS)) {
    for (const platform of pack.manifest.platforms) {
      it(`${packId}/${platform}: collapse -> expand restores every node`, () => {
        const original = pack.createFs(platform);
        const isWindows = platform === 'windows';
        const spec = collapseFilesystem(original, { isWindows });
        const rebuilt = expandFilesystem(JSON.parse(JSON.stringify(spec)), { isWindows });
        expect(same(rebuilt, original)).toBe(true);
        // A directory's contents list must keep its order, or `ls` output and
        // therefore every outputEquals challenge changes on round trip.
        for (const [key, node] of Object.entries(original)) {
          if (node.type === 'dir') expect(rebuilt[key].contents).toEqual(node.contents);
        }
      });
    }
  }

  it('keeps directory order even when a file name looks like an array index', () => {
    const spec = {
      platform: 'linux',
      root: '/',
      tree: {
        data: {
          type: 'dir',
          children: {
            'zebra.txt': { type: 'file', content: 'z' },
            2026: { type: 'file', content: 'y' },
            1: { type: 'file', content: 'x' }
          },
          order: ['zebra.txt', '2026', '1']
        }
      }
    };
    const fs = expandFilesystem(spec, { isWindows: false });
    expect(fs['/data'].contents).toEqual(['zebra.txt', '2026', '1']);
    const back = expandFilesystem(
      JSON.parse(JSON.stringify(collapseFilesystem(fs, { isWindows: false }))),
      { isWindows: false }
    );
    expect(back['/data'].contents).toEqual(['zebra.txt', '2026', '1']);
  });

  it('recomputes size and hashes from content, so an edited file is never stale', () => {
    const fs = expandFilesystem({
      platform: 'linux', root: '/',
      tree: { note: { type: 'file', content: 'edited by hand\n' } }
    }, { isWindows: false });
    expect(fs['/note'].size).toBe('edited by hand\n'.length);
    expect(fs['/note'].md5).toMatch(/^[0-9a-f]{32}$/);
    expect(fs['/note'].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a path separator inside a node name', () => {
    expect(() => expandFilesystem({
      platform: 'linux', root: '/',
      tree: { 'a/b': { type: 'file', content: '' } }
    }, { isWindows: false })).toThrow(/path separator/);
  });

  it('reads modes as octal strings the way chmod writes them', () => {
    expect(modeToNumber('0600', 0o644)).toBe(0o600);
    expect(modeToNumber('1777', 0o755)).toBe(0o1777);
    expect(modeToString(0o400)).toBe('0400');
    const fs = expandFilesystem({
      platform: 'linux', root: '/',
      tree: { secret: { type: 'file', content: 'x', mode: '0400', owner: 'root' } }
    }, { isWindows: false });
    expect(fs['/secret'].mode).toBe(0o400);
    expect(fs['/secret'].owner).toBe('root');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the no-code guard', () => {
  it('rejects a function anywhere in the pack file, and says where', () => {
    const bad = minimalPackFile();
    bad.filesystems.linux.tree.home.children.student.children['evil.txt'] = {
      type: 'file',
      get content() { return 'pwned'; }
    };
    expect(() => assertNoCode(bad)).toThrow(PackFormatError);
    expect(() => assertNoCode(bad)).toThrow(/accessor/);

    const bad2 = minimalPackFile();
    bad2.challenges[0].success = { predicate: 'js', fn: () => true };
    expect(() => assertNoCode(bad2)).toThrow(/contains a function/);
  });

  it('rejects the js predicate even with no function attached', () => {
    const bad = minimalPackFile();
    bad.challenges[0].success = { predicate: 'js', check: 'not actually a function' };
    expect(() => loadPackFile(bad)).toThrow(/'js' predicate/);
  });

  it('rejects __proto__, the prototype-pollution vector JSON.parse really does create', () => {
    const raw = JSON.parse('{"formatVersion":1,"id":"x","__proto__":{"polluted":true}}');
    expect(() => assertNoCode(raw)).toThrow(/__proto__/);
    // And through the text entry point, which is the one an importer uses.
    expect(() => parsePackFile('{"__proto__":{"polluted":true}}')).toThrow(/__proto__/);
    expect({}.polluted).toBeUndefined();
  });

  it('the engine has no predicate that runs a function at all', () => {
    // This used to assert that the js predicate was refused for untrusted packs
    // and honoured for trusted ones — a hole with two guards on it. The
    // predicate has been removed: nothing among the 104 challenges used it, and
    // it was the single field that could have run a pack author's own code.
    //
    // No level of declared trust brings it back. A pack cannot execute.
    const spy = { called: false };
    const cfg = { predicate: 'js', fn: () => { spy.called = true; return true; } };
    expect(evaluatePredicate(cfg, { trusted: false })).toBe(false);
    expect(evaluatePredicate(cfg, { trusted: true })).toBe(false);
    expect(evaluatePredicate({ kind: 'js', check: () => { spy.called = true; return true; } },
      { trusted: true })).toBe(false);
    expect(spy.called, 'a pack-supplied function was invoked').toBe(false);
  });

  it('lists no predicate whose value is executable', () => {
    // A structural guard, so re-introducing an escape hatch has to be deliberate.
    const src = readFileSync(new URL('../packages/engine/validate/predicates.js', import.meta.url), 'utf8');
    for (const forbidden of ['predicateConfig.fn(', 'predicateConfig.check(', 'new Function', 'eval(']) {
      expect(src, `predicates.js should not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('marks a pack loaded from a file as untrusted', () => {
    const pack = loadPackFile(minimalPackFile());
    expect(pack.trusted).toBe(false);
  });

  it('refuses a file that nests deeper than the guard will walk', () => {
    let deep = { end: true };
    for (let i = 0; i < 80; i++) deep = { next: deep };
    expect(() => assertNoCode(deep)).toThrow(/nests deeper/);
  });
});

describe('comments', () => {
  it('drops any key starting with // and keeps everything else', () => {
    const cleaned = stripComments({
      '//': 'a note', '// id': 'another note', id: 'keep-me',
      nested: { '//': 'note', value: 1 },
      list: [{ '//': 'note', n: 2 }]
    });
    expect(cleaned).toEqual({ id: 'keep-me', nested: { value: 1 }, list: [{ n: 2 }] });
  });

  it('cannot swallow a file, because a file name can never contain a slash', () => {
    const fs = expandFilesystem({
      platform: 'linux', root: '/',
      '//': 'this comment is dropped',
      tree: {
        '_private.txt': { type: 'file', content: 'leading underscores are legal file names\n' },
        '.hidden': { type: 'file', content: 'so are leading dots\n', hidden: true }
      }
    }, { isWindows: false });
    expect(Object.keys(fs).sort()).toEqual(['/', '/.hidden', '/_private.txt']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('format version', () => {
  it('accepts the current version', () => {
    const { errors } = validatePackFileStructure(minimalPackFile());
    expect(errors).toEqual([]);
  });

  it('rejects a file with no formatVersion', () => {
    const f = minimalPackFile();
    delete f.formatVersion;
    expect(validatePackFileStructure(f).errors.join(' ')).toMatch(/no "formatVersion"/);
  });

  it('rejects a version from the future and names both numbers', () => {
    const f = minimalPackFile({ formatVersion: PACK_FORMAT_VERSION + 7 });
    const msg = validatePackFileStructure(f).errors.join(' ');
    expect(msg).toMatch(new RegExp(`formatVersion ${PACK_FORMAT_VERSION + 7}`));
    expect(msg).toMatch(new RegExp(`reads up to ${PACK_FORMAT_VERSION}`));
  });

  it('rejects a version that is not a whole number', () => {
    expect(validatePackFileStructure(minimalPackFile({ formatVersion: '1.0' })).errors.join(' '))
      .toMatch(/whole number/);
    expect(validatePackFileStructure(minimalPackFile({ formatVersion: 0 })).errors.join(' '))
      .toMatch(/whole number/);
  });

  it('rejects the wrong kind', () => {
    expect(validatePackFileStructure(minimalPackFile({ kind: 'something-else' })).errors.join(' '))
      .toMatch(/expected "shellgrounds-pack"/);
  });

  // The project was called The Gauntlet before it was called Shellgrounds. A
  // teacher who exported a course under the old name still owns that file, and
  // it is still a valid pack. Renaming the product must not strand it.
  it('still accepts a file exported under the former product name', () => {
    const legacy = minimalPackFile({ kind: 'gauntlet-pack' });
    expect(validatePackFileStructure(legacy).errors).toEqual([]);
    expect(loadPackFile(legacy).id).toBe(loadPackFile(minimalPackFile()).id);
  });

  it('is reported by the validator for a pack that came from a file', async () => {
    const pack = loadPackFile(minimalPackFile());
    const good = await validatePack(pack, { packFile: minimalPackFile() });
    expect(good.checks.packFormat.checked).toBe(true);
    expect(good.checks.packFormat.pass).toBe(true);
    expect(good.checks.packFormat.formatVersion).toBe(PACK_FORMAT_VERSION);

    const bad = await validatePack(pack, { packFile: minimalPackFile({ formatVersion: 99 }) });
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/formatVersion 99/);
  });

  it('is not reported for a directory pack, so the check cannot pass vacuously', async () => {
    const r = await validatePack({ trusted: true, ...PACKS['linux-fundamentals'] });
    expect(r.checks.packFormat.checked).toBe(false);
  });
});

describe('structural validation catches broken pack files', () => {
  const err = (f) => validatePackFileStructure(f).errors.join(' | ');

  it('catches two challenges with the same id', () => {
    const f = minimalPackFile();
    f.challenges.push({ ...f.challenges[0] });
    expect(err(f)).toMatch(/Two challenges share id 'tp-1-ls'/);
  });

  it('catches a challenge in an act that does not exist', () => {
    const f = minimalPackFile();
    f.challenges[0].act = 9;
    expect(err(f)).toMatch(/act 9, but no act has that id/);
  });

  it('catches a badge awarded for an act that does not exist', () => {
    const f = minimalPackFile();
    f.badges[0].act = 4;
    expect(err(f)).toMatch(/awarded for act 4/);
  });

  it('catches a platform with no filesystem', () => {
    const f = minimalPackFile();
    f.manifest.platforms = ['linux', 'windows'];
    expect(err(f)).toMatch(/no filesystems\.windows/);
  });

  it('catches an unlockThreshold outside 0..1', () => {
    const f = minimalPackFile();
    f.acts[0].unlockThreshold = 80;
    expect(err(f)).toMatch(/from 0 to 1/);
  });

  it('catches a missing success condition and a hint with no cost', () => {
    const f = minimalPackFile();
    delete f.challenges[0].success;
    f.challenges[0].hints = [{ text: 'no cost here' }];
    expect(err(f)).toMatch(/no "success" condition/);
    expect(err(f)).toMatch(/hint with no "cost"/);
  });

  it('catches a pack id that is not a safe slug', () => {
    expect(err(minimalPackFile({ id: 'My Pack!' }))).toMatch(/lower-case letters/);
  });

  it('refuses to import an invalid pack file rather than writing half of it', async () => {
    const dir = await tmp('bad-import');
    const path = join(dir, 'bad.pack.json');
    const f = minimalPackFile();
    delete f.formatVersion;
    await writeFile(path, JSON.stringify(f), 'utf8');
    await expect(importPack(path, join(dir, 'out'))).rejects.toThrow(/formatVersion/);
  });

  it('refuses to overwrite an existing directory without --force', async () => {
    const dir = await tmp('overwrite');
    const path = join(dir, 'ok.pack.json');
    await writeFile(path, JSON.stringify(minimalPackFile()), 'utf8');
    const out = join(dir, 'out');
    await mkdir(out, { recursive: true });
    await expect(importPack(path, out)).rejects.toThrow(/already exists/);
    await expect(importPack(path, out, { force: true })).resolves.toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('validator: challenge ids are unique across every pack', () => {
  it('passes for the packs that ship today', () => {
    const r = checkGlobalChallengeIds(Object.values(PACKS));
    expect(r.pass).toBe(true);
    expect(r.collisions).toEqual([]);
    expect(r.totalIds).toBe(Object.values(PACKS).reduce((n, p) => n + p.challenges.length, 0));
  });

  it('catches a collision between two packs and names both', () => {
    const a = { id: 'pack-a', challenges: [{ id: 'shared-id' }, { id: 'a-only' }] };
    const b = { id: 'pack-b', challenges: [{ id: 'shared-id' }] };
    const r = checkGlobalChallengeIds([a, b]);
    expect(r.pass).toBe(false);
    expect(r.collisions.join(' ')).toMatch(/'shared-id'/);
    expect(r.collisions.join(' ')).toMatch(/pack-a/);
    expect(r.collisions.join(' ')).toMatch(/pack-b/);
  });

  it('catches a duplicate inside one pack, and a challenge with no id', () => {
    const r = checkGlobalChallengeIds([
      { id: 'p', challenges: [{ id: 'x' }, { id: 'x' }, { title: 'nameless' }] }
    ]);
    expect(r.pass).toBe(false);
    expect(r.collisions.join(' ')).toMatch(/uses the challenge id 'x' twice/);
    expect(r.collisions.join(' ')).toMatch(/no id/);
  });

  it('catches a real collision if a shipped pack id were reused', () => {
    const lf = PACKS['linux-fundamentals'];
    const clash = { id: 'someone-elses-pack', challenges: [{ id: lf.challenges[0].id }] };
    expect(checkGlobalChallengeIds([lf, clash]).pass).toBe(false);
  });
});

describe('validator: keystroke-only challenges are counted, not buried', () => {
  it('flags a challenge that checks only commandMatches', async () => {
    const pack = loadPackFile(minimalPackFile());
    pack.challenges[0].success = { predicate: 'commandMatches', pattern: '^ls$' };
    const r = await validatePack(pack);
    expect(r.checks.outputAssertions.blind).toBe(1);
    expect(r.checks.outputAssertions.pass).toBe(false);
    expect(r.outputBlind[0].id).toBe('tp-1-ls');
    // Named, counted — but it does not make the pack invalid.
    expect(r.valid).toBe(true);
  });

  it('does not flag a challenge that also asserts on output or state', async () => {
    const pack = loadPackFile(minimalPackFile());
    pack.challenges[0].success = {
      predicate: 'allOf',
      predicates: [
        { predicate: 'commandMatches', pattern: '^ls' },
        { predicate: 'outputContains', text: 'hello.txt' }
      ]
    };
    const r = await validatePack(pack);
    expect(r.checks.outputAssertions.blind).toBe(0);
    expect(r.checks.outputAssertions.pass).toBe(true);
  });

  it('does not flag a flag challenge, which is scored on what the student submits', async () => {
    const pack = loadPackFile(minimalPackFile());
    pack.challenges[0].success = { kind: 'flag' };
    pack.challenges[0].brief = 'Find the flag.';
    const r = await validatePack(pack);
    expect(r.checks.outputAssertions.blind).toBe(0);
  });

  it('finds none left in any shipped pack', async () => {
    // This began life asserting the count was above zero, because 60 of the 97
    // challenges graded keystrokes and the number was the point. They have all
    // been converted, so the assertion is inverted: shipped content must assert
    // on what the terminal produced, and a regression here is a real one.
    const offenders = [];
    for (const [id, pack] of Object.entries(PACKS)) {
      const r = await validatePack({ trusted: true, ...pack, id });
      expect(r.checks.outputAssertions.checked).toBe(pack.challenges.length);
      expect(r.outputBlind.length).toBe(r.checks.outputAssertions.blind);
      offenders.push(...r.outputBlind.map(c => `${id}/${c.id ?? c}`));
    }
    expect(offenders,
      'these challenges check the typed command and nothing else').toEqual([]);
  });
});

describe('validator: an accepted variant that does not work is its own category', () => {
  it('records a broken variant with a reason, and keeps the run green', async () => {
    const pack = loadPackFile(minimalPackFile());
    pack.challenges[0].acceptedVariants = ['ls', 'ls --this-flag-does-not-exist'];
    const r = await validatePack(pack);
    expect(r.checks.acceptedVariants.tested).toBe(2);
    expect(r.checks.acceptedVariants.failed).toBe(1);
    expect(r.checks.acceptedVariants.pass).toBe(false);
    expect(r.variantFailures[0].variant).toBe('ls --this-flag-does-not-exist');
    expect(r.variantFailures[0].reason).toBeTruthy();
    // Reported, not thrown: the run stays green and the count is prominent.
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('distinguishes "the command failed" from "the checker did not accept it"', async () => {
    const pack = loadPackFile(minimalPackFile());
    pack.challenges[0].acceptedVariants = ['ls', 'cat /no/such/file', 'pwd'];
    const r = await validatePack(pack);
    const byVariant = Object.fromEntries(r.variantFailures.map(f => [f.variant, f.reason]));
    expect(byVariant['cat /no/such/file']).toMatch(/the command itself failed/);
    expect(byVariant.pwd).toMatch(/success condition did not accept it/);
  });

  it('holds only declared variants to the bar, not a command scraped from the brief', async () => {
    const pack = loadPackFile(minimalPackFile());
    delete pack.challenges[0].acceptedVariants;
    pack.challenges[0].brief = 'Run `ls` to see the files.';
    const r = await validatePack(pack);
    expect(r.checks.acceptedVariants.tested).toBe(0);
    expect(r.checks.acceptedVariants.failed).toBe(0);
    expect(r.checks.solvability.solved).toBe(1);
  });

  it('reports the real count for every shipped pack', async () => {
    for (const [id, pack] of Object.entries(PACKS)) {
      const r = await validatePack({ trusted: true, ...pack, id });
      expect(r.variantFailures.length).toBe(r.checks.acceptedVariants.failed);
      for (const f of r.variantFailures) {
        expect(pack.challenges.find(c => c.id === f.id).acceptedVariants).toContain(f.variant);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('shellgrounds new: the scaffold is a working pack, not a template', () => {
  it('scaffolds a pack that validates with no errors and no findings', async () => {
    const dir = await tmp('scaffold');
    const { outDir, idPrefix } = await scaffoldPack('demo-course', join(dir, 'demo-course'));
    const pack = await loadPackDirectory(outDir);

    // Data, not code: the scaffold ships fs.linux.json, so loading it executed
    // nothing the author wrote.
    expect(pack.warnings).toEqual([]);

    const r = await validatePack(pack);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.checks.solvability.solved).toBe(r.checks.solvability.total);
    // A starter pack must not model the habits the validator complains about.
    expect(r.checks.acceptedVariants.failed).toBe(0);
    expect(r.checks.outputAssertions.blind).toBe(0);
    expect(r.warnings).toEqual([]);

    // Its challenge ids do not collide with anything already shipping.
    expect(checkGlobalChallengeIds([...Object.values(PACKS), pack]).pass).toBe(true);
    expect(pack.challenges.every(c => c.id.startsWith(`${idPrefix}-`))).toBe(true);
  });

  it('scaffolds a pack that exports and re-imports unchanged', async () => {
    const dir = await tmp('scaffold-rt');
    const { outDir } = await scaffoldPack('demo-course', join(dir, 'src'));
    const original = await loadPackDirectory(outDir);
    const filePath = join(dir, 'demo.pack.json');
    await exportPack(outDir, filePath);
    const reloaded = parsePackFile(await readFile(filePath, 'utf8'));
    expect(same(reloaded.challenges, original.challenges)).toBe(true);
    expect(same(reloaded.createFs('linux'), original.createFs('linux'))).toBe(true);
  });

  it('refuses a pack id that is not a safe slug', async () => {
    const dir = await tmp('scaffold-bad');
    await expect(scaffoldPack('Not A Slug', join(dir, 'x'))).rejects.toThrow(/lower-case letters/);
  });
});

describe('export records what it could not convert instead of losing it', () => {
  it('flags a JavaScript pack command and keeps its man page', () => {
    const pack = PACKS['forensics-cli-101'];
    const { file, unconvertible } = serializePack({ ...pack, id: 'forensics-cli-101' });
    expect(unconvertible.length).toBeGreaterThan(0);
    for (const name of unconvertible) {
      expect(file.commands[name].unconvertible).toBe(true);
      // The name and the man page survive so the author knows what to rebuild.
      expect(file.commands[name].usage).toBeTruthy();
    }
    // And the loader does not resurrect them as silent no-ops.
    const loaded = loadPackFile(JSON.parse(JSON.stringify(file)));
    for (const name of unconvertible) expect(loaded.commands[name]).toBeUndefined();
    expect(validatePackFileStructure(file).warnings.join(' ')).toMatch(/unconvertible/);
  });

  it('carries a declarative command through unchanged and runs it without eval', () => {
    const f = minimalPackFile();
    f.commands = {
      sensorcheck: {
        platforms: ['linux'],
        usage: 'sensorcheck',
        stdout: 'ALL SENSORS NOMINAL\n',
        byArgs: [{ args: '-v', stdout: 'verbose sensor dump\n', status: 0 }]
      }
    };
    const pack = loadPackFile(f);
    expect(pack.commands.sensorcheck.run({ args: [] }).stdout).toBe('ALL SENSORS NOMINAL\n');
    expect(pack.commands.sensorcheck.run({ args: ['-v'] }).stdout).toBe('verbose sensor dump\n');
  });
});
