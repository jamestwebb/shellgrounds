#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The README's screenshot, rendered by a headless browser rather than taken off
// somebody's desktop.
//
// Two reasons it is a script and not a screengrab:
//
//   A desktop capture photographs whatever else is open — other windows, a
//   notification that fires mid-shot, the bookmarks bar. This repo is public,
//   so a frame ships forever. A headless render reads the page and nothing else.
//
//   A screenshot taken by hand is out of date the moment the UI moves, and
//   nobody notices, because a README image never fails a test. This one is
//   regenerated with one command.
//
//   npm run dev:local        # the app must be running on :3000
//   node scripts/screenshot.mjs
//
// It signs in through PRACTICE MODE on purpose. The handle gate renders a
// development panel carrying the class password and the instructor setup code,
// and that must never reach a public image. Practice mode never shows it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.SHOT_URL || 'http://127.0.0.1:3000';
const OUT = path.join(ROOT, 'docs/images/shellgrounds-terminal.png');

// Wide enough for the sidebar and the terminal to sit side by side, which is
// the whole point of the picture. Below 768 the app shows its mobile notice.
// A README image is looked at for about a second, so it must not be mostly
// empty terminal. 1600x900 keeps the sidebar and the terminal side by side and
// crops the dead space a taller frame leaves under the last output line.
const VIEWPORT = { width: 1600, height: 900 };

const step = (msg) => console.log('  ' + msg);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,          // a crisp image on a retina README
  reducedMotion: 'reduce'        // no half-finished animation in the frame
});
const page = await context.newPage();

// A blank frame is the classic failure here, and it fails silently.
page.on('pageerror', e => console.error('  PAGE ERROR:', e.message));

try {
  step(`opening ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });

  // The boot sequence runs first. Wait for what comes after it rather than
  // sleeping for a guessed number of seconds.
  step('waiting out the boot sequence');
  const guest = page.getByText(/Practise here without a handle/i);
  await guest.waitFor({ state: 'visible', timeout: 30_000 });

  step('entering practice mode (never the handle gate: it prints credentials)');
  await guest.click();

  step('waiting for the terminal');
  await page.waitForSelector('text=/YOUR TASK/i', { timeout: 20_000 });

  // Move off the first challenge so the navigator shows a real position and
  // both arrows are live, rather than a disabled one at the start of the act.
  step('advancing one task, so both navigator arrows are live');
  const next = page.getByRole('button', { name: /^Next task:/ });
  if (await next.count()) await next.first().click();

  // Two commands, not one. A terminal holding a single line looks like a
  // mock-up; a terminal that has been worked in looks like the thing itself.
  // `pwd` first because it is what a student actually does on arriving, and it
  // puts a second prompt on screen without giving away the graded answer.
  step('running commands');
  const input = page.locator('input[type="text"], textarea').first();
  await input.click();
  for (const line of ['pwd', 'ls']) {
    await input.type(line, { delay: 45 });
    await page.keyboard.press('Enter');
    // Grading is a round trip; wait for the answer rather than for a timer.
    await page.waitForTimeout(900);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT });
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  step(`wrote ${path.relative(ROOT, OUT)} (${kb} KB, ${VIEWPORT.width}x${VIEWPORT.height} @2x)`);
} finally {
  await browser.close();
}
