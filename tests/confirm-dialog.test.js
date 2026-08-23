// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Spending points should be asked in the page, and asked accessibly.
//
// `window.confirm` looked wrong: unstyleable, prefixed with "localhost says",
// and it drops the student out of the world the rest of the screen builds. But
// it is also genuinely accessible -- focus trapped, Escape cancels, announced,
// focus restored -- and the two hand-rolled overlays already in this codebase
// (SimulationBoundary, PackSelector) set role="dialog" and aria-modal and then
// do none of those things. Replacing a native confirm with a third copy of
// that would have been an accessibility regression in nicer clothes.
//
// The replacement therefore uses <dialog>.showModal(), which is the platform's
// own modal and brings all four behaviours with it. These tests hold that
// choice in place, because the tempting "fix" is always a styled <div>.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dialog = read('src/components/ConfirmDialog.jsx');
const sidebar = read('src/components/ChallengeSidebar.jsx');
const css = read('src/index.css');

describe('nothing asks through the browser any more', () => {
  it('no source file calls window.confirm, alert or prompt', () => {
    const offenders = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      if (!/\.jsx?$/.test(e.name)) return;
      const code = stripComments(fs.readFileSync(full, 'utf8'));
      if (/\bwindow\.(confirm|alert|prompt)\s*\(/.test(code)) offenders.push(path.relative(ROOT, full));
    });
    walk(path.join(ROOT, 'src'));
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

describe('the replacement is a real modal, not a styled div', () => {
  it('uses the platform dialog element and opens it modally', () => {
    const code = stripComments(dialog);
    expect(code).toMatch(/<dialog/);
    expect(code).toMatch(/showModal\(\)/);
  });

  // Each of these is a behaviour window.confirm had for free. Losing any one of
  // them makes this a downgrade.
  it('cancels on Escape and tells the caller', () => {
    const code = stripComments(dialog);
    expect(code).toMatch(/addEventListener\('cancel'/);
    expect(code).toMatch(/onCancel\?\.\(\)/);
  });

  it('closes on a backdrop click without swallowing clicks inside', () => {
    expect(stripComments(dialog)).toMatch(/e\.target === ref\.current/);
  });

  it('is labelled by its own heading', () => {
    expect(dialog).toMatch(/aria-labelledby="confirm-dialog-title"/);
    expect(dialog).toMatch(/id="confirm-dialog-title"/);
  });

  // window.confirm defaults to OK. This one spends something the student
  // cannot get back, so the safe choice holds focus instead.
  it('opens with focus on the cancelling button', () => {
    expect(stripComments(dialog)).toMatch(/cancelRef\.current\?\.focus\(\)/);
  });

  it('dims through ::backdrop rather than a fixed overlay', () => {
    expect(css).toMatch(/\.sg-dialog::backdrop/);
    expect(stripComments(dialog)).not.toMatch(/fixed inset-0/);
  });
});

describe('the hint dialog shows the arithmetic, not just a price', () => {
  it('a free hint opens with no dialog at all', () => {
    expect(stripComments(sidebar)).toMatch(/if \(cost > 0\)/);
  });

  it('works out what is left to earn, and does not go negative', () => {
    const code = stripComments(sidebar);
    expect(code).toMatch(/hintArithmetic/);
    expect(code).toMatch(/Math\.max\(0, worth - spentAlready - cost\)/);
  });

  it('freezes the cost at the moment of the click', () => {
    expect(stripComments(sidebar)).toMatch(/setPendingHint\(\{ index: hintsRevealedCount, cost \}\)/);
  });

  it('only opens the hint after a yes', () => {
    const code = stripComments(sidebar);
    // The confirm path clears the question first, then spends.
    expect(code).toMatch(/setPendingHint\(null\);\s*await openHintNow\(\)/);
  });
});
