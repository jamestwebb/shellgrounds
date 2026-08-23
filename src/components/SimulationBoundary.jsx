// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Interactive Simulation Boundary Reference Modal / View

import React, { useState } from 'react';
import { registry } from '../../packages/engine/commands/registry.js';
import { REAL_LINUX, REAL_WINDOWS, REAL_POWERSHELL } from '../../packages/engine/unknown-command.js';

export default function SimulationBoundary({ isOpen, onClose, defaultPlatform = 'linux' }) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const boundaryData = registry.getBoundaryReport();
  const commands = (platform === 'windows' ? boundaryData.windows : boundaryData.linux)
    .filter(c => {
      const q = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q));
    });

  const unsimulatedList = platform === 'windows'
    ? Object.keys(REAL_WINDOWS).sort()
    : Object.keys(REAL_LINUX).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="boundary-title">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📋</span>
            <div>
              <h2 id="boundary-title" className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Simulation Boundary & Command Reference
              </h2>
              <p className="text-xs text-slate-400">
                See exactly which commands, and which flags, this browser terminal simulates. Nothing here is hidden from you.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close Reference Modal"
          >
            ✕
          </button>
        </div>

        {/* Platform Toggle & Search Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setPlatform('linux')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${platform === 'linux' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🐧 Linux (Bash)
            </button>
            <button
              onClick={() => setPlatform('windows')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${platform === 'windows' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              🪟 Windows (CMD)
            </button>
          </div>

          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search simulated commands..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Command Cards List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {commands.map((cmd) => {
              const flags = Object.entries(cmd.flags || {});
              const implFlags = flags.filter(([_, f]) => f.status === 'implemented');
              const unsimFlags = flags.filter(([_, f]) => f.status === 'notSimulated');

              return (
                <div key={cmd.name} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                    <span className="font-mono font-bold text-emerald-400 text-sm">{cmd.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {cmd.platforms.join(', ')}
                    </span>
                  </div>

                  <div className="font-mono text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                    {cmd.usage}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {cmd.description}
                  </p>

                  {/* Flag breakdown */}
                  <div className="space-y-1 pt-1">
                    {implFlags.length > 0 && (
                      <div className="text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
                        <span className="text-emerald-400 font-semibold">Simulated:</span>
                        {implFlags.map(([fName]) => (
                          <span key={fName} className="font-mono bg-emerald-950/60 text-emerald-300 px-1 rounded border border-emerald-800/50">
                            {platform === 'windows' ? `/${fName}` : `-${fName}`}
                          </span>
                        ))}
                      </div>
                    )}

                    {unsimFlags.length > 0 && (
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                        <span className="text-amber-400 font-semibold">Not simulated:</span>
                        {unsimFlags.map(([fName]) => (
                          <span key={fName} className="font-mono bg-amber-950/60 text-amber-300 px-1 rounded border border-amber-800/50" title="Flag recognized but not simulated in this proving ground">
                            {platform === 'windows' ? `/${fName}` : `-${fName}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {commands.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No simulated command matches "{searchTerm}".
            </div>
          )}

          {/* Real world external tools banner */}
          <div className="mt-6 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-xs font-bold text-slate-300 tracking-wider flex items-center gap-2">
              <span>🌐</span> Real-World System Commands (Out of Simulator Scope)
            </h3>
            <p className="text-xs text-slate-400">
              Shellgrounds never pretends. If you run one of these tools, the shell tells you what it really does on a real system instead of acting as though it does not exist:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {unsimulatedList.slice(0, 30).map(tName => (
                <span key={tName} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  {tName}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            Close Reference
          </button>
        </div>

      </div>
    </div>
  );
}
