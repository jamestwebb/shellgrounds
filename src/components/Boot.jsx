// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Boot screen for Shellgrounds. The checks are engine-neutral on purpose:
// this screen runs for every pack, so it must not speak one pack's fiction.

import { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Cpu, HardDrive, Wifi, Key, Database, Shield,
  Check, Play, ArrowDownCircle, Activity
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { sounds } from '../utils/audio';

// The words a student reads while they wait. This used to open with "Checking
// system integrity" and "Verifying challenge integrity", which is the voice of
// a system arming itself. The audience is somebody who is nervous about the
// terminal, and the first thing they read should sound like a workshop being
// opened up rather than a perimeter being secured.
const BOOT_CHECKS = [
  { id: 'integrity', label: 'Opening up', icon: Cpu, duration: 250 },
  { id: 'workstation', label: 'Setting out your workstation', icon: ArrowDownCircle, duration: 300 },
  { id: 'vfs', label: 'Laying out the practice files', icon: HardDrive, duration: 280 },
  { id: 'pack', label: 'Bringing in your course', icon: Database, duration: 320 },
  { id: 'flags', label: 'Setting aside your own finds', icon: Key, duration: 240 },
  { id: 'verify', label: 'Checking everything is solvable', icon: Shield, duration: 260 },
  { id: 'board', label: 'Saying hello to the leaderboard', icon: Wifi, duration: 280 },
  { id: 'ready', label: 'Ready when you are', icon: Activity, duration: 200 },
];

// ── Shown in full once per device ───────────────────────────────────────────
//
// Welcome and the pack briefing are each shown once and then get out of the
// way; that is the rule this product states about its own explanations, and
// the boot sequence was the one screen exempt from it. Two and a half seconds
// of startup checks, on every mount, including every reload during a lesson.
//
// This flag is kept in localStorage rather than on the server, for two reasons.
// Boot runs before a session exists, so there is no token to authenticate the
// seen endpoint with -- the request could not be made at the moment it is
// needed. And per-device is the right grain anyway: this is a curtain going up
// on a machine, not a lesson learned by an account. A student on a school
// machine in the morning and their own laptop at night gets the full sequence
// once on each, which is correct; the briefing they have read stays read.
//
// Every access is wrapped, because a private window, a locked-down school
// profile, or blocked site data make localStorage throw rather than return
// nothing, and a start screen that will not render because it could not read a
// preference is a far worse failure than one animation too many.
const BOOT_SEEN_KEY = 'shellgrounds.bootSeen';

/** True when this browser has already watched the full sequence. */
export function hasSeenBoot() {
  try {
    return window.localStorage.getItem(BOOT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberBootSeen() {
  try {
    window.localStorage.setItem(BOOT_SEEN_KEY, '1');
  } catch {
    /* Not remembered. The full sequence plays again next time, and nothing else
       about the product changes. */
  }
}

export const Boot = ({ onComplete, _userHandle, packName = 'Shellgrounds', brief = false }) => {
  const [completedChecks, setCompletedChecks] = useState([]);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (brief) return undefined;
    const timers = [];
    let totalDuration = 0;

    timers.push(setTimeout(() => setCanSkip(true), 800));

    BOOT_CHECKS.forEach((check, index) => {
      timers.push(setTimeout(() => {
        setCurrentCheck(check.id);
        setProgress(Math.round((index / BOOT_CHECKS.length) * 100));
        sounds.playKeypress();
      }, totalDuration));

      totalDuration += check.duration;

      timers.push(setTimeout(() => {
        setCompletedChecks((prev) => [...prev, check.id]);
        setProgress(Math.round(((index + 1) / BOOT_CHECKS.length) * 100));
        if (index === BOOT_CHECKS.length - 1) {
          setCurrentCheck(null);
          setIsReady(true);
          sounds.playSuccess();
        }
      }, totalDuration));
    });

    return () => timers.forEach((id) => clearTimeout(id));
  }, [brief]);

  // App.jsx has passed this prop under both names at different times. Accept
  // either, and never throw on the button that is the only way out of here.
  // One name for one thing. This accepted `onBootComplete` too, while the
  // only caller passed `onComplete` — so the boot screen's single exit threw.
  const finish = onComplete;

  const handleFinish = useCallback(() => {
    sounds.playSuccess();
    if (typeof finish === 'function') finish();
  }, [finish]);

  // Enter/Space key skip
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (canSkip && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) {
        e.preventDefault();
        handleFinish();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [canSkip, handleFinish]);

  // The short version. Long enough to be a curtain rather than a flicker, short
  // enough that nobody waits on it, and Enter still cuts it short.
  useEffect(() => {
    if (!brief) return undefined;
    setCanSkip(true);
    const id = setTimeout(handleFinish, 700);
    return () => clearTimeout(id);
  }, [brief, handleFinish]);

  const clockText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (brief) {
    return (
      <div className="fixed inset-0 bg-term-void text-term-green flex items-center justify-center p-4 font-mono select-none z-50">
        <div className="flex items-center gap-3 text-sm">
          <BrandMark size={26} />
          <span className="text-green-400 font-bold tracking-wider">Shellgrounds</span>
          <span className="text-neutral-400">opening {packName}…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-term-void text-term-green flex items-center justify-center p-4 font-mono select-none z-50">
      {/* Background scanline ambient texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-term-green-faint/10 via-transparent to-transparent pointer-events-none" />

      <div className="max-w-2xl w-full bg-term-black border border-term-border rounded-lg shadow-2xl p-6 relative overflow-hidden backdrop-blur-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-term-border pb-4 mb-6">
          <div className="flex items-center gap-3">
            <BrandMark size={28} />
            <div>
              <div className="text-lg font-bold tracking-wider text-green-400">Shellgrounds</div>
              <div className="text-xs text-neutral-400">{packName}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-term-green px-2 py-0.5 rounded bg-term-green-faint border border-term-green/30">
              Getting ready
            </div>
            <div className="text-xs text-neutral-400 mt-1">{clockText}</div>
          </div>
        </div>

        {/* System initialization checks */}
        <div className="space-y-2 mb-6">
          <div className="text-xs font-bold tracking-widest text-neutral-300 mb-3 flex items-center gap-2">
            <Terminal size={14} className="text-term-green" /> Startup checks
          </div>

          <div className="grid grid-cols-1 gap-2 bg-term-gray/60 p-3 rounded border border-term-border">
            {BOOT_CHECKS.map((check) => {
              const Icon = check.icon;
              const isCompleted = completedChecks.includes(check.id);
              const isCurrent = currentCheck === check.id;

              return (
                <div
                  key={check.id}
                  className={`flex items-center justify-between text-xs py-1 px-2 rounded transition-colors ${
                    isCurrent ? 'bg-term-green-faint text-white font-medium' : isCompleted ? 'text-neutral-300' : 'text-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={14} className={isCompleted ? 'text-term-green' : isCurrent ? 'text-white animate-pulse' : 'text-neutral-400'} />
                    <span>{check.label}</span>
                  </div>
                  <div>
                    {isCompleted ? (
                      <span className="text-term-green font-bold flex items-center gap-1">
                        [OK] <Check size={12} />
                      </span>
                    ) : isCurrent ? (
                      <span className="text-term-amber animate-pulse font-bold">[SYNC...]</span>
                    ) : (
                      <span className="text-neutral-400">[WAIT]</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-neutral-300">Starting up</span>
            <span className="text-term-green font-bold">{progress}%</span>
          </div>
          <div className="h-2 bg-neutral-900 rounded-full overflow-hidden border border-term-border">
            <div
              className="h-full bg-term-green transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Footer info & Enter Button */}
        <div className="flex items-center justify-between pt-4 border-t border-term-border">
          <div className="text-xs text-neutral-300">
            {isReady ? (
              <span className="text-term-green font-medium flex items-center gap-1">
                ✓ All checks passed. Press ENTER when you are ready.
              </span>
            ) : canSkip ? (
              <span className="text-neutral-400">Press ENTER or SPACE to skip ahead.</span>
            ) : (
              <span className="text-neutral-400">Preparing your workstation...</span>
            )}
          </div>

          <button
            onClick={handleFinish}
            disabled={!canSkip && !isReady}
            className={`px-5 py-2 rounded text-xs font-bold tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              isReady
                ? 'bg-term-green text-term-black hover:bg-green-400 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            <Play size={12} fill="currentColor" />
            {isReady ? 'Start' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
};
