// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// ENABLED_PACKS: a teacher runs one course at a time.
//
// The variable was documented in .env.example and in the README before any code
// read it, so a teacher could set it, redeploy, and see all three packs anyway.
// These tests exist so that cannot happen again quietly: the menu, the default
// landing pack, and every handler must all agree about what is switched on.
//
// The handlers matter more than the menu. Hiding a pack from the pack switcher
// is presentation; refusing to grade its challenges is the part that decides
// whether a student can still play a course the teacher retired.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { freshStore, call, get, post, register } from './functions.helpers.js';
import {
  PACKS, enabledPackIds, isPackEnabled, defaultPackId, listPacks, getPack, DEFAULT_PACK_ID
} from '../packs/index.js';

const ALL = Object.keys(PACKS);
const OTHER = ALL.find(id => id !== DEFAULT_PACK_ID);

let saved;
function setEnabled(value) {
  if (value === null) delete process.env.ENABLED_PACKS;
  else process.env.ENABLED_PACKS = value;
}

beforeEach(() => { saved = process.env.ENABLED_PACKS; setEnabled(null); });
afterEach(() => { saved === undefined ? setEnabled(null) : setEnabled(saved); });

describe('reading the setting', () => {
  it('offers every pack when it is unset or blank', () => {
    expect(enabledPackIds()).toEqual(ALL);
    setEnabled('');
    expect(enabledPackIds()).toEqual(ALL);
    setEnabled('   ,  , ');
    expect(enabledPackIds()).toEqual(ALL);
  });

  it('offers exactly the packs named, in the order named', () => {
    setEnabled(`${OTHER}, ${DEFAULT_PACK_ID}`);
    expect(enabledPackIds()).toEqual([OTHER, DEFAULT_PACK_ID]);
    expect(listPacks().map(p => p.id)).toEqual([OTHER, DEFAULT_PACK_ID]);
  });

  it('ignores a name that is not a pack, and keeps the ones that are', () => {
    setEnabled(`${OTHER},not-a-pack`);
    expect(enabledPackIds()).toEqual([OTHER]);
  });

  // A blank menu is a worse failure than a disregarded typo: the teacher can
  // see three packs and fix their spelling, but cannot debug an empty site.
  it('falls back to every pack when nothing named exists', () => {
    setEnabled('typo-one,typo-two');
    expect(enabledPackIds()).toEqual(ALL);
  });

  it('moves the landing pack when the usual default is switched off', () => {
    expect(defaultPackId()).toBe(DEFAULT_PACK_ID);
    setEnabled(OTHER);
    expect(defaultPackId()).toBe(OTHER);
    expect(isPackEnabled(DEFAULT_PACK_ID)).toBe(false);
  });

  // The CLI and the validator must still be able to check a pack the running
  // site does not offer, or a teacher could never test one before enabling it.
  it('still loads a disabled pack by name for tooling', () => {
    setEnabled(OTHER);
    expect(getPack(DEFAULT_PACK_ID).id).toBe(DEFAULT_PACK_ID);
  });
});

describe('the handlers agree with the setting', () => {
  let reg, ses, sub, board, man;
  beforeEach(async () => {
    freshStore();
    reg = (await import('../netlify/functions/register-handle.js')).default;
    ses = (await import('../netlify/functions/session.js')).default;
    sub = (await import('../netlify/functions/submit-flag.js')).default;
    board = (await import('../netlify/functions/leaderboard.js')).default;
    man = (await import('../netlify/functions/manifest.js')).default;
  });

  it('lands a student on an enabled pack even when they ask for a disabled one', async () => {
    setEnabled(OTHER);
    const { token, status } = await register(reg, 'ada', { packId: DEFAULT_PACK_ID });
    expect(status).toBe(200);
    const { body } = await call(ses, get('/api/session', token));
    expect(body.packId).toBe(OTHER);
  });

  it('will not grade a challenge from a disabled pack', async () => {
    const hidden = PACKS[DEFAULT_PACK_ID].challenges
      .find(c => (c.acceptedVariants || []).length > 0);

    setEnabled(null);
    const { token } = await register(reg, 'grace');
    const allowed = await call(sub, post('/api/submit-flag',
      { challengeId: hidden.id, commandText: hidden.acceptedVariants[0] }, token));
    expect(allowed.status, 'gradable while enabled').toBe(200);

    setEnabled(OTHER);
    const refused = await call(sub, post('/api/submit-flag',
      { challengeId: hidden.id, commandText: hidden.acceptedVariants[0] }, token));
    expect(refused.status).toBe(404);
    expect(refused.body.error).toMatch(/Unknown challenge/);
  });

  it('answers for a disabled pack exactly as it does for one that never existed', async () => {
    setEnabled(OTHER);
    const { token } = await register(reg, 'linus');
    const off = await call(board, get(`/api/leaderboard?packId=${DEFAULT_PACK_ID}`, token));
    const never = await call(board, get('/api/leaderboard?packId=no-such-pack', token));
    expect(off.status).toBe(404);
    expect(never.status).toBe(404);
    expect(off.body.error.replace(DEFAULT_PACK_ID, 'X'))
      .toBe(never.body.error.replace('no-such-pack', 'X'));
  });

  it('serves flags for an enabled pack and substitutes for a disabled one', async () => {
    setEnabled(OTHER);
    const { token } = await register(reg, 'edsger');
    const { status, body } = await call(man, get(`/api/manifest?packId=${DEFAULT_PACK_ID}`, token));
    expect(status).toBe(200);
    expect(body.packId).toBe(OTHER);
  });
});
