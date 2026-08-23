// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Regressions for the findings of the post-build third-party review.
//
// Several of these are defects in FIXES made earlier the same day. A fix that
// closes the case you thought of and leaves the one you did not is worth a test
// more than an apology.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshStore, call, get, post, register, SETUP_CODE } from './functions.helpers.js';
import { PACKS, hasPack, getPack } from '../packs/index.js';
import { compileSafe, testSafe, assertSafePattern, UnsafePatternError } from '../packages/engine/validate/safe-regex.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { runPipeline } from '../packages/engine/shell/exec.js';

let reg, ses, adm, claim, sub, hint;
beforeEach(async () => {
  freshStore();
  reg = (await import('../netlify/functions/register-handle.js')).default;
  ses = (await import('../netlify/functions/session.js')).default;
  adm = (await import('../netlify/functions/admin-overview.js')).default;
  claim = (await import('../netlify/functions/claim-instructor.js')).default;
  sub = (await import('../netlify/functions/submit-flag.js')).default;
  hint = (await import('../netlify/functions/hint.js')).default;
});

describe('instructor rights cannot be acquired by waiting', () => {
  it('a handle registered while ADMIN_HANDLES was empty never becomes an instructor', async () => {
    // The first version of this guard only asked for the setup code when the
    // handle was ALREADY listed. With the list empty — which .env.example
    // documents as supported — a student could take the teacher's handle for
    // free and be promoted the moment the teacher configured the variable.
    process.env.ADMIN_HANDLES = '';
    const squatter = await register(reg, 'profsmith');
    expect(squatter.status).toBe(200);

    process.env.ADMIN_HANDLES = 'profsmith';

    const s = await call(ses, get('/api/session', squatter.token));
    expect(s.body.isAdmin).toBe(false);
    const a = await call(adm, get('/api/admin-overview?view=answers', squatter.token));
    expect(a.status).toBe(403);
  });

  it('still refuses the listed handle without the code', async () => {
    process.env.ADMIN_HANDLES = 'profsmith';
    expect((await register(reg, 'profsmith')).status).toBe(403);
  });

  it('grants rights when the code is proved at registration', async () => {
    process.env.ADMIN_HANDLES = 'profsmith';
    const r = await register(reg, 'profsmith', { setupCode: SETUP_CODE });
    expect(r.status).toBe(200);
    expect((await call(ses, get('/api/session', r.token))).body.isAdmin).toBe(true);
  });

  it('lets a teacher who registered first claim afterwards, with the code', async () => {
    process.env.ADMIN_HANDLES = '';
    const teacher = await register(reg, 'profsmith');
    process.env.ADMIN_HANDLES = 'profsmith';

    const wrong = await call(claim, post('/api/claim-instructor', { setupCode: 'nope' }, teacher.token));
    expect(wrong.status).toBe(403);
    expect((await call(ses, get('/api/session', teacher.token))).body.isAdmin).toBe(false);

    const ok = await call(claim, post('/api/claim-instructor', { setupCode: SETUP_CODE }, teacher.token));
    expect(ok.status).toBe(200);
    expect((await call(ses, get('/api/session', teacher.token))).body.isAdmin).toBe(true);
  });

  it('refuses a claim from a handle that is not on the list', async () => {
    process.env.ADMIN_HANDLES = 'profsmith';
    const student = await register(reg, 'someone');
    const r = await call(claim, post('/api/claim-instructor', { setupCode: SETUP_CODE }, student.token));
    expect(r.status).toBe(403);
  });

  it('revokes immediately when the handle leaves ADMIN_HANDLES', async () => {
    process.env.ADMIN_HANDLES = 'profsmith';
    const t = await register(reg, 'profsmith', { setupCode: SETUP_CODE });
    expect((await call(ses, get('/api/session', t.token))).body.isAdmin).toBe(true);
    process.env.ADMIN_HANDLES = '';
    expect((await call(ses, get('/api/session', t.token))).body.isAdmin).toBe(false);
  });
});

describe('a pack id is looked up, not indexed', () => {
  it('does not resolve Object.prototype members as packs', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(hasPack(key), `${key} must not be a pack`).toBe(false);
      expect(getPack(key).id).toBe(getPack().id); // falls back to the default
    }
  });

  it('serves the manifest for a token minted with a prototype key', async () => {
    const manifest = (await import('../netlify/functions/manifest.js')).default;
    const { createSessionToken } = await import('../packages/engine/crypto-utils.js');
    const token = createSessionToken(process.env.SESSION_SECRET, 'student', 'constructor');
    const r = await call(manifest, get('/api/manifest', token));
    expect(r.status).toBe(200);
    expect(r.body.packId).toBeTruthy();
  });
});

describe('a pattern from a pack cannot pin the server', () => {
  it('refuses nested quantifiers', () => {
    for (const p of ['^(a+)+$', '(x*)*y', '(\\d+)+$', '(a|a)*$']) {
      expect(() => assertSafePattern(p), p).toThrow(UnsafePatternError);
      expect(compileSafe(p)).toBeNull();
    }
  });

  it('still compiles the patterns real challenges use', () => {
    for (const pack of Object.values(PACKS)) {
      for (const c of pack.challenges) {
        const walk = (n) => {
          if (!n || typeof n !== 'object') return;
          if (typeof n.pattern === 'string') {
            expect(compileSafe(n.pattern, n.flags || 'i'), `${c.id}: ${n.pattern}`).not.toBeNull();
          }
          (n.predicates || []).forEach(walk);
        };
        walk(c.success);
      }
    }
  });

  it('returns quickly instead of hanging on a hostile pattern', () => {
    const started = Date.now();
    const ok = evaluatePredicate(
      { predicate: 'commandMatches', pattern: '^(a+)+$' },
      { commandText: 'a'.repeat(40) + '!' }
    );
    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('caps the text any pattern is run against', () => {
    const re = compileSafe('x$');
    expect(testSafe(re, 'y'.repeat(200000) + 'x')).toBe(false);
  });
});

describe('the terminal never silently swallows a command', () => {
  const pack = PACKS['linux-fundamentals'];
  const run = (cmd) => runPipeline(cmd, '/home/student', pack.createFs('linux'), 'linux',
    { packCommands: pack.commands, packHelp: pack.help, user: 'student' });

  it('answers a malformed sed expression the way sed does', () => {
    const r = run(`sed 's/(/x/' Documents/data.csv`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sed:');
  });

  it('never throws, whatever is typed', () => {
    const nasty = [
      'echo [', 'ls [abc', '[ -f x ]', `sed 's/(/x/'`, `sed 's/[/x/'`,
      `grep '(' Documents/data.csv`, `awk '{print $'`, 'cat |', '| cat',
      '>', '>>', 'echo "unterminated', "echo 'unterminated", 'a'.repeat(5000)
    ];
    for (const cmd of nasty) {
      expect(() => run(cmd), `threw on: ${cmd}`).not.toThrow();
    }
  });
});

describe('concurrent solves', () => {
  it('does not turn a burst into 500s', async () => {
    const { token } = await register(reg, 'burst');
    const ids = PACKS['linux-fundamentals'].challenges
      .filter(c => (c.acceptedVariants || []).length > 0).slice(0, 10);
    const results = await Promise.all(ids.map(c =>
      call(sub, post('/api/submit-flag', { challengeId: c.id, commandText: c.acceptedVariants[0] }, token))
    ));
    expect(results.filter(r => r.status >= 500).length, 'no submission should 500').toBe(0);
  });
});

// Renaming the product renamed the environment variable that names the blob
// store. A site deployed under the old name holds a term of student scores, and
// reading the new name only would point that site at an empty store — the
// scores still on disk, invisible, and blamed on the upgrade.
describe('the store name survives the rename', () => {
  const KEYS = ['SHELLGROUNDS_STORE', 'GAUNTLET_STORE'];
  let saved;
  beforeEach(() => { saved = KEYS.map(k => process.env[k]); for (const k of KEYS) delete process.env[k]; });
  afterEach(() => { KEYS.forEach((k, i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }); });

  it('prefers the new variable', async () => {
    process.env.SHELLGROUNDS_STORE = 'new-name';
    process.env.GAUNTLET_STORE = 'old-name';
    const { storeName } = await import('../netlify/functions/utils/store.js');
    expect(storeName()).toBe('new-name');
  });

  it('still reads a pre-rename deployment', async () => {
    process.env.GAUNTLET_STORE = 'gauntlet-fall2026';
    const { storeName } = await import('../netlify/functions/utils/store.js');
    expect(storeName()).toBe('gauntlet-fall2026');
  });

  it('falls back to a default when neither is set', async () => {
    const { storeName } = await import('../netlify/functions/utils/store.js');
    expect(storeName()).toBe('shellgrounds-fall2026');
  });
});

// Findings from the third-party audit, pinned so they cannot come back.
describe('audit regressions: grading and pattern safety', () => {
  it('does not mark a correct answer wrong for quoting an error phrase (F3)', async () => {
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const { createLinuxFundamentalsFilesystem } =
      await import('../packs/linux-fundamentals/fs.linux.js');
    const fs = createLinuxFundamentalsFilesystem();

    // A command that SUCCEEDS but whose output contains an error phrase. The
    // grader used to reject on the phrase; it now reads the exit status.
    const good = runPipeline('echo "Permission denied"', '/home/student', fs, 'linux', {});
    expect(good.hasError, 'echo succeeded, so nothing failed').toBe(false);
    expect(good.output).toContain('Permission denied');

    // And a command that really fails is still caught.
    for (const bad of ['ls /nope', 'frobnicate', 'ssh host']) {
      expect(runPipeline(bad, '/home/student', fs, 'linux', {}).hasError, bad).toBe(true);
    }
  });

  it('grades on exit status alone, with no phrase matching left in the path (F3)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../netlify/functions/submit-flag.js', import.meta.url), 'utf8');
    // The comment explaining WHY it was removed is welcome; the code is not.
    expect(src, 'the grader must not import the phrase list').not.toMatch(/^import .*ERROR_MARKERS/m);
    expect(src, 'the grader must not grep output for English error phrases')
      .not.toContain('ERROR_MARKERS.test');
  });

  it('refuses a quantifier anywhere inside a quantified group (F2)', async () => {
    const { assertSafePattern } = await import('../packages/engine/validate/safe-regex.js');
    // All four of these were accepted before, and (a+a)+ costs two seconds
    // against forty characters -- exponentially more against fifty.
    for (const pattern of ['(a+)+', '(a+a)+', '(a+[a-z])+', '([a-z]+x)+', '(\\d+\\d)+']) {
      expect(() => assertSafePattern(pattern), pattern).toThrow();
    }
  });

  it('still accepts the patterns a real pack is written with (F2)', async () => {
    const { assertSafePattern } = await import('../packages/engine/validate/safe-regex.js');
    for (const pattern of ['^grep -c ERROR', '^ls( -[la]+)?$', '\\d{4}-\\d{2}-\\d{2}',
                           '(foo|bar)+', '^cat [a-z.]+$', '^sudo\\b']) {
      expect(() => assertSafePattern(pattern), pattern).not.toThrow();
    }
  });

  it('times a pattern as well as reading it, because the check is a heuristic (F2)', async () => {
    const { probePattern, PROBE_BUDGET_MS } = await import('../packages/engine/validate/safe-regex.js');
    const slow = probePattern(new RegExp('^(a+a)+$'));
    expect(slow.ok, 'catastrophic backtracking must be measured, not only guessed at').toBe(false);
    expect(slow.worstMs).toBeGreaterThan(PROBE_BUDGET_MS);

    for (const ok of ['^grep -c ERROR', '^[a-z]+$', '^\\d{4}-\\d{2}$']) {
      expect(probePattern(new RegExp(ok)).ok, ok).toBe(true);
    }
  });

  it('refuses to write at all when a swap cannot be made safe (F1)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../netlify/functions/utils/store.js', import.meta.url), 'utf8');
    // The old fallback returned etag:null and the callers then wrote with no
    // condition, silently becoming last-write-wins.
    expect(src).not.toContain("return { data: await s.get(key, { type: 'json' }), etag: null };");
    expect(src).toContain('getWithMetadata');
  });

  it('escapes a formula even behind leading whitespace (F6)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../netlify/functions/admin-overview.js', import.meta.url), 'utf8');
    const match = src.match(/const safe = (\/[^\/]+\/)\.test/);
    expect(match, 'csvCell should still guard the cell').toBeTruthy();
    const guard = new RegExp(match[1].slice(1, -1));
    for (const cell of ['=CMD()', ' =CMD()', '\t=CMD()', '  +1+1', '@SUM(A1)']) {
      expect(guard.test(cell), JSON.stringify(cell)).toBe(true);
    }
    for (const cell of ['ada_1', 'Night Shift', '2026-08-23']) {
      expect(guard.test(cell), JSON.stringify(cell)).toBe(false);
    }
  });
});
