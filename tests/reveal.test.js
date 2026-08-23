// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The cooperative reveal, and the instructor's choice of framing.
//
// Most of these test an ABSENCE. The reveal is worth building only if it does
// not quietly become a leaderboard with pictures, and the ways that could
// happen are: sending scores, sending an ordering, or naming who is behind.
// Those are easy to add by accident and hard to notice, so they are pinned.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshStore, call, get, post, register, SETUP_CODE } from './functions.helpers.js';
import { buildReveal, tileOrder, REVEAL_TILES } from '../packages/engine/reveal.js';
import { PACKS, DEFAULT_PACK_ID } from '../packs/index.js';

const ALL = Object.keys(PACKS);
const OTHER = ALL.find(id => id !== DEFAULT_PACK_ID);

const solve = (handle, challengeId, minutes) => ({
  handle,
  challengeId,
  solvedAt: new Date(Date.UTC(2026, 7, 20, 9, minutes)).toISOString()
});

describe('the picture', () => {
  it('turns over one square per find, whoever made it', () => {
    const r = buildReveal([solve('ada', 'a', 1), solve('bo', 'b', 2), solve('ada', 'c', 3)], 'p');
    expect(r.uncovered).toBe(3);
    expect(r.contributors).toBe(2);
  });

  // The whole point. A student who found three has three squares; so does
  // anyone else who found three. Points exist for the gradebook, not here.
  it('weights every find the same', () => {
    const r = buildReveal([solve('ada', 'worth-5', 1), solve('bo', 'worth-500', 2)], 'p');
    expect(r.tiles).toHaveLength(2);
    expect(r.tiles.map(t => t.handle)).toEqual(['ada', 'bo']);
  });

  it('uncovers in the order the class actually worked', () => {
    const later = solve('ada', 'a', 30);
    const earlier = solve('bo', 'b', 5);
    const r = buildReveal([later, earlier], 'p');
    expect(r.tiles.map(t => t.handle)).toEqual(['bo', 'ada']);
  });

  it('counts a find with an unusable timestamp rather than dropping it', () => {
    const broken = { handle: 'cy', challengeId: 'x', solvedAt: 'not a date' };
    const r = buildReveal([solve('ada', 'a', 1), broken], 'p');
    expect(r.uncovered).toBe(2);
    expect(r.tiles[1].handle, 'sorts last, still counts').toBe('cy');
  });

  it('marks the viewer’s own squares, and nobody else’s', () => {
    const r = buildReveal([solve('ada', 'a', 1), solve('bo', 'b', 2)], 'p', 'ADA');
    expect(r.yours).toBe(1);
    expect(r.tiles.filter(t => t.mine).map(t => t.handle)).toEqual(['ada']);
  });

  // The picture must finish comfortably before the last student does, or the
  // slowest person in the room is visibly holding it up.
  it('finishes without needing everyone, and keeps counting after', () => {
    const many = Array.from({ length: REVEAL_TILES + 40 },
      (_, i) => solve(`s${i % 20}`, `c${i}`, i));
    const r = buildReveal(many, 'p');
    expect(r.complete).toBe(true);
    expect(r.uncovered).toBe(REVEAL_TILES);
    expect(r.tiles).toHaveLength(REVEAL_TILES);
    expect(r.contributors, 'later finds still count towards who is taking part').toBe(20);
  });

  it('handles an empty class without inventing anything', () => {
    const r = buildReveal([], 'p');
    expect(r).toMatchObject({ uncovered: 0, complete: false, contributors: 0, yours: 0 });
  });
});

describe('the order squares appear in', () => {
  it('is a genuine permutation, so no square is skipped or repeated', () => {
    const order = tileOrder('linux-fundamentals');
    expect(new Set(order).size).toBe(REVEAL_TILES);
    expect(Math.min(...order)).toBe(0);
    expect(Math.max(...order)).toBe(REVEAL_TILES - 1);
  });

  it('is identical for everyone looking at the same class', () => {
    expect(tileOrder('same')).toEqual(tileOrder('same'));
  });

  it('differs per pack, so two courses do not uncover in step', () => {
    expect(tileOrder('pack-a')).not.toEqual(tileOrder('pack-b'));
  });

  // Filling left to right would make the picture look like a progress bar.
  it('does not simply fill in reading order', () => {
    const order = tileOrder('linux-fundamentals');
    const inOrder = order.slice(0, 12).every((v, i) => v === i);
    expect(inOrder).toBe(false);
  });
});

describe('the endpoint sends nothing that could be ranked', () => {
  let reg, sub, rev, cfg;
  beforeEach(async () => {
    freshStore();
    reg = (await import('../netlify/functions/register-handle.js')).default;
    sub = (await import('../netlify/functions/submit-flag.js')).default;
    rev = (await import('../netlify/functions/reveal.js')).default;
    cfg = (await import('../netlify/functions/config.js')).default;
  });

  async function withSolves() {
    const { token } = await register(reg, 'ada');
    const targets = PACKS[DEFAULT_PACK_ID].challenges
      .filter(c => (c.acceptedVariants || []).length > 0).slice(0, 3);
    for (const c of targets) {
      await call(sub, post('/api/submit-flag',
        { challengeId: c.id, commandText: c.acceptedVariants[0] }, token));
    }
    return token;
  }

  it('reports the picture, the people, and no scores at all', async () => {
    const token = await withSolves();
    const { status, body } = await call(rev, get(`/api/reveal?packId=${DEFAULT_PACK_ID}`, token));

    expect(status).toBe(200);
    expect(body.uncovered).toBe(3);
    expect(body.yours).toBe(3);
    expect(body.contributors).toBe(1);

    const wire = JSON.stringify(body);
    for (const forbidden of ['"score"', '"rank"', '"points"', '"netPoints"', '"totalScore"']) {
      expect(wire, `the reveal must not carry ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('names who found what, so recognition survives losing the ranking', async () => {
    const token = await withSolves();
    const { body } = await call(rev, get(`/api/reveal?packId=${DEFAULT_PACK_ID}`, token));
    expect(body.feed.length).toBe(3);
    expect(body.feed[0].handle).toBe('ada');
    expect(body.feed[0].title, 'a name a student recognises, not an id').toBeTruthy();
    expect(body.tiles.every(t => t.handle === 'ada')).toBe(true);
  });

  it('carries the pack’s own picture', async () => {
    const token = await withSolves();
    const { body } = await call(rev, get(`/api/reveal?packId=${DEFAULT_PACK_ID}`, token));
    expect(body.image, 'the shipped packs have art').toMatch(/^data:image\//);
    expect(body.columns * body.rows).toBe(body.total);
  });

  it('needs a session', async () => {
    const { status } = await call(rev, get('/api/reveal'));
    expect(status).toBe(401);
  });

  it('refuses a pack the teacher switched off', async () => {
    const { token } = await register(reg, 'profsmith', { setupCode: SETUP_CODE });
    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    const { body } = await call(rev, get(`/api/reveal?packId=${DEFAULT_PACK_ID}`, token));
    expect(body.packId, 'falls back to one that is on').toBe(OTHER);
  });
});

describe('the instructor chooses the framing', () => {
  let reg, cfg;
  beforeEach(async () => {
    freshStore();
    reg = (await import('../netlify/functions/register-handle.js')).default;
    cfg = (await import('../netlify/functions/config.js')).default;
  });

  const instructor = async () =>
    (await register(reg, 'profsmith', { setupCode: SETUP_CODE })).token;

  it('defaults to the shared picture, not the ranking', async () => {
    const { token } = await register(reg, 'student');
    const { body } = await call(cfg, get('/api/config', token));
    expect(body.classView).toBe('reveal');
  });

  it('lets an instructor choose the leaderboard instead', async () => {
    const token = await instructor();
    const saved = await call(cfg, post('/api/config', { classView: 'leaderboard' }, token));
    expect(saved.status).toBe(200);
    expect(saved.body.classView).toBe('leaderboard');

    const { body } = await call(cfg, get('/api/config', token));
    expect(body.classView).toBe('leaderboard');
  });

  // Saving one field must not wipe the other, and must not answer `undefined`
  // for a site that is in fact offering every pack.
  it('saves the framing without disturbing which packs are on', async () => {
    const token = await instructor();
    await call(cfg, post('/api/config', { enabledPacks: [OTHER] }, token));
    const after = await call(cfg, post('/api/config', { classView: 'leaderboard' }, token));
    expect(after.body.enabledPacks).toEqual([OTHER]);
    expect(after.body.classView).toBe('leaderboard');
  });

  it('answers a site that has only ever set the framing', async () => {
    const token = await instructor();
    const res = await call(cfg, post('/api/config', { classView: 'leaderboard' }, token));
    expect(res.body.enabledPacks, 'still every pack, not undefined').toEqual(ALL);
  });

  it('refuses a framing that does not exist', async () => {
    const token = await instructor();
    const { status, body } = await call(cfg, post('/api/config', { classView: 'podium' }, token));
    expect(status).toBe(400);
    expect(body.error).toMatch(/classView/);
  });

  it('is refused for a student', async () => {
    const { token } = await register(reg, 'student');
    const { status } = await call(cfg, post('/api/config', { classView: 'leaderboard' }, token));
    expect(status).toBe(403);
  });

  it('reports a request that would change nothing', async () => {
    const token = await instructor();
    const { status, body } = await call(cfg, post('/api/config', {}, token));
    expect(status).toBe(400);
    expect(body.error).toMatch(/Nothing to save/);
  });
});
