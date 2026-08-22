// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// BIOS-style boot loader for The Gauntlet

import React, { useState, useEffect, useCallback } from 'react';
import {
  Terminal, Cpu, HardDrive, Wifi, Key, Database, Shield,
  Check, Circle, Play, ArrowDownCircle, Activity
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { sounds } from '../utils/audio';

const WARREN_CHECKS = [
  { id: 'bios', label: 'GAUNTLET_BIOS v4.8 Integrity Check', icon: Cpu, duration: 250 },
  { id: 'shaft', label: 'Preparing Analyst Workstation', icon: ArrowDownCircle, duration: 300 },
  { id: 'vfs', label: 'Mounting Virtual Filesystem', icon: HardDrive, duration: 280 },
  { id: 'crossing', label: 'Linking WSL Bridge (/mnt/c)', icon: Wifi, duration: 320 },
  { id: 'crypto', label: 'Deriving HMAC Challenge Salts', icon: Key, duration: 240 },
  { id: 'vault', label: 'Forensic Vault Evidence Integrity Verified', icon: Database, duration: 260 },
  { id: 'sensors', label: 'Calibrating Sensor Suite', icon: Activity, duration: 280 },
  { id: 'auth', label: 'Analyst Terminal Clearance Initialized', icon: Shield, duration: 200 },
];

export const Boot = ({ onBootComplete, userHandle }) => {
  const [completedChecks, setCompletedChecks] = useState([]);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = [];
    let totalDuration = 0;

    timers.push(setTimeout(() => setCanSkip(true), 800));

    WARREN_CHECKS.forEach((check, index) => {
      timers.push(setTimeout(() => {
        setCurrentCheck(check.id);
        setProgress(Math.round((index / WARREN_CHECKS.length) * 100));
        sounds.playKeypress();
      }, totalDuration));

      totalDuration += check.duration;

      timers.push(setTimeout(() => {
        setCompletedChecks((prev) => [...prev, check.id]);
        setProgress(Math.round(((index + 1) / WARREN_CHECKS.length) * 100));
        if (index === WARREN_CHECKS.length - 1) {
          setCurrentCheck(null);
          setIsReady(true);
          sounds.playSuccess();
        }
      }, totalDuration));
    });

    return () => timers.forEach((id) => clearTimeout(id));
  }, []);

  const handleFinish = useCallback(() => {
    sounds.playSuccess();
    onBootComplete();
  }, [onBootComplete]);

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

  const clockText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
              <div className="text-lg font-bold tracking-wider text-green-400">THE GAUNTLET // BIOS v4.8</div>
              <div className="text-xs text-neutral-400">Forensics CLI 101 Training Network</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-term-green px-2 py-0.5 rounded bg-term-green-faint border border-term-green/30">
              SYSTEM CHECK
            </div>
            <div className="text-xs text-neutral-400 mt-1">{clockText}</div>
          </div>
        </div>

        {/* System initialization checks */}
        <div className="space-y-2 mb-6">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-300 mb-3 flex items-center gap-2">
            <Terminal size={14} className="text-term-green" /> Systems Diagnostic
          </div>

          <div className="grid grid-cols-1 gap-2 bg-term-gray/60 p-3 rounded border border-term-border">
            {WARREN_CHECKS.map((check) => {
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
            <span className="text-neutral-300">Boot Progress</span>
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
                ✓ All checks passed. Ready to enter.
              </span>
            ) : canSkip ? (
              <span className="text-neutral-400">Press ENTER or SPACE to skip...</span>
            ) : (
              <span className="text-neutral-400">Preparing workstation...</span>
            )}
          </div>

          <button
            onClick={handleFinish}
            disabled={!canSkip && !isReady}
            className={`px-5 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
              isReady
                ? 'bg-term-green text-term-black hover:bg-green-400 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            <Play size={12} fill="currentColor" />
            {isReady ? 'ENTER THE GAUNTLET' : 'SKIP'}
          </button>
        </div>
      </div>
    </div>
  );
};
