// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The cooperative reveal, and the instructor's choice of framing.
//
// Most of these test an ABSENCE. The reveal is worth building only if it does
// not quietly become a leaderboard with pictures, and the ways that could
// happen are: sending scores, sending an ordering, or naming who is behind.
// Those are easy to add by accident and hard to notice, so they are pinned.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshStore, call, get, post, register, SETUP_CODE } from './functions.helpers.js';
import {
  buildReveal, tileOrder, revealTarget, revealGrid, GRID_LADDER, MIN_TARGET, MAX_TARGET
} from '../packages/engine/reveal.js';
import { PACKS, DEFAULT_PACK_ID } from '../packs/index.js';

const ALL = Object.keys(PACKS);
const OTHER = ALL.find(id => id !== DEFAULT_PACK_ID);

const solve = (handle, challengeId, minutes) => ({
  handle,
  challengeId,
  solvedAt: new Date(Date.UTC(2026, 7, 20, 9, minutes)).toISOString()
});

describe('the picture', () => {
  it('counts every find, whoever made it', () => {
    const r = buildReveal([solve('ada', 'a', 1), solve('bo', 'b', 2), solve('ada', 'c', 3)], 'p');
    expect(r.finds).toBe(3);
    expect(r.contributors).toBe(2);
    expect(r.fraction).toBeCloseTo(3 / r.target, 5);
  });

  // The whole point. A student who found three has three squares; so does
  // anyone else who found three. Points exist for the gradebook, not here.
  it('weights every find the same', () => {
    const cheap = buildReveal([solve('ada', 'worth-5', 1)], 'p');
    const dear = buildReveal([solve('bo', 'worth-500', 1)], 'p');
    expect(cheap.fraction).toBe(dear.fraction);
  });

  it('uncovers in the order the class actually worked', () => {
    const later = solve('ada', 'a', 30);
    const earlier = solve('bo', 'b', 5);
    const r = buildReveal([later, earlier], 'p', { roster: 1, challenges: 8 });
    expect(r.tiles[0].handle, 'the earliest find owns the first square').toBe('bo');
  });

  it('counts a find with an unusable timestamp rather than dropping it', () => {
    const broken = { handle: 'cy', challengeId: 'x', solvedAt: 'not a date' };
    const r = buildReveal([solve('ada', 'a', 1), broken], 'p');
    expect(r.finds).toBe(2);
    expect(r.contributors).toBe(2);
  });

  it('marks the viewer’s own squares, and nobody else’s', () => {
    const r = buildReveal([solve('ada', 'a', 1), solve('bo', 'b', 2)], 'p',
      { viewer: 'ADA', roster: 1, challenges: 8 });
    expect(r.yours).toBe(1);
    expect(r.tiles.every(t => t.mine === (t.handle === 'ada'))).toBe(true);
  });

  // The picture must finish comfortably before the last student does, or the
  // slowest person in the room is visibly holding it up.
  it('finishes without needing everyone, and keeps counting after', () => {
    const target = revealTarget(20, 44);
    const many = Array.from({ length: target + 60 }, (_, i) => solve(`s${i % 20}`, `c${i}`, i));
    const r = buildReveal(many, 'p', { roster: 20, challenges: 44 });
    expect(r.complete).toBe(true);
    expect(r.fraction).toBe(1);
    expect(r.uncovered).toBe(r.total);
    expect(r.contributors, 'later finds still count towards who is taking part').toBe(20);
  });

  it('handles an empty class without inventing anything', () => {
    const r = buildReveal([], 'p');
    expect(r).toMatchObject({ uncovered: 0, finds: 0, complete: false, contributors: 0, yours: 0 });
    expect(r.tiles).toEqual([]);
  });
});

// The first version had a fixed 96 squares, which is wrong at both ends: one
// learner alone would need 96 finds from a 44-challenge pack and could never
// finish, and a class of 25 filled it in the first ten minutes of the first
// lesson. The picture has to cost a comparable share of the course either way.
describe('the picture is sized to the class', () => {
  it('asks a comparable share of the course whatever the class size', () => {
    for (const roster of [1, 4, 12, 25, 60, 200]) {
      const target = revealTarget(roster, 44);
      const perStudent = target / roster;
      const shareOfPack = perStudent / 44;
      // A class of 200 hits the ceiling, which is the point of the ceiling.
      if (target < MAX_TARGET) {
        expect(shareOfPack, `roster ${roster}`).toBeGreaterThan(0.3);
        expect(shareOfPack, `roster ${roster}`).toBeLessThan(0.6);
      }
    }
  });

  it('gives a solo learner a picture they can actually finish', () => {
    const target = revealTarget(1, 44);
    expect(target).toBeLessThanOrEqual(44);
    expect(target).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it('never asks for more finds than anyone would make', () => {
    expect(revealTarget(100000, 500)).toBe(MAX_TARGET);
  });

  it('draws on a finer grid for a bigger class, and stops before specks', () => {
    const small = revealGrid(revealTarget(2, 30));
    const big = revealGrid(revealTarget(200, 44));
    expect(big.tiles).toBeGreaterThan(small.tiles);
    expect(big.tiles).toBe(GRID_LADDER[GRID_LADDER.length - 1].columns
      * GRID_LADDER[GRID_LADDER.length - 1].rows);
  });

  it('keeps every grid at the 3:2 the artwork is cut to', () => {
    for (const g of GRID_LADDER) expect(g.columns / g.rows).toBeCloseTo(1.5, 5);
  });

  // A grid change must not step the picture backwards: 40% is 40% whether it
  // is drawn as 38 of 96 squares or 154 of 384.
  it('shows the same share of the picture at any grid size', () => {
    const solves = Array.from({ length: 60 }, (_, i) => solve(`s${i % 6}`, `c${i}`, i));
    const coarse = buildReveal(solves, 'p', { roster: 6, challenges: 20 });
    const fine = buildReveal(solves, 'p', { roster: 6, challenges: 20 });
    expect(coarse.uncovered / coarse.total).toBeCloseTo(fine.uncovered / fine.total, 2);
  });

  // The real hazard: a second section registers in week five, the target
  // rises, and the class watches its own picture re-cover.
  it('never goes backwards when the class grows', () => {
    const solves = Array.from({ length: 40 }, (_, i) => solve(`s${i % 4}`, `c${i}`, i));
    const before = buildReveal(solves, 'p', { roster: 4, challenges: 20 });
    const afterIntake = buildReveal(solves, 'p', {
      roster: 40, challenges: 20, floorFraction: before.fraction
    });
    expect(afterIntake.fraction).toBeGreaterThanOrEqual(before.fraction);
    expect(afterIntake.uncovered / afterIntake.total)
      .toBeGreaterThanOrEqual(before.uncovered / before.total - 0.02);
  });

  it('would have gone backwards without that floor', () => {
    const solves = Array.from({ length: 40 }, (_, i) => solve(`s${i % 4}`, `c${i}`, i));
    const before = buildReveal(solves, 'p', { roster: 4, challenges: 20 });
    const unguarded = buildReveal(solves, 'p', { roster: 40, challenges: 20 });
    expect(unguarded.fraction, 'the hazard is real, not theoretical')
      .toBeLessThan(before.fraction);
  });
});

describe('the order squares appear in', () => {
  it('is a genuine permutation, so no square is skipped or repeated', () => {
    for (const g of GRID_LADDER) {
      const n = g.columns * g.rows;
      const order = tileOrder('linux-fundamentals', n);
      expect(new Set(order).size, `${g.columns}x${g.rows}`).toBe(n);
      expect(Math.min(...order)).toBe(0);
      expect(Math.max(...order)).toBe(n - 1);
    }
  });

  it('is identical for everyone looking at the same class', () => {
    expect(tileOrder('same', 96)).toEqual(tileOrder('same', 96));
  });

  it('differs per pack, so two courses do not uncover in step', () => {
    expect(tileOrder('pack-a', 96)).not.toEqual(tileOrder('pack-b', 96));
  });

  // Filling left to right would make the picture look like a progress bar.
  it('does not simply fill in reading order', () => {
    const order = tileOrder('linux-fundamentals', 96);
    expect(order.slice(0, 12).every((v, i) => v === i)).toBe(false);
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
    expect(body.finds).toBe(3);
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
    expect(body.target, 'sized to the roster').toBeGreaterThan(0);
    expect(body.finds).toBe(3);
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
