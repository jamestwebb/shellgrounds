// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// System Map component for The Gauntlet: visual & ASCII filesystem overview

import React from 'react';
import { MapPin, Navigation, Compass, HardDrive, Shield } from 'lucide-react';
import { BrandMark } from './BrandMark';

export const WarrenMap = ({ currentCwd = '/home/analyst', onNavigate }) => {
  const isCurrent = (path) => currentCwd === path || currentCwd.startsWith(path + '/');

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200 select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-term-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green">
              <Compass size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-green-400">
                SYSTEM MAP // THE GAUNTLET
              </h1>
              <p className="text-xs text-neutral-400">
                Filesystem Survey · Forensics CLI 101
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-neutral-400">Current Position</div>
            <div className="text-term-green font-bold flex items-center gap-1">
              <MapPin size={12} /> {currentCwd}
            </div>
          </div>
        </div>

        {/* Visual Map Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* WSL Bridge */}
          <div className={`p-5 rounded-xl border transition-all ${
            isCurrent('/mnt/c')
              ? 'bg-purple-950/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
              : 'bg-term-black border-term-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive size={14} /> WSL Bridge (Windows side)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-900/40 text-purple-300 border border-purple-700/50">
                /mnt/c
              </span>
            </div>
            <p className="text-xs text-neutral-300 mb-3">
              The Windows drive <code>C:\Users\analyst</code> is mounted here, reachable from the Linux shell.
            </p>
            <div className="text-[11px] bg-term-gray p-2.5 rounded border border-term-border space-y-1 text-neutral-400">
              <div>📁 <code>/mnt/c/Users/analyst/Desktop/CASE_FILES</code></div>
              <div className="text-purple-300">↳ <code>intake.txt</code> (Case 001 Dossier)</div>
            </div>
          </div>

          {/* Home */}
          <div className={`p-5 rounded-xl border transition-all ${
            isCurrent('/home/analyst') && !isCurrent('/home/analyst/training') && !isCurrent('/home/analyst/Documents')
              ? 'bg-term-green-faint/30 border-term-green shadow-[0_0_15px_rgba(34,197,94,0.2)]'
              : 'bg-term-black border-term-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={14} /> Home Base
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-term-green-faint text-term-green border border-term-green/40">
                /home/analyst ( ~ )
              </span>
            </div>
            <p className="text-xs text-neutral-300 mb-3">
              Your starting directory. Every relative path begins from wherever you stand.
            </p>
            <div className="text-[11px] bg-term-gray p-2.5 rounded border border-term-border space-y-1 text-neutral-400">
              <div>📄 <code>welcome.txt</code> · <code>.bashrc</code></div>
              <div className="text-term-green">↳ <code>.stash</code> (hidden file)</div>
            </div>
          </div>

          {/* Training Area */}
          <div className={`p-5 rounded-xl border transition-all ${
            isCurrent('/home/analyst/training')
              ? 'bg-cyan-950/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
              : 'bg-term-black border-term-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                <Navigation size={14} /> Training Area
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                /home/analyst/training
              </span>
            </div>
            <p className="text-xs text-neutral-300 mb-3">
              Practice directories for navigation drills — parents, children, and siblings.
            </p>
            <div className="text-[11px] bg-term-gray p-2.5 rounded border border-term-border space-y-1 text-neutral-400">
              <div>📁 <code>training/level_1</code> · <code>checkpoint_alpha.txt</code></div>
              <div>📁 <code>training/level_2</code> · <code>checkpoint_beta.txt</code></div>
              <div>📁 <code>training/archive/2025</code></div>
            </div>
          </div>

          {/* Evidence & Logs */}
          <div className={`p-5 rounded-xl border transition-all ${
            isCurrent('/home/analyst/evidence') || isCurrent('/home/analyst/Documents')
              ? 'bg-amber-950/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
              : 'bg-term-black border-term-border'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive size={14} /> Evidence Vault & Logs
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                Documents / evidence
              </span>
            </div>
            <p className="text-xs text-neutral-300 mb-3">
              Seized disk images, access timelines, raw containers, and binary executables.
            </p>
            <div className="text-[11px] bg-term-gray p-2.5 rounded border border-term-border space-y-1 text-neutral-400">
              <div>📄 <code>access.log</code> · <code>secrets.txt</code> · <code>logs.txt</code></div>
              <div>💾 <code>mystery_file</code> · <code>binary_data</code> · <code>suspect_drive.raw</code></div>
            </div>
          </div>
        </div>

        {/* Full ASCII Tree */}
        <div className="bg-term-black border border-term-border rounded-xl p-5 shadow-xl">
          <div className="text-xs font-bold uppercase tracking-wider text-green-400 mb-3 flex items-center gap-2">
            <BrandMark size={16} /> Filesystem Cross-Section
          </div>
          <pre className="text-xs md:text-sm text-term-green/90 overflow-x-auto p-4 bg-term-void rounded-lg border border-term-border/60 leading-tight">
{`================================================================================
              FILESYSTEM MAP — THE GAUNTLET · FORENSICS CLI 101
================================================================================

  [WINDOWS SIDE: C:\\Users\\analyst]
                  │
                  ▼  (WSL bridge: /mnt/c/Users/analyst)
  ═══════════════════════════════ LINUX ════════════════════════════════════════
                  │
        [HOME: /home/analyst]  ( ~ )
             │          │              │
    ┌────────┴─────┐    │              └────────────────┐
    │              │    │                               │
[training/]        │ [Documents/]                  [evidence/]
    ├─ level_1     │    ├─ case_notes.txt              ├─ mystery_file (magic bytes)
    ├─ level_2     │    ├─ access.log                  ├─ binary_data (strings)
    │    └─ deeper │    ├─ secrets.txt (grep)          ├─ evidence.img (md5)
    └─ archive     │    ├─ logs.txt (grep -i)          └─ suspect_drive.raw (scan)
                   │    └─ security_events.csv
                   │
              [/var/log/]
                   ├─ syslog
                   └─ sensor_audit.log (find)

================================================================================
Command Reference: pwd (where am I) | ls -la (reveal) | cd .. (up) | cd ~ (home)
================================================================================`}
          </pre>
        </div>
      </div>
    </div>
  );
};
