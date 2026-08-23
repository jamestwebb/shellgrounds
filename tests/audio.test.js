// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Sound must never be able to stop the terminal.
//
// audio.js implemented three methods. The terminal called five. The Enter
// handler read:
//
//     sounds.playEnter();          // TypeError: not a function
//     onExecuteCommand(input);     // never reached
//
// so pressing Enter did not fail to make a noise, it failed to run the command.
// A student typed `ls`, pressed Enter, and got nothing at all -- no output, no
// error, not even their own line echoed back -- and the only trace was a
// console message nobody in a classroom is going to open.
//
// The first test below is the one that would have caught it, and it costs
// nothing to run.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sounds, SOUND_METHODS } from '../src/utils/audio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every source file under src/, so no caller escapes the check. */
const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return sourceFiles(full);
  return /\.jsx?$/.test(e.name) ? [full] : [];
});

describe('every sound the app asks for exists', () => {
  const called = new Map();
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/sounds\.(play[A-Za-z]*)\s*\(/g)) {
      if (!called.has(m[1])) called.set(m[1], []);
      called.get(m[1]).push(path.relative(ROOT, file));
    }
  }

  it('finds the call sites at all, so an empty pass is not a pass', () => {
    expect(called.size).toBeGreaterThan(2);
  });

  it.each([...new Set([...called.keys()])])('%s is implemented', (method) => {
    expect(SOUND_METHODS, `called from ${called.get(method).join(', ')}`).toContain(method);
  });
});

describe('a sound can never break what it decorates', () => {
  it('does not throw for a method that does not exist', () => {
    expect(() => sounds.playSomethingNobodyWrote()).not.toThrow();
    expect(sounds.playSomethingNobodyWrote()).toBeUndefined();
  });

  // The real failure was a TypeError on the line above the one that runs the
  // command. Whatever the sound layer does, the next statement must run.
  it('lets the statement after it run', () => {
    let ran = false;
    expect(() => {
      sounds.playTypoedName();
      ran = true;
    }).not.toThrow();
    expect(ran).toBe(true);
  });

  it('still reports the real methods honestly', () => {
    expect(SOUND_METHODS).toContain('playKey');
    expect(SOUND_METHODS).toContain('playEnter');
    expect(SOUND_METHODS).toContain('playKeypress');
    expect(sounds.playNotReal).toBeInstanceOf(Function);
    expect(SOUND_METHODS).not.toContain('playNotReal');
  });

  // No AudioContext exists under Node. Every method has to survive that, which
  // is also what a locked-down school browser looks like.
  it('survives having no audio device at all', () => {
    for (const m of SOUND_METHODS) {
      expect(() => sounds[m](), m).not.toThrow();
    }
  });
});
