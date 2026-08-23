// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Curriculum Content Pack Selector Modal

import React from 'react';
import { listPacks } from '../../packs/index.js';

export default function PackSelector({ isOpen, onClose, currentPackId, onSelectPack, enabledPackIds = null }) {
  if (!isOpen) return null;

  // enabledPackIds comes from the server, where an instructor can change it
  // without a redeploy. Null means the answer has not arrived (or did not
  // arrive at all), and the bundled list stands — a student mid-course must
  // not lose the switcher because one request was slow.
  //
  // The pack they are currently in always stays listed. Being unable to see
  // the name of the course you are looking at reads as a broken page, and the
  // server is the thing that actually refuses a switched-off pack anyway.
  const packs = Array.isArray(enabledPackIds)
    ? listPacks().filter(p => enabledPackIds.includes(p.id) || p.id === currentPackId)
    : listPacks();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pack-select-title">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📦</span>
            <div>
              <h2 id="pack-select-title" className="text-lg font-bold text-slate-100">
                Challenge packs
              </h2>
              <p className="text-xs text-slate-400">
                Each pack is a full course: its own filesystem, its own acts, its own challenges. Pick one to load it.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Pack Grid */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {packs.map(pack => {
            const isSelected = pack.id === currentPackId;
            return (
              <div
                key={pack.id}
                onClick={() => {
                  onSelectPack(pack.id);
                  onClose();
                }}
                className={`p-4 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-emerald-950/30 border-emerald-500/80 shadow-lg shadow-emerald-950/20'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">{pack.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      v{pack.version}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/50">
                        Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400">
                    {pack.acts.length} acts • {pack.badges.length} badges • {pack.platforms.join(', ')}
                  </p>
                </div>

                <button
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold self-start sm:self-center transition ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {isSelected ? 'Loaded' : 'Load this pack'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
