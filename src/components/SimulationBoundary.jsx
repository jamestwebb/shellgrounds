// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The Reference tab: every command this terminal simulates, which of its flags
// are simulated, and which real tools it deliberately does not pretend to be.
//
// ── Why there is one of these and not two ──────────────────────────────────
//
// There were two. This screen, derived from the command registry, and
// src/components/CommandReference.jsx, a searchable man-page screen derived
// from a hand-written src/engine/help.js. Two views of one subject from two
// sources, which is the arrangement that guarantees one of them is wrong: the
// hand-written one documented the student's home directory as /home/analyst, a
// path no pack has ever contained and which had been removed everywhere else.
// A reference that is confidently wrong is worse than no reference, because a
// student who cannot find a file believes the reference and doubts themselves.
//
// So the hand-written source and its screen were deleted, and this one --
// which cannot go stale, because it reads the registry the shell itself
// executes from -- took over the two ideas worth keeping from it: the card
// layout, and the badge on every entry saying how to get the same page out of
// a real shell. That badge is the point of the whole screen. This terminal is
// a place to practise, and the habit being taught is `man grep`, not "open the
// Shellgrounds reference".
//
// ── Why it is a tab and not a modal ───────────────────────────────────────
//
// It used to open as an overlay over the terminal. A reference is read in the
// middle of doing something, next to the thing being done, and an overlay both
// hides the work and has to be dismissed before anything can be typed. It is a
// reading surface students come back to, so it sits in the tab row with the
// terminal and the class view, and going back is one click on Terminal.

import { useState } from 'react';
import { BookOpen, Search, TerminalSquare, Globe } from 'lucide-react';
import { registry } from '../../packages/engine/commands/registry.js';
import { REAL_LINUX, REAL_WINDOWS } from '../../packages/engine/unknown-command.js';

/**
 * How to read the same page on a real machine. Every entry on this screen comes
 * from the command registry, and everything in that registry is a command that
 * exists outside this browser -- so the badge is unconditional rather than
 * carrying an exception list that would have to be maintained by hand.
 */
const realShellHelp = (name, platform) =>
  platform === 'windows' ? `${name} /?` : `man ${name}`;

const CommandCard = ({ cmd, platform }) => {
  const flags = Object.entries(cmd.flags || {});
  const implemented = flags.filter(([, f]) => f.status === 'implemented');
  const notSimulated = flags.filter(([, f]) => f.status === 'notSimulated');
  const dash = platform === 'windows' ? '/' : '-';

  return (
    <div className="bg-term-black border border-term-border rounded-xl p-4 space-y-2.5 select-text cursor-text">
      <div className="flex items-start justify-between gap-3 border-b border-term-border pb-2">
        <h3 className="text-sm font-bold text-term-green font-mono">{cmd.name}</h3>
        <span className="text-[10px] px-2 py-0.5 rounded bg-term-gray border border-term-border text-neutral-300 shrink-0 font-mono">
          real shell: {realShellHelp(cmd.name, platform)}
        </span>
      </div>

      <div className="font-mono text-xs text-neutral-200 bg-term-gray px-2 py-1 rounded border border-term-border">
        {cmd.usage}
      </div>

      {cmd.description && (
        <p className="text-xs text-neutral-300 leading-relaxed">{cmd.description}</p>
      )}

      {/* Which flags work and which are recognised but do nothing. The word
          "Simulated" / "Not simulated" carries the meaning; the colour only
          agrees with it, because a student reading in greyscale or with a
          colour vision deficiency has to get the same answer. */}
      {(implemented.length > 0 || notSimulated.length > 0) && (
        <div className="space-y-1">
          {implemented.length > 0 && (
            <div className="text-[11px] text-neutral-200 flex items-center gap-1.5 flex-wrap">
              <span className="text-term-green font-semibold">Simulated:</span>
              {implemented.map(([f]) => (
                <span key={f} className="font-mono bg-term-green-faint text-green-300 px-1 rounded border border-term-green/40">
                  {dash}{f}
                </span>
              ))}
            </div>
          )}
          {notSimulated.length > 0 && (
            <div className="text-[11px] text-neutral-300 flex items-center gap-1.5 flex-wrap">
              <span className="text-term-amber font-semibold">Not simulated:</span>
              {notSimulated.map(([f]) => (
                <span
                  key={f}
                  className="font-mono bg-amber-950/60 text-amber-200 px-1 rounded border border-amber-700/60"
                  title="This terminal understands the flag and does not act on it"
                >
                  {dash}{f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function SimulationBoundary({ defaultPlatform = 'linux' }) {
  const [platform, setPlatform] = useState(defaultPlatform === 'windows' ? 'windows' : 'linux');
  const [search, setSearch] = useState('');

  const boundary = registry.getBoundaryReport();
  const query = search.trim().toLowerCase();
  const all = platform === 'windows' ? boundary.windows : boundary.linux;
  const commands = all.filter(c =>
    !query || c.name.toLowerCase().includes(query) || (c.description || '').toLowerCase().includes(query)
  );

  const realTools = platform === 'windows'
    ? Object.keys(REAL_WINDOWS).sort()
    : Object.keys(REAL_LINUX).sort();

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-term-border pb-4 select-none">
          <div className="p-2.5 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green">
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-green-400">Command reference</h1>
            <p className="text-xs text-neutral-300">
              Every command this terminal simulates, and every flag of it that does or does not
              do something. Nothing here is hidden from you.
            </p>
          </div>
        </div>

        {/* Platform choice and search */}
        <div className="flex flex-wrap gap-4 items-center justify-between select-none">
          <div
            className="flex bg-term-black p-1 rounded-lg border border-term-border"
            role="group"
            aria-label="Which shell to show"
          >
            <button
              onClick={() => setPlatform('linux')}
              aria-pressed={platform === 'linux'}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
                platform === 'linux'
                  ? 'bg-term-green text-term-black'
                  : 'text-neutral-300 hover:text-white hover:bg-term-gray'
              }`}
            >
              Linux (Bash)
            </button>
            <button
              onClick={() => setPlatform('windows')}
              aria-pressed={platform === 'windows'}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition ${
                platform === 'windows'
                  ? 'bg-cyan-500 text-term-black'
                  : 'text-neutral-300 hover:text-white hover:bg-term-gray'
              }`}
            >
              Windows (CMD)
            </button>
          </div>

          <div className="relative flex-1 min-w-[14rem] max-w-sm">
            <Search size={15} className="absolute left-3.5 top-3 text-neutral-400" />
            <label className="sr-only" htmlFor="reference-search">Search commands</label>
            <input
              id="reference-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commands, e.g. grep, copy, hash..."
              spellCheck="false"
              className="w-full bg-term-black border border-term-border rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-term-green"
            />
          </div>
        </div>

        {/* The simulated commands */}
        <div className="space-y-3">
          <div className="text-xs font-bold tracking-wider text-neutral-300 flex items-center gap-2 select-none">
            <TerminalSquare size={14} className={platform === 'windows' ? 'text-cyan-400' : 'text-term-green'} />
            Simulated here ({commands.length}{query ? ` of ${all.length}` : ''})
          </div>

          {commands.length === 0 ? (
            <div className="text-xs text-neutral-300 p-4 bg-term-black border border-term-border rounded-xl">
              No simulated command matches “{search.trim()}”. It may still be a real command —
              type it in the terminal and the shell will say what it does on a real system.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {commands.map(cmd => (
                <CommandCard key={cmd.name} cmd={cmd} platform={platform} />
              ))}
            </div>
          )}
        </div>

        {/* The other half of an honest boundary: what is real and is not here. */}
        <div className="p-4 bg-term-black border border-term-border rounded-xl space-y-2 mb-8">
          <h2 className="text-xs font-bold text-neutral-200 tracking-wider flex items-center gap-2">
            <Globe size={14} className="text-neutral-300" />
            Real commands this terminal does not simulate
          </h2>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Shellgrounds never pretends one of these does not exist. Type any of them and the
            shell tells you what it really does on a real machine, and that it is not simulated
            here.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {realTools.map(name => (
              <span
                key={name}
                className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-term-gray border border-term-border text-neutral-300"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
