// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Regressions for the findings of the post-build third-party review.
//
// Several of these are defects in FIXES made earlier the same day. A fix that
// closes the case you thought of and leaves the one you did not is worth a test
// more than an apology.

import { describe, it, expect, beforeEach } from 'vitest';
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
