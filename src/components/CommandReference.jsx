// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Command Reference tab: searchable man pages for every real command in the game.
// Deliberately teaches the habit it assists: every entry shows how to get the
// same information inside a real shell (man <cmd> / --help).

import React, { useState } from 'react';
import { BookOpen, Search, TerminalSquare } from 'lucide-react';
import { MAN_PAGES, WINDOWS_HELP } from '../engine/help';

// Game-only tools are discovered in play (and the tracker man page carries a
// per-user flag) — the reference sticks to commands that exist on real systems,
// plus the two game mechanics every student needs.
const EXCLUDED = new Set(['tracker', 'scan', 'extract']);
const GAME_COMMANDS = new Set(['map', 'submit']);

const CommandCard = ({ cmd, page }) => (
  <div className="bg-term-black border border-term-border rounded-xl p-5 select-text cursor-text">
    <div className="flex items-start justify-between gap-3 mb-2">
      <h3 className="text-sm font-bold text-term-green font-mono">{cmd}</h3>
      {!GAME_COMMANDS.has(cmd) && (
        <span className="text-[10px] px-2 py-0.5 rounded bg-term-gray border border-term-border text-neutral-400 shrink-0 font-mono">
          real shell: man {cmd}
        </span>
      )}
      {GAME_COMMANDS.has(cmd) && (
        <span className="text-[10px] px-2 py-0.5 rounded bg-term-green-faint border border-term-green/30 text-term-green shrink-0 font-mono">
          game command
        </span>
      )}
    </div>

    <div className="text-xs text-neutral-300 font-mono mb-2">{page.name}</div>

    <div className="text-[11px] text-neutral-400 font-mono mb-3">
      <span className="text-neutral-500 uppercase tracking-wider text-[10px]">Synopsis: </span>
      <code className="text-cyan-300">{page.synopsis}</code>
    </div>

    <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap mb-3">{page.description}</p>

    {page.options && page.options.length > 0 && (
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Options</div>
        <div className="bg-term-gray rounded-lg border border-term-border p-2.5 space-y-1">
          {page.options.map((opt, i) => (
            <div key={i} className="text-[11px] font-mono text-neutral-300 whitespace-pre-wrap">{opt}</div>
          ))}
        </div>
      </div>
    )}

    {page.examples && page.examples.length > 0 && (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Examples</div>
        <div className="bg-term-gray rounded-lg border border-term-border p-2.5 space-y-1">
          {page.examples.map((ex, i) => (
            <div key={i} className="text-[11px] font-mono text-term-green/90 whitespace-pre-wrap">{ex}</div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export const CommandReference = () => {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const linuxEntries = Object.entries(MAN_PAGES)
    .filter(([cmd]) => !EXCLUDED.has(cmd))
    .filter(([cmd, page]) =>
      !query || cmd.includes(query) || page.name.toLowerCase().includes(query) || page.description.toLowerCase().includes(query)
    );
  const windowsEntries = Object.entries(WINDOWS_HELP)
    .filter(([cmd, text]) => !query || cmd.includes(query) || text.toLowerCase().includes(query));

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-term-border pb-4 select-none">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green">
              <BookOpen size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-green-400">COMMAND REFERENCE</h1>
              <p className="text-xs text-neutral-400">
                Every command in the game. In a real shell, get the same pages with <code className="text-term-green">man &lt;command&gt;</code> or <code className="text-term-green">&lt;command&gt; --help</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative select-none">
          <Search size={15} className="absolute left-3.5 top-3 text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands, e.g. grep, hidden, checksum..."
            className="w-full bg-term-black border border-term-border rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-term-green"
            spellCheck="false"
          />
        </div>

        {/* Linux commands */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 select-none">
            <TerminalSquare size={14} className="text-term-green" /> Linux ({linuxEntries.length})
          </div>
          {linuxEntries.length === 0 ? (
            <div className="text-xs text-neutral-500 p-4">No Linux commands match that search.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {linuxEntries.map(([cmd, page]) => (
                <CommandCard key={cmd} cmd={cmd} page={page} />
              ))}
            </div>
          )}
        </div>

        {/* Windows commands */}
        <div className="space-y-3 pb-8">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2 select-none">
            <TerminalSquare size={14} className="text-cyan-400" /> Windows CMD — Topside ({windowsEntries.length})
          </div>
          {windowsEntries.length === 0 ? (
            <div className="text-xs text-neutral-500 p-4">No Windows commands match that search.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {windowsEntries.map(([cmd, text]) => (
                <div key={cmd} className="bg-term-black border border-term-border rounded-xl p-5 select-text cursor-text">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-sm font-bold text-cyan-300 font-mono">{cmd}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-term-gray border border-term-border text-neutral-400 shrink-0 font-mono">
                      real shell: {cmd} /?
                    </span>
                  </div>
                  <pre className="text-[11px] text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed">{text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
