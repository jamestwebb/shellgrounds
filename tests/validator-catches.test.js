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
    target.success.flagFile = '/home/examiner/does_not_exist.txt';
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
    // A commandMatches check no longer sits alone at the top level. It is
    // nested inside an allOf beside an output assertion, so that a challenge
    // proves what the terminal produced and not only what was typed — which is
    // the whole point of the output-validation work. Search the tree.
    const findCommandMatches = (node) => {
      if (!node || typeof node !== 'object') return null;
      if ((node.predicate || node.kind) === 'commandMatches') return node;
      for (const child of node.predicates || []) {
        const hit = findCommandMatches(child);
        if (hit) return hit;
      }
      return null;
    };
    const target = pack.challenges.find(c => findCommandMatches(c.success));
    expect(target, 'no challenge uses commandMatches anywhere').toBeTruthy();
    findCommandMatches(target.success).pattern = '^this_will_never_match$';
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
    target.brief = 'Run `cat /home/examiner/definitely_missing_file.txt` to continue.';
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
    pack.challenges[0].setup = { cwd: '/home/examiner/nowhere' };
    const r = await validatePack(pack);
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/nowhere/);
  });
});

// ── Phase 3: the checks that read a course rather than a challenge ──────────
//
// Everything above breaks one shipped pack and asserts the validator notices.
// These build the smallest pack that can possibly trip one rule, because the
// question here is not "does the pack pass" but "can this rule fire at all".
// A synthetic pack also pins the tuning: if someone loosens a threshold, the
// example that was chosen to sit just over it stops being reported.

import { expandFilesystem } from '../packages/engine/validate/packFile.js';
import { checkCommandHonesty } from '../packages/engine/validate/packValidator.js';
import { registry } from '../packages/engine/commands/registry.js';
import { REAL_LINUX, REAL_WINDOWS } from '../packages/engine/unknown-command.js';

const SYNTH_FS = () => expandFilesystem({
  platform: 'linux',
  root: '/',
  tree: {
    home: {
      children: {
        student: {
          children: {
            'notes.txt': { content: 'hello from the notes\n' },
            'log.txt': { content: 'ERROR one\nERROR two\n' }
          }
        }
      }
    }
  }
});

/** A challenge that passes every existing check, so only the new one speaks. */
const solvable = (id, act, extra = {}) => ({
  id,
  act,
  title: `Challenge ${id}`,
  points: 10,
  brief: 'The notes.txt in your home directory has the answer in it.',
  objective: 'Print the contents of notes.txt.',
  setup: { cwd: '/home/student' },
  teaches: ['cat'],
  acceptedVariants: ['cat notes.txt'],
  success: {
    predicate: 'allOf',
    predicates: [
      { predicate: 'commandMatches', pattern: '^cat\\s+notes\\.txt$' },
      { predicate: 'outputContains', text: 'hello' }
    ]
  },
  ...extra
});

const syntheticPack = ({ challenges, manifest = {} } = {}) => ({
  id: 'synth-pack',
  manifest: {
    id: 'synth-pack',
    name: 'Synthetic Pack',
    version: '1.0.0',
    platforms: ['linux'],
    icon: '🧪',
    description: 'A pack built by a test to trip exactly one check.',
    linux: { home: '/home/student', user: 'student', host: 'box' },
    acts: [{ id: 1, name: 'Act I' }, { id: 2, name: 'Act II' }],
    badges: [],
    ...manifest
  },
  challenges,
  help: {},
  commands: {},
  createFs: SYNTH_FS
});

describe('Pack validator reads the course, not only the challenge', () => {
  it('reports a challenge that introduces more than two ideas at once', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [
        // All three are skills: two commands and an operator. A tag like
        // 'sorting' describes what the lesson is FOR and no longer counts
        // toward the load. See isSkillTag in the validator.
        solvable('sy-1-a', 1, { teaches: ['cat', 'sort', '>'] }),
        solvable('sy-1-b', 1)
      ]
    }));
    expect(r.tooMuchAtOnce.map(t => t.id)).toEqual(['sy-1-a']);
    expect(r.tooMuchAtOnce[0].tags).toEqual(['cat', 'sort', '>']);
    // A finding, never a failure: this pack still ships.
    expect(r.valid).toBe(true);
  });

  it('reports a new idea smuggled into a synthesis, and does not double-count it', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [
        solvable('sy-1-a', 1, { teaches: ['cat'] }),
        solvable('sy-1-b', 1, { teaches: ['|'] }),
        solvable('sy-2-boss', 2, { teaches: ['cat', '|', 'uniq'] })
      ]
    }));
    expect(r.coldInSynthesis.map(c => c.id)).toEqual(['sy-2-boss']);
    expect(r.coldInSynthesis[0].tags).toEqual(['uniq']);
    // Three tags with one new is a synthesis, not a firehose.
    expect(r.tooMuchAtOnce).toEqual([]);
  });

  it('does not count a description of the lesson as an idea in it', async () => {
    // `stat`, `metadata`, `inodes` is one lesson wearing three tags. Counting
    // that as three made this check report every challenge that bothered to
    // describe itself: eight of 104, none of them a real problem.
    const r = await validatePack(syntheticPack({
      challenges: [
        solvable('sy-1-a', 1, { teaches: ['stat', 'metadata', 'inodes'] }),
        solvable('sy-1-b', 1)
      ]
    }));
    expect(r.tooMuchAtOnce).toEqual([]);
  });

  it('reports an idea whose own lesson comes after the challenge that needed it', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [
        solvable('sy-1-a', 1, { teaches: ['cat'] }),
        solvable('sy-1-boss', 1, { teaches: ['cat', '|', 'uniq'] }),
        solvable('sy-2-uniq', 2, { teaches: ['uniq', 'de-duplication'] })
      ]
    }));
    expect(r.taughtLate).toHaveLength(1);
    expect(r.taughtLate[0]).toMatchObject({
      tag: 'uniq', neededIn: 'sy-1-boss', dedicatedIn: 'sy-2-uniq'
    });
  });

  it('catches a builtOn that names a challenge which does not exist', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1), solvable('sy-1-b', 1, { builtOn: ['sy-1-ghost'] })]
    }));
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/sy-1-ghost/);
  });

  it('catches a builtOn that points forwards through the course', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1, { builtOn: ['sy-2-b'] }), solvable('sy-2-b', 2)]
    }));
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/comes later in the course/);
  });

  it('catches a builtOn on a challenge in a later act', async () => {
    // Earlier in the array, later in the course: act order wins, and the act
    // rule has to be checked separately or a mis-ordered file slips through.
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-2-a', 2), solvable('sy-1-b', 1, { builtOn: ['sy-2-a'] })]
    }));
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/sy-2-a/);
  });

  it('reports a pack where nothing builds on anything, and stays quiet when things do', async () => {
    const flat = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1), solvable('sy-1-b', 1), solvable('sy-2-c', 2)]
    }));
    expect(flat.builtOnGap).toMatchObject({ links: 0, acts: 2 });

    const joined = await validatePack(syntheticPack({
      challenges: [
        solvable('sy-1-a', 1),
        solvable('sy-1-b', 1, { builtOn: ['sy-1-a'] }),
        solvable('sy-2-c', 2, { builtOn: ['sy-1-b'] })
      ]
    }));
    expect(joined.errors).toEqual([]);
    expect(joined.checks.builtOn.links).toBe(2);
    expect(joined.builtOnGap).toBe(null);
  });

  it('reports a brief that names nothing the student can touch', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1, {
        brief: 'Something in your home directory has the answer in it.',
        objective: 'Print what it says.'
      })]
    }));
    expect(r.sceneWithoutObject.map(s => s.id)).toEqual(['sy-1-a']);
    // The default brief names notes.txt, which is really there, so it passes.
    const named = await validatePack(syntheticPack({ challenges: [solvable('sy-1-a', 1)] }));
    expect(named.sceneWithoutObject).toEqual([]);
    expect(named.checks.sceneObjects.checked).toBe(1);
  });

  it('does not ask for a filename when the answer takes no object', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-pwd', 1, {
        brief: 'You have lost track of where you are standing.',
        objective: 'Print the directory you are in.',
        acceptedVariants: ['pwd'],
        success: {
          predicate: 'allOf',
          predicates: [
            { predicate: 'commandMatches', pattern: '^pwd\\s*$' },
            { predicate: 'outputContains', text: '/home/student' }
          ]
        }
      })]
    }));
    expect(r.checks.sceneObjects.checked).toBe(0);
    expect(r.sceneWithoutObject).toEqual([]);
  });

  it('FAILS a pack that requires a tool it told the student is not simulated', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1)],
      manifest: { courseTools: { cat: 'a real tool for printing files' } }
    }));
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/courseTools/);
    expect(errorText(r)).toMatch(/sy-1-a/);
  });

  it('finds the same contradiction in a commandMatches pattern with no variants', async () => {
    const r = await validatePack(syntheticPack({
      challenges: [solvable('sy-1-a', 1, {
        acceptedVariants: undefined,
        brief: 'Print `cat notes.txt` to read the notes.'
      })],
      manifest: { courseTools: { cat: 'a real tool for printing files' } }
    }));
    expect(r.valid).toBe(false);
    expect(errorText(r)).toMatch(/courseTools/);
  });

  it('never reports a command as stale unless it really is in both lists', () => {
    const honesty = checkCommandHonesty();
    expect(honesty.checked).toBeGreaterThan(0);
    for (const { name, platform } of honesty.stale) {
      const real = platform === 'windows' ? REAL_WINDOWS : REAL_LINUX;
      expect(real.has(name), `${name} is not in the ${platform} honesty list`).toBe(true);
      expect(registry.get(name, platform), `${name} is not implemented for ${platform}`).toBeTruthy();
    }
    // The pass flag has to follow the list, or the report can say "clean" while
    // holding findings — which is the shape of every bug this file exists for.
    expect(honesty.pass).toBe(honesty.stale.length === 0);
  });
});
