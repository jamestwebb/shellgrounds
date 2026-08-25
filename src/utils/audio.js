// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Synthetic retro audio effects using Web Audio API (zero external assets needed)
//
// ── Sound is decoration, and decoration must never be load-bearing ──────────
//
// This file exported three methods. The terminal called five. `playKey` and
// `playEnter` were never written, and `sounds.playEnter()` sat on the line
// directly above `onExecuteCommand(currentInput)` in the Enter handler:
//
//     sounds.playEnter();          // TypeError: not a function
//     onExecuteCommand(input);     // never reached
//
// So the terminal did not fail to make a noise. It stopped running commands
// entirely. A student typed `ls`, pressed Enter, and nothing happened at all --
// no output, no error, no echo -- because a missing sound effect threw before
// the shell was ever asked to do anything.
//
// Two defences, because either alone is insufficient:
//
//   The missing methods are written, below.
//
//   The exported object no longer throws for a name it does not have. Any
//   `play*` that does not exist is a silent no-op, so the next typo in this
//   API costs a sound effect rather than the product. A test still fails on
//   it, so a typo is caught rather than hidden -- silence in development and
//   safety in a classroom are not in conflict.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  }

  playKeypress() {
    if (!this.enabled) return;
    this.init(); // Lazy: AudioContext creation requires a user gesture, and every play call happens on one
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 + Math.random() * 200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.015, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch {
      // Ignore audio failure
    }
  }

  /** A single key. The most frequent sound here, so it stays quiet and short. */
  playKey() {
    this.playKeypress();
  }

  /** Enter: lower and a little longer than a key, so a line reads as committed. */
  playEnter() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.07);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.07);
    } catch {
      // Ignore audio failure
    }
  }

  playSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.25);
      });
    } catch {
      // Ignore
    }
  }

  playError() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Ignore
    }
  }
}

/**
 * The shared sound manager, wrapped so that asking for a sound it does not have
 * returns a no-op instead of throwing. See the note at the top of this file:
 * these calls sit in front of the code that actually runs the terminal, and a
 * TypeError there costs a student their whole session.
 */
export const sounds = new Proxy(new SoundManager(), {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (value !== undefined) return typeof value === 'function' ? value.bind(target) : value;
    if (typeof prop === 'string' && prop.startsWith('play')) return () => {};
    return undefined;
  }
});

/** Every sound this module really implements. The test compares callers to it. */
export const SOUND_METHODS = Object.getOwnPropertyNames(SoundManager.prototype)
  .filter(name => name.startsWith('play'));
