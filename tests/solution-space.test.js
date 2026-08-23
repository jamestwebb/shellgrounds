// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Two questions a course has to keep answering as it grows:
//
//   Does a challenge accept the OTHER correct ways of doing it?
//   Does the simulator tell a right student they are wrong?
//
// Both had failures in the shipped packs, and both are the kind that nobody
// reports: a student who is refused for a correct answer concludes they do not
// understand, not that the course is wrong.

import { describe, it, expect } from 'vitest';
import {
  splitPredicate, expandVariants, auditChallenge, OUTCOME_PREDICATES, TEXT_PREDICATES
} from '../packages/engine/validate/solutionSpace.js';
import { isRealFlag, REAL_LINUX_FLAGS } from '../packages/engine/commands/realFlags.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { registry } from '../packages/engine/commands/registry.js';
import { PACKS } from '../packs/index.js';

describe('splitting a check into result and wording', () => {
  it('separates the two kinds', () => {
    const { outcome, text } = splitPredicate({
      predicate: 'allOf',
      predicates: [
        { predicate: 'commandMatches', pattern: '^pwd\\b' },
        { predicate: 'outputEquals', text: '/home/student' }
      ]
    });
    expect(text.predicate).toBe('commandMatches');
    expect(outcome.predicate).toBe('outputEquals');
  });

  it('returns null for a kind that is absent', () => {
    expect(splitPredicate({ predicate: 'outputEquals', text: 'x' }).text).toBeNull();
    expect(splitPredicate({ predicate: 'commandMatches', pattern: 'x' }).outcome).toBeNull();
    expect(splitPredicate(null)).toEqual({ outcome: null, text: null });
  });

  it('keeps the two sets disjoint', () => {
    for (const p of TEXT_PREDICATES) expect(OUTCOME_PREDICATES.has(p)).toBe(false);
  });
});

describe('the rewritings preserve meaning', () => {
  it('quotes an operand, spells the path two other ways, and splits flags', () => {
    const v = expandVariants('grep active Documents/data.csv', { home: '/home/student' });
    expect(v).toContain('grep "active" Documents/data.csv');
    expect(v).toContain('grep active ./Documents/data.csv');
    expect(v).toContain('grep active /home/student/Documents/data.csv');
    expect(v).not.toContain('grep active Documents/data.csv');
  });

  it('knows -la, -al and -l -a are the same call', () => {
    const v = expandVariants('ls -la');
    expect(v).toContain('ls -l -a');
    expect(v).toContain('ls -al');
  });

  it('uses the long name the command itself declares', () => {
    const v = expandVariants('ls -a', { flagSpecs: { a: { long: 'all' } } });
    expect(v).toContain('ls --all');
  });

  // A generator that produces non-equivalents produces false reports, and a
  // report with false entries is ignored whole.
  it('leaves the shell alone', () => {
    for (const v of expandVariants('grep x f.txt > /tmp/out.txt', { home: '/home/student' })) {
      expect(v).toMatch(/> \/tmp\/out\.txt$/);
    }
  });

  it('makes no claims about Windows quoting or paths', () => {
    const v = expandVariants('dir /a', { isWindows: true });
    expect(v).not.toContain('dir "/a"');
    expect(v.some(x => x.includes('./'))).toBe(false);
  });
});

describe('no shipped challenge refuses a correct answer', () => {
  const deps = {
    runPipeline,
    evaluatePredicate,
    flagSpecsFor: (name, platform) => {
      try { return registry.get(name, platform)?.flags || {}; } catch { return {}; }
    }
  };

  for (const pack of Object.values(PACKS)) {
    it(`${pack.id} accepts every rewriting of its own answers`, () => {
      const unfair = [];
      for (const challenge of pack.challenges) {
        const r = auditChallenge(pack, challenge, deps);
        for (const u of r.unfair) unfair.push(`${challenge.id}: "${u.variant}" blocked by ${u.textPattern}`);
      }
      expect(unfair, unfair.join('\n')).toEqual([]);
    });
  }

  // If the rewritings stopped being generated the suite above would pass by
  // doing nothing at all, which is the failure mode this whole file exists for.
  it('actually tried some rewritings', () => {
    let tried = 0;
    for (const pack of Object.values(PACKS)) {
      for (const challenge of pack.challenges) tried += auditChallenge(pack, challenge, deps).tried;
    }
    expect(tried).toBeGreaterThan(30);
  });
});

describe('the check knows what it cannot check', () => {
  // The fuzzer can only rewrite an answer the pack already accepts, so a
  // commandMatches with no acceptedVariants is invisible to it -- and is the
  // likeliest of all to be too tight, having never been tried any other way by
  // anything. Silence about a blind spot reads as a clean bill of health.
  it('every shipped commandMatches has something to rewrite', () => {
    const blind = [];
    for (const pack of Object.values(PACKS)) {
      for (const c of pack.challenges) {
        const { text } = splitPredicate(c.success);
        if (text && !(c.acceptedVariants || []).length) blind.push(`${pack.id}/${c.id}`);
      }
    }
    expect(blind, blind.join('\n')).toEqual([]);
  });

  it('a challenge with no text check needs no accepted answer to be fair', () => {
    // Nothing to be unfair with: any command producing the outcome passes.
    const { text } = splitPredicate({ predicate: 'outputEquals', text: 'x' });
    expect(text).toBeNull();
  });
});

describe('a real option is never called invalid', () => {
  const fsFor = (id, plat) => PACKS[id].createFs(plat);
  const out = (cmd) => (runPipeline(cmd, '/home/student', fsFor('linux-fundamentals', 'linux'), 'linux', {}).output || '');

  it('says "not simulated" for a flag the real tool has', () => {
    expect(out('ls -Q')).toMatch(/not simulated here/);
    expect(out('sort -M Documents/data.csv')).toMatch(/not simulated here/);
    expect(out('cat -A welcome.txt')).toMatch(/not simulated here/);
  });

  it('still says "invalid" for a flag that is nobody\'s option', () => {
    expect(out('ls -$')).toMatch(/invalid option/);
    expect(out('grep -~ x welcome.txt')).toMatch(/invalid option/);
  });

  // realFlags.js holds SHORT letters only. `--bogus` shares its first letter
  // with `ls -b`, and checking it there reported an invented option as real.
  it('makes no claim about a long option it has no data for', () => {
    expect(out('ls --bogus')).toMatch(/unrecognized option/);
    expect(out('ls --bogus')).not.toMatch(/not simulated/);
  });

  it('knows which letters are real', () => {
    expect(isRealFlag('grep', 'e')).toBe(true);
    expect(isRealFlag('ls', 'Q')).toBe(true);
    expect(isRealFlag('ls', '$')).toBe(false);
    expect(isRealFlag('nosuchcommand', 'a')).toBe(false);
    expect(isRealFlag('dir', 'Q', true)).toBe(true);
  });

  it('covers the commands the packs actually teach', () => {
    const taught = new Set();
    for (const pack of Object.values(PACKS)) {
      for (const c of pack.challenges) for (const t of c.teaches || []) taught.add(String(t).split(/[\s-]/)[0]);
    }
    const linuxTaught = [...taught].filter(t => /^[a-z]+$/.test(t));
    const covered = linuxTaught.filter(t => t in REAL_LINUX_FLAGS);
    // Not every taught concept is a command, so this is a floor, not a total.
    expect(covered.length).toBeGreaterThan(15);
  });
});
