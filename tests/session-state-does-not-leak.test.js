// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// One student's work must not be on screen under another student's name.
//
// App is never unmounted, so the effect that loads a session runs once. Every
// other entry point -- signing in, signing out, leaving practice mode -- has to
// reset the per-student state itself, and none of them did.
//
// Two consequences, and the second is worse than it looks:
//
//   A school computer passes from one class to the next. The solve map, the
//   opened hints and the terminal scrollback all survived a sign-out, so the
//   next student saw the last one's progress -- and the scrollback still held
//   the previous student's finds, which are generated from their handle and
//   are theirs alone.
//
//   `handleChallengeSuccess` refuses to submit anything already in the solve
//   map, on the sound reasoning that it is already paid for. A student who
//   practised first and then signed in therefore could never score the
//   challenges they had practised. Not a wrong score: no score, ever.
//
// This reads the source, because the defect is in which state a handler
// forgets to touch, and a handler that forgets is still a valid function.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Source with comments removed, so a check never matches its own explanation. */
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

/** The body of a `const name = ...` handler, up to its closing brace. */
function bodyOf(name) {
  const at = app.indexOf(`const ${name} =`);
  expect(at, `App must define ${name}`).toBeGreaterThan(-1);
  const tail = app.slice(at);
  const end = tail.indexOf('\n  };');
  return tail.slice(0, end < 0 ? 3000 : end);
}

/** State that belongs to one student and must not survive them. */
const PER_STUDENT = [
  ['setSolvesMap', 'which challenges are already scored'],
  ['setUnlockedHints', 'which hints have been paid for'],
  ['setTerminalHistory', "the scrollback, which holds the student's own finds"],
  ['setFlagMap', 'the per-handle finds themselves'],
  ['setLinuxFs', 'the Linux filesystem, which has those finds baked into it'],
  ['setWindowsFs', 'the Windows filesystem, for the same reason'],
  ['setInstalledPackages', 'packages installed in this shell'],
  ['setSelectedChallengeId', 'where in the course they had got to']
];

/** Every way into the app that changes who is sitting there. */
const DOORS = ['handleLogout', 'handleAuthenticated', 'handleStartPractice'];

describe('per-student state does not outlive its student', () => {
  for (const [setter, what] of PER_STUDENT) {
    it(`the reset clears ${what}`, () => {
      expect(bodyOf('resetForNewStudent')).toContain(setter);
    });
  }

  for (const door of DOORS) {
    it(`${door} runs that reset`, () => {
      expect(bodyOf(door)).toContain('resetForNewStudent()');
    });
  }

  it('the reset also drops the instructor preview', () => {
    const body = bodyOf('resetForNewStudent');
    expect(body).toContain('setInstructorPreview(false)');
    expect(body).toContain('setDemoPreview(null)');
  });

  it('the demo turns the preview on AFTER the reset, not before', () => {
    // The reset deliberately switches the preview off. Setting it first and
    // resetting second turned it straight back off, which silently removed
    // the demo's instructor view.
    const start = app.indexOf('handleStartPractice();');
    const on = app.indexOf('setInstructorPreview(true)');
    expect(start).toBeGreaterThan(-1);
    expect(on).toBeGreaterThan(-1);
    expect(on).toBeGreaterThan(start);
  });

  it('signing in leaves practice mode', () => {
    expect(bodyOf('handleAuthenticated')).toContain('setIsPracticeMode(false)');
  });

  it('signing in fills the solve map from the server, not from what was there', () => {
    const body = bodyOf('handleAuthenticated');
    expect(body).toMatch(/setSolvesMap\(solveMapFrom\(/);
    expect(body).toMatch(/setUnlockedHints\(hintMapFrom\(/);
  });

  it('reads the hints the server reports, on both paths', () => {
    // The server has always sent `hintsOpened`; the client used to discard it,
    // so after a reload a hint the student owned asked to be bought again.
    // The definition reads `hintMapFrom = (`, so only call sites match here.
    expect(app).toMatch(/hintsOpened/);
    expect(app.match(/hintMapFrom\(/g)?.length || 0).toBeGreaterThanOrEqual(2);
  });

  it('does not celebrate a solve the server says is already theirs', () => {
    expect(bodyOf('handleChallengeSuccess')).toMatch(/res\.alreadySolved/);
  });

  it('a change of course clears what the old course installed', () => {
    expect(bodyOf('handleSelectPack')).toContain('setInstalledPackages');
  });
});
