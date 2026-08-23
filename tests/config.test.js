// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The live pack setting: /api/config and the handlers that obey it.
//
// ENABLED_PACKS was build-time only, so a teacher had to trigger a deploy to
// change which courses their class could see. That is fine for a variable in a
// dashboard and useless for a toggle in a screen. The setting now lives in a
// record an instructor writes, and the environment variable only seeds a site
// nobody has configured.
//
// The assertions that matter most are the ones about what a toggle must NOT
// do: it must not let a student be graded on a switched-off pack, it must not
// erase anything, and it must not be reachable by a student.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshStore, call, get, post, register, readStore, SETUP_CODE } from './functions.helpers.js';
import { PACKS, DEFAULT_PACK_ID } from '../packs/index.js';

const ALL = Object.keys(PACKS);
const OTHER = ALL.find(id => id !== DEFAULT_PACK_ID);

let reg, ses, sub, board, cfg;
let savedEnv;

beforeEach(async () => {
  savedEnv = process.env.ENABLED_PACKS;
  delete process.env.ENABLED_PACKS;
  freshStore();
  reg = (await import('../netlify/functions/register-handle.js')).default;
  ses = (await import('../netlify/functions/session.js')).default;
  sub = (await import('../netlify/functions/submit-flag.js')).default;
  board = (await import('../netlify/functions/leaderboard.js')).default;
  cfg = (await import('../netlify/functions/config.js')).default;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.ENABLED_PACKS;
  else process.env.ENABLED_PACKS = savedEnv;
});

/** Registers the handle named in ADMIN_HANDLES and proves the setup code. */
async function instructor() {
  const { token } = await register(reg, 'profsmith', { setupCode: SETUP_CODE });
  return token;
}

describe('reading the setting', () => {
  it('reports an unconfigured site, so the screen can open on setup', async () => {
    const { token } = await register(reg, 'student1');
    const { status, body } = await call(cfg, get('/api/config', token));
    expect(status).toBe(200);
    expect(body.configured).toBe(false);
    expect(body.source).toBe('environment');
    expect(body.enabledPacks).toEqual(ALL);
  });

  it('describes every pack, so the screen can draw the list', async () => {
    const { token } = await register(reg, 'student2');
    const { body } = await call(cfg, get('/api/config', token));
    expect(body.packs.map(p => p.id).sort()).toEqual([...ALL].sort());
    const one = body.packs.find(p => p.id === DEFAULT_PACK_ID);
    expect(one.challenges).toBe(PACKS[DEFAULT_PACK_ID].challenges.length);
    expect(one.name).toBe(PACKS[DEFAULT_PACK_ID].manifest.name);
  });

  it('needs a session', async () => {
    const { status } = await call(cfg, get('/api/config'));
    expect(status).toBe(401);
  });
});

describe('writing the setting', () => {
  it('is refused for a student', async () => {
    const { token } = await register(reg, 'student3');
    const { status, body } = await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    expect(status).toBe(403);
    expect(body.error).toMatch(/instructor/i);
  });

  // Being listed in ADMIN_HANDLES is necessary and never sufficient. The guard
  // sits earlier than this endpoint: a reserved handle cannot be claimed at
  // all without the setup code, so a student who tries the teacher's name
  // never reaches a token, let alone this screen.
  it('cannot be reached by claiming a listed handle without the setup code', async () => {
    const attempt = await register(reg, 'profsmith');     // no setupCode
    expect(attempt.status).toBe(403);
    expect(attempt.token).toBeUndefined();

    const { status } = await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, attempt.token));
    expect(status, 'no token, so not even identified').toBe(401);
  });

  it('is accepted for an instructor, and takes effect at once', async () => {
    const token = await instructor();
    const { status, body } = await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    expect(status).toBe(200);
    expect(body.enabledPacks).toEqual([OTHER]);
    expect(body.configured).toBe(true);

    const after = await call(cfg, get('/api/config', token));
    expect(after.body.enabledPacks).toEqual([OTHER]);
    expect(after.body.source).toBe('settings');
  });

  it('records who changed it and when', async () => {
    const token = await instructor();
    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    const settings = readStore()['config/settings'];
    expect(settings.updatedBy).toBe('profsmith');
    expect(Date.parse(settings.updatedAt)).not.toBeNaN();
  });

  // A site offering nothing shows students an empty page, and the teacher who
  // did it has no obvious way back. Refuse it where it happens.
  it('refuses to switch off the last pack', async () => {
    const token = await instructor();
    const { status, body } = await call(cfg, post('/api/config', { enabledPacks: [] }, token));
    expect(status).toBe(400);
    expect(body.error).toMatch(/at least one/i);
  });

  it('refuses a pack that does not exist', async () => {
    const token = await instructor();
    const { status, body } = await call(cfg, post('/api/config', { enabledPacks: ['made-up'] }, token));
    expect(status).toBe(400);
    expect(body.error).toMatch(/no pack called/i);
  });

  it('refuses anything that is not a list of ids', async () => {
    const token = await instructor();
    for (const bad of [null, 'linux-fundamentals', { id: 1 }, [1, 2]]) {
      const { status } = await call(cfg, post('/api/config', { enabledPacks: bad }, token));
      expect(status, `should refuse ${JSON.stringify(bad)}`).toBe(400);
    }
  });
});

describe('the saved setting beats the deploy-time one', () => {
  it('overrides ENABLED_PACKS once an instructor has saved', async () => {
    process.env.ENABLED_PACKS = DEFAULT_PACK_ID;
    const token = await instructor();

    const before = await call(cfg, get('/api/config', token));
    expect(before.body.enabledPacks).toEqual([DEFAULT_PACK_ID]);

    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));

    const after = await call(cfg, get('/api/config', token));
    expect(after.body.enabledPacks).toEqual([OTHER]);
  });

  it('stops grading a challenge from a pack that was just switched off', async () => {
    const token = await instructor();
    const target = PACKS[DEFAULT_PACK_ID].challenges
      .find(c => (c.acceptedVariants || []).length > 0);

    const allowed = await call(sub, post('/api/submit-flag',
      { challengeId: target.id, commandText: target.acceptedVariants[0] }, token));
    expect(allowed.status, 'gradable while switched on').toBe(200);

    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));

    const refused = await call(sub, post('/api/submit-flag',
      { challengeId: target.id, commandText: target.acceptedVariants[0] }, token));
    expect(refused.status).toBe(404);
  });

  it('hides the leaderboard of a pack that was switched off', async () => {
    const token = await instructor();
    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    const { status } = await call(board, get(`/api/leaderboard?packId=${DEFAULT_PACK_ID}`, token));
    expect(status).toBe(404);
  });

  // The screen tells a teacher that nothing is deleted. That promise is the
  // reason they will feel free to experiment with the toggle, so it is worth a
  // test rather than only a sentence.
  it('keeps every solve, and gives them back when the pack returns', async () => {
    const token = await instructor();
    const target = PACKS[DEFAULT_PACK_ID].challenges
      .find(c => (c.acceptedVariants || []).length > 0);

    await call(sub, post('/api/submit-flag',
      { challengeId: target.id, commandText: target.acceptedVariants[0] }, token));

    const scoreOf = async () => {
      const { body } = await call(ses, get('/api/session', token));
      return (body.solves || []).filter(s => s.challengeId === target.id).length;
    };
    expect(await scoreOf()).toBe(1);

    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    expect(await scoreOf(), 'the record is kept while the pack is off').toBe(1);

    await call(cfg, post('/api/config', { enabledPacks: ALL }, token));
    expect(await scoreOf(), 'and is still there when it comes back').toBe(1);

    const regraded = await call(sub, post('/api/submit-flag',
      { challengeId: target.id, commandText: target.acceptedVariants[0] }, token));
    expect(regraded.body.alreadySolved).toBe(true);
  });

  it('moves a student onto an enabled pack when their own was switched off', async () => {
    const token = await instructor();
    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    const { body } = await call(ses, get('/api/session', token));
    expect(body.packId).toBe(OTHER);
  });
});
