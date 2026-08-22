// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The validator's own test suite.
//
// A check that cannot fail is worse than no check: it certifies broken content
// as valid. Each test here deliberately breaks a pack and asserts the validator
// REJECTS it. If one of these starts passing a broken pack, the guarantee that
// "every challenge is solvable" has quietly become a lie.

import { describe, it, expect } from 'vitest';
import { validatePack } from '../packages/engine/validate/packValidator.js';
import { getPack } from '../packs/index.js';

// Deep-ish clone that preserves createFs/commands functions.
function clonePack(id) {
  const p = getPack(id);
  return {
    ...p,
    manifest: JSON.parse(JSON.stringify(p.manifest)),
    challenges: JSON.parse(JSON.stringify(p.challenges)),
    help: JSON.parse(JSON.stringify(p.help || {}))
  };
}

const errorText = (r) => r.errors.join(' | ');

describe('Pack validator rejects broken content', () => {
  it('baseline: the shipped pack is valid', async () => {
    const r = await validatePack(getPack('forensics-cli-101'));
    expect(errorText(r)).toBe('');
    expect(r.valid).toBe(true);
  });

  it('catches an unreachable flag (placeholder removed from the filesystem)', async () => {
    const pack = clonePack('forensics-cli-101');
    const original = pack.createFs;
    pack.createFs = (plat) => {
      const fs = original(plat);
      for (const [k, node] of Object.entries(fs)) {
        if (node?.type === 'file' && typeof node.content === 'string' && node.content.includes('[[FLAG:act1-hidden]]')) {
          fs[k] = { ...node, content: node.content.replace('[[FLAG:act1-hidden]]', 'GONE') };
        }
      }
      return fs;
    };
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/act1-hidden/);
  });

  it('catches a flag challenge whose flagFile does not exist', async () => {
    const pack = clonePack('forensics-cli-101');
    const target = pack.challenges.find(c => c.success?.kind === 'flag' && c.success.flagFile?.startsWith('/'));
    target.success.flagFile = '/home/analyst/does_not_exist.txt';
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/does_not_exist\.txt/);
  });

  it('catches an orphan placeholder that maps to no challenge', async () => {
    const pack = clonePack('forensics-cli-101');
    const original = pack.createFs;
    pack.createFs = (plat) => {
      const fs = original(plat);
      const key = Object.keys(fs).find(k => fs[k]?.type === 'file');
      fs[key] = { ...fs[key], content: `${fs[key].content}\n[[FLAG:no-such-challenge]]\n` };
      return fs;
    };
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/no-such-challenge/);
  });

  it('catches a command challenge that its own solution cannot satisfy', async () => {
    const pack = clonePack('forensics-cli-101');
    const target = pack.challenges.find(c => c.success?.predicate === 'commandMatches');
    target.success.pattern = '^this_will_never_match$';
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(new RegExp(target.id));
  });

  it('catches a challenge that declares no way to solve it', async () => {
    const pack = clonePack('forensics-cli-101');
    const target = pack.challenges.find(c => c.success?.kind !== 'flag');
    delete target.acceptedVariants;
    target.brief = 'Do the thing with no command named anywhere.';
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/solvability cannot be proven|not solvable/);
  });

  it('catches a broken command quoted in a brief', async () => {
    const pack = clonePack('forensics-cli-101');
    const target = pack.challenges.find(c => !c.commandCheckExemptSnippets);
    target.brief = 'Run `cat /home/analyst/definitely_missing_file.txt` to continue.';
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/definitely_missing_file/);
  });

  it('catches an act-progression deadlock (the production bug class)', async () => {
    const pack = clonePack('forensics-cli-101');
    // Leave a gated act with a single prior challenge, so skipping one leaves
    // zero solved while one is still required.
    const gated = pack.manifest.acts.find(a => a.unlockThreshold || (a.unlockPolicy && a.unlockPolicy !== 'open'));
    const priorAct = gated.id - 1;
    const priorIds = pack.challenges.filter(c => c.act === priorAct).map(c => c.id);
    pack.challenges = pack.challenges.filter(c => c.act !== priorAct || c.id === priorIds[0]);
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/locked out|cannot be unlocked/i);
  });

  it('catches a setup.cwd that does not exist', async () => {
    const pack = clonePack('forensics-cli-101');
    pack.challenges[0].setup = { cwd: '/home/analyst/nowhere' };
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/nowhere/);
  });
});
