// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// What a tool IS, and which layer owns saying so.
//
// The product taught 51 commands and defined none of them where a student
// would meet one, and taught 62 more ideas -- a pipe, a flag, `$?`, globbing --
// that were defined nowhere at all. The man pages had good text and lived
// behind a command a beginner has no reason to run about a tool they have not
// met yet.
//
// The split these tests defend:
//
//   THE ENGINE OWNS what is true of the shell everywhere. `grep` does not mean
//   something different in a forensics course, and a definition copied into
//   three packs will disagree with itself within a year.
//
//   THE PACK OWNS what is true of this course: its own commands (`scan`,
//   `extract`), and its own vocabulary (`chain-of-custody`, `magic-bytes`),
//   neither of which any engine table could know about.

import { describe, it, expect } from 'vitest';
import {
  ENGINE_GLOSSARY, defineTerm, firstEncounters, undefinedTerms
} from '../packages/engine/glossary.js';
import { validatePresentation, MAX_DEFINITION_LENGTH } from '../packages/engine/validate/presentation.js';
import { PACKS } from '../packs/index.js';

describe('the two layers, and which wins', () => {
  const manifest = {
    glossary: {
      scan: { term: 'scan', what: 'A bench tool that reads a disk image\'s partition table.' },
      grep: 'This course means something else by grep.',
      loose: 'A bare string is a definition too.'
    }
  };

  it('falls back to the engine when the pack says nothing', () => {
    const d = defineTerm('grep', {});
    expect(d.source).toBe('engine');
    expect(d.what).toMatch(/searches text/);
  });

  it('lets a pack define what the engine cannot know', () => {
    expect(defineTerm('scan', manifest)).toMatchObject({ term: 'scan', source: 'pack' });
    expect(defineTerm('scan', {})).toBeNull();
  });

  it('lets a pack override the engine for itself only', () => {
    expect(defineTerm('grep', manifest).source).toBe('pack');
    expect(defineTerm('grep', {}).source).toBe('engine');
  });

  it('accepts a bare string as well as a full entry', () => {
    expect(defineTerm('loose', manifest)).toMatchObject({ term: 'loose', source: 'pack' });
  });

  it('says nothing rather than guessing', () => {
    expect(defineTerm('a-thing-nobody-defined', {})).toBeNull();
    expect(defineTerm(undefined, null)).toBeNull();
  });
});

describe('a term is introduced once, on the challenge that first teaches it', () => {
  const pack = {
    manifest: {},
    challenges: [
      { id: 'a', act: 1, teaches: ['grep', 'pipes'] },
      { id: 'b', act: 1, teaches: ['grep'] },
      { id: 'c', act: 2, teaches: ['pipes', 'sort'] }
    ]
  };

  it('puts each definition on the first challenge only', () => {
    const fe = firstEncounters(pack);
    expect(fe.get('a').map(d => d.tag)).toEqual(['grep', 'pipes']);
    expect(fe.has('b')).toBe(false);
    expect(fe.get('c').map(d => d.tag)).toEqual(['sort']);
  });

  // Derived from the pack, not stored against the student. Nothing to keep in
  // step with a reseed, and practising an old challenge shows it again.
  it('is a pure function of the pack', () => {
    expect(firstEncounters(pack)).toEqual(firstEncounters(pack));
  });

  it('follows act order, not file order', () => {
    const jumbled = { manifest: {}, challenges: [
      { id: 'late', act: 3, teaches: ['grep'] },
      { id: 'early', act: 1, teaches: ['grep'] }
    ] };
    expect(firstEncounters(jumbled).has('early')).toBe(true);
    expect(firstEncounters(jumbled).has('late')).toBe(false);
  });

  it('survives a pack with no challenges at all', () => {
    expect(firstEncounters({ manifest: {}, challenges: [] }).size).toBe(0);
    expect(firstEncounters(null).size).toBe(0);
  });
});

describe('every shipped pack defines everything it teaches', () => {
  for (const pack of Object.values(PACKS)) {
    it(`${pack.id} leaves nothing unexplained`, () => {
      const missing = undefinedTerms(pack).map(m => `${m.tag} (first in ${m.firstSeenIn})`);
      expect(missing, missing.join('\n')).toEqual([]);
    });

    it(`${pack.id} actually introduces a useful number of them`, () => {
      let count = 0;
      for (const defs of firstEncounters(pack).values()) count += defs.length;
      expect(count).toBeGreaterThan(20);
    });
  }

  it('the forensics vocabulary comes from the pack, not the engine', () => {
    const m = PACKS['forensics-cli-101'].manifest;
    for (const tag of ['magic-bytes', 'chain-of-custody', 'sector-offsets']) {
      expect(defineTerm(tag, m).source, tag).toBe('pack');
      expect(ENGINE_GLOSSARY[tag], `${tag} is course vocabulary, not shell`).toBeUndefined();
    }
  });

  it('the shell vocabulary comes from the engine, in every pack', () => {
    for (const pack of Object.values(PACKS)) {
      for (const tag of ['pwd', 'cd']) {
        const d = defineTerm(tag, pack.manifest);
        if (d) expect(d.source, `${pack.id}/${tag}`).toBe('engine');
      }
    }
  });
});

describe('definitions are short enough to be read', () => {
  const base = { description: 'x'.repeat(100), icon: '🔭', briefing: { body: 'x' } };

  it('refuses one that competes with the brief', () => {
    const long = { ...base, glossary: { t: 'y'.repeat(MAX_DEFINITION_LENGTH + 1) } };
    expect(validatePresentation(long).errors.join(' ')).toMatch(/limit is/);
  });

  it('refuses an entry with no text', () => {
    expect(validatePresentation({ ...base, glossary: { t: '' } }).errors.join(' ')).toMatch(/needs text/);
    expect(validatePresentation({ ...base, glossary: [] }).errors.join(' ')).toMatch(/must be an object/);
  });

  it('accepts the shipped ones', () => {
    for (const pack of Object.values(PACKS)) {
      expect(validatePresentation(pack.manifest).errors, pack.id).toEqual([]);
    }
  });

  it('every engine definition fits too', () => {
    for (const [tag, d] of Object.entries(ENGINE_GLOSSARY)) {
      expect(d.what, tag).toBeTruthy();
      expect(d.what.length, `${tag} is ${d.what.length} chars`).toBeLessThanOrEqual(MAX_DEFINITION_LENGTH);
      expect(d.term, tag).toBeTruthy();
    }
  });
});
