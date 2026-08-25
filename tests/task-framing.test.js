// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// A student has to be able to find out what they are being asked to do.
//
// This was found by using the product rather than by reading it. The screen
// showed a title ("Where Am I?"), a definition of `pwd`, and three sentences of
// story with the instruction buried in the middle of them. Nothing on the
// screen was labelled as the task, so there was nothing to look at and no
// reason to type. The content was all there. The framing was not.
//
// Three things are asserted here, and each one broke in a different way:
//   the pack writes the task line          (`objective` on every challenge)
//   the engine shows it as the task        (the labelled block in the sidebar)
//   the engine says when it is missing     (the validator's own report)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PACKS } from '../packs/index.js';
import { MAX_OBJECTIVE_LENGTH } from '../packages/engine/validate/presentation.js';
import { validatePack } from '../packages/engine/validate/packValidator.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const everyChallenge = Object.entries(PACKS)
  .flatMap(([packId, pack]) => pack.challenges.map(c => ({ packId, c })));

describe('every shipped challenge states its task', () => {
  it('has an objective', () => {
    const without = everyChallenge
      .filter(({ c }) => typeof c.objective !== 'string' || c.objective.trim().length === 0)
      .map(({ packId, c }) => `${packId}/${c.id}`);
    expect(without).toEqual([]);
  });

  it('keeps it to one readable line', () => {
    const tooLong = everyChallenge
      .filter(({ c }) => (c.objective || '').length > MAX_OBJECTIVE_LENGTH)
      .map(({ packId, c }) => `${packId}/${c.id} (${c.objective.length})`);
    expect(tooLong).toEqual([]);
  });

  it('is not simply the brief again', () => {
    const same = everyChallenge
      .filter(({ c }) => c.objective && c.objective.trim() === (c.brief || '').trim())
      .map(({ packId, c }) => `${packId}/${c.id}`);
    expect(same).toEqual([]);
  });

  // The task line is read before the student has tried anything, so a solution
  // sitting in it is a challenge nobody has to solve.
  it('does not print the answer', () => {
    const leaks = everyChallenge
      .filter(({ c }) => c.solution && c.objective?.includes(c.solution))
      .map(({ packId, c }) => `${packId}/${c.id} → ${c.solution}`);
    expect(leaks).toEqual([]);
  });

  it('starts with a verb, so it reads as an instruction', () => {
    // Not an exhaustive grammar check -- just that the line does not open with
    // the scene, which is what a brief does and what this is here to replace.
    const notImperative = everyChallenge
      .filter(({ c }) => c.objective && !/^[A-Z][a-z]+/.test(c.objective.trim()))
      .map(({ packId, c }) => `${packId}/${c.id}`);
    expect(notImperative).toEqual([]);
  });
});

describe('every act says what it contains', () => {
  it('has a tagline on every act of every pack', () => {
    const without = [];
    for (const [packId, pack] of Object.entries(PACKS)) {
      for (const act of pack.manifest.acts || []) {
        if (typeof act.tagline !== 'string' || act.tagline.trim().length === 0) {
          without.push(`${packId}/act ${act.id}`);
        }
      }
    }
    expect(without).toEqual([]);
  });

  // The tagline existed in all three packs from the beginning and the sidebar
  // rendered `glyph` -- a decorative "---.---" -- in the slot where it belongs.
  it('renders the tagline rather than the decorative glyph', () => {
    const sidebar = read('src/components/ChallengeSidebar.jsx');
    expect(sidebar).toMatch(/currentAct\.tagline/);
    expect(sidebar).not.toMatch(/\{currentAct\?\.glyph\}/);
  });
});

describe('the sidebar frames the task', () => {
  const sidebar = read('src/components/ChallengeSidebar.jsx');

  it('labels it', () => {
    expect(sidebar).toMatch(/YOUR TASK/);
  });

  it('falls back to the brief for a pack that has written no objective', () => {
    expect(sidebar).toMatch(/currentChallenge\.objective \|\| currentChallenge\.brief/);
  });

  it('does not print the brief twice when both exist', () => {
    // The scene is rendered only when the task line is a separate string.
    expect(sidebar).toMatch(/\{currentChallenge\.objective && \(/);
  });
});

describe('the validator reports a challenge with no task line', () => {
  it('names it, so a pack author is told rather than left to notice', async () => {
    const pack = PACKS['linux-fundamentals'];
    const stripped = {
      ...pack,
      challenges: pack.challenges.map((c, i) => (i === 0 ? { ...c, objective: undefined } : c))
    };
    const report = await validatePack(stripped);
    expect(report.unframedTasks.map(u => u.id)).toContain(pack.challenges[0].id);
  });

  it('finds nothing to report on the shipped packs', async () => {
    for (const pack of Object.values(PACKS)) {
      const report = await validatePack(pack);
      expect(report.unframedTasks).toEqual([]);
    }
  });
});

describe('the way back to the other courses looks like a control', () => {
  const app = read('src/App.jsx');

  it('says it opens something, and says so to a screen reader', () => {
    expect(app).toMatch(/aria-haspopup="dialog"/);
    expect(app).toMatch(/Choose a different course/);
  });
});

describe('a challenge starts where it says it starts', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

  it('applies setup.cwd when a challenge is selected, not only on resume', () => {
    expect(app).toMatch(/const standAtStartOf = \(challenge/);
    expect(app).toMatch(/standAtStartOf\(challenge, target\)/);
  });

  it('tells the student they were moved', () => {
    expect(app).toMatch(/This task starts in/);
  });

  // The declared start must exist, or selecting the challenge strands a student
  // in a directory the filesystem does not have.
  it('every declared start exists in its own pack filesystem', () => {
    const missing = [];
    for (const [packId, pack] of Object.entries(PACKS)) {
      for (const c of pack.challenges) {
        const start = c.setup?.cwd;
        if (!start) continue;
        const plat = c.platform || (pack.manifest.platforms?.length === 1 ? pack.manifest.platforms[0] : 'linux');
        const fs2 = pack.createFs(plat);
        if (!Object.prototype.hasOwnProperty.call(fs2, start)) missing.push(`${packId}/${c.id} → ${start}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the challenge list is navigation, not a second scroll region', () => {
  const sidebar = read('src/components/ChallengeSidebar.jsx');

  it('is closed until asked for', () => {
    expect(sidebar).toMatch(/const \[listOpen, setListOpen\] = useState\(false\)/);
    expect(sidebar).toMatch(/\{listOpen && \(/);
  });

  it('says where you are without opening', () => {
    expect(sidebar).toMatch(/Task \{currentIndex \+ 1\} of \{actChallenges\.length\}/);
  });

  it('moves to the next and previous task in one press', () => {
    expect(sidebar).toMatch(/const prevChallenge = actChallenges\[currentIndex - 1\]/);
    expect(sidebar).toMatch(/const nextChallenge = actChallenges\[currentIndex \+ 1\]/);
  });

  it('announces itself to a screen reader', () => {
    expect(sidebar).toMatch(/aria-expanded=\{listOpen\}/);
    expect(sidebar).toMatch(/aria-controls="challenge-list"/);
    expect(sidebar).toMatch(/role="progressbar"/);
  });

  it('closes when a task is chosen, so the brief is what is left', () => {
    expect(sidebar).toMatch(/setListOpen\(false\)/);
  });
});

describe('the navigator arrows are told apart by more than colour', () => {
  const sidebar = read('src/components/ChallengeSidebar.jsx');

  it('colours them by direction, in the palette the product already speaks', () => {
    expect(sidebar).toMatch(/text-term-cyan[\s\S]{0,400}ChevronLeft/);
    expect(sidebar).toMatch(/text-term-green[\s\S]{0,400}ChevronRight/);
  });

  // WCAG 1.4.1. The glyphs point opposite ways and each button names the task
  // it leads to, so the colour is a second signal rather than the only one.
  it('keeps the glyph and the spoken label doing the work', () => {
    expect(sidebar).toMatch(/aria-label=\{prevChallenge \? `Previous task: \$\{prevChallenge\.title\}`/);
    expect(sidebar).toMatch(/aria-label=\{nextChallenge \? `Next task: \$\{nextChallenge\.title\}`/);
  });

  // A dead end should read as absence, not as a faded instruction.
  it('drops a disabled arrow to neutral rather than dimming its colour', () => {
    const disabled = sidebar.match(/disabled:text-neutral-500/g) || [];
    expect(disabled.length).toBe(2);
  });

  it('never reuses amber here, which already means "worth revisiting"', () => {
    const nav = sidebar.slice(sidebar.indexOf('Previous task'), sidebar.indexOf('role="progressbar"'));
    expect(nav).not.toMatch(/term-amber/);
  });
});
