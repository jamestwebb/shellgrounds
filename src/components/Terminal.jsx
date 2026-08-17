// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Terminal component: Simulated CLI shell with history, tab completion, and redirection

import React, { useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, CornerDownLeft, Sparkles, Trash2, MapPin } from 'lucide-react';
import { getTabCompletions } from '../engine/complete';
import { sounds } from '../utils/audio';

export const Terminal = ({
  platform = 'linux',
  cwd = '/home/analyst',
  terminalHistory = [],
  currentInput = '',
  setCurrentInput,
  onExecuteCommand,
  onClearHistory,
  onOpenMap,
  fs = {},
  scanlines = true,
  disabled = false,
  coachEnabled = true,
  onToggleCoach = () => {}
}) => {
  const inputRef = useRef(null);
  const terminalRef = useRef(null);
  const commandHistoryRef = useRef([]);
  const historyIndexRef = useRef(-1);

  // Auto-scroll to bottom on output update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalHistory, currentInput]);

  // Focus input when clicking anywhere in terminal
  const handleContainerClick = () => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = useCallback((e) => {
    if (disabled) return;

    if (e.key === 'Enter') {
      const trimmed = currentInput.trim();
      if (trimmed) {
        commandHistoryRef.current.push(trimmed);
        historyIndexRef.current = commandHistoryRef.current.length;
        sounds.playKeypress();
        onExecuteCommand(trimmed);
        setCurrentInput('');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndexRef.current > 0) {
        historyIndexRef.current--;
        setCurrentInput(commandHistoryRef.current[historyIndexRef.current] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
        historyIndexRef.current++;
        setCurrentInput(commandHistoryRef.current[historyIndexRef.current] || '');
      } else {
        historyIndexRef.current = commandHistoryRef.current.length;
        setCurrentInput('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      sounds.playKeypress();

      const completions = getTabCompletions(currentInput, cwd, fs, platform === 'windows');
      if (!completions || completions.matches.length === 0) {
        return;
      }

      if (completions.matches.length === 1) {
        const match = completions.matches[0];
        const parts = currentInput.trim().split(/\s+/);

        if (completions.type === 'command') {
          setCurrentInput(match + ' ');
        } else {
          const lastArg = parts[parts.length - 1] || '';
          let completed;

          if (completions.isWindows) {
            if (lastArg.includes('\\')) {
              const lastSlash = lastArg.lastIndexOf('\\');
              completed = lastArg.substring(0, lastSlash + 1) + match;
            } else {
              completed = match;
            }
          } else {
            if (lastArg.includes('/')) {
              const lastSlash = lastArg.lastIndexOf('/');
              completed = lastArg.substring(0, lastSlash + 1) + match;
            } else {
              completed = match;
            }
          }

          const sep = completions.isWindows ? '\\' : '/';
          const fullPath = completions.searchDir
            ? `${completions.searchDir}${sep}${match}`
            : (completions.isWindows ? `${cwd}\\${match}` : (cwd === '/' ? `/${match}` : `${cwd}/${match}`));

          const isDir = fs[fullPath]?.type === 'dir';

          if (parts.length === 1 && currentInput.endsWith(' ')) {
            setCurrentInput(currentInput + completed + (isDir ? sep : ' '));
          } else if (parts.length > 1) {
            parts[parts.length - 1] = completed + (isDir ? sep : '');
            setCurrentInput(parts.join(' ') + (isDir ? '' : ' '));
          } else {
            setCurrentInput(completed + (isDir ? sep : ' '));
          }
        }
      } else {
        // Multi-match: show available options
        const matchText = completions.matches.join('    ');
        onExecuteCommand(null, { showCompletions: matchText, input: currentInput });
      }
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      onClearHistory();
    }
  }, [currentInput, cwd, fs, platform, onExecuteCommand, onClearHistory, setCurrentInput, disabled]);

  const isLinux = platform === 'linux';

  return (
    <div
      className="flex-1 bg-term-void flex flex-col h-full overflow-hidden relative font-mono text-sm select-text border border-term-border rounded-xl shadow-2xl"
      onClick={handleContainerClick}
    >
      {/* CRT Scanline Overlay */}
      {scanlines && (
        <div className="absolute inset-0 pointer-events-none z-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-40" />
      )}

      {/* Terminal Title Bar */}
      <div className="flex-none bg-term-panel border-b border-term-border px-4 py-2.5 flex items-center justify-between z-10 select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-600" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-600" />
            <div className="w-3 h-3 rounded-full bg-green-500/80 border border-green-600" />
          </div>
          <span className="text-xs font-bold tracking-wider text-green-400 flex items-center gap-1.5 ml-2">
            <TerminalIcon size={13} className="text-term-green" />
            {isLinux ? 'GAUNTLET TTY1 (/dev/pts/0)' : 'TOPSIDE CMD (C:\\Windows\\System32\\cmd.exe)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCoach(); }}
            className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer border ${
              coachEnabled
                ? 'bg-cyan-950/40 text-cyan-300 border-cyan-700/50'
                : 'bg-term-gray text-neutral-500 border-term-border'
            }`}
            title={coachEnabled
              ? 'Coach ON: explains each command and error. Click to turn off.'
              : 'Coach OFF: no explanations. Click to turn on.'}
          >
            COACH {coachEnabled ? 'ON' : 'OFF'}
          </button>
          {isLinux && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMap(); }}
              className="px-2 py-1 rounded bg-term-green-faint text-term-green hover:bg-term-green hover:text-term-black text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-term-green/30"
              title="Show Filesystem Map (or type 'map')"
            >
              <MapPin size={11} /> MAP
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClearHistory(); }}
            className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-term-gray transition-all cursor-pointer"
            title="Clear Screen (Ctrl+L)"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Output Stream */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 text-neutral-200 scrollbar-thin scrollbar-thumb-neutral-800"
      >
        {terminalHistory.length === 0 && (
          <div className="text-neutral-400 space-y-1 select-none mb-4">
            <div className="text-term-green font-bold">
              {isLinux ? '== THE GAUNTLET — FORENSICS CLI 101 ==' : '== TOPSIDE WINDOWS CMD SIMULATOR v1.0 =='}
            </div>
            <div className="text-xs">
              {isLinux
                ? 'Type "help" for available commands. Type "map" to view the filesystem map.'
                : 'Microsoft Windows [Version 10.0.19045.3693]. Type "help" for commands.'}
            </div>
            <div className="text-xs text-neutral-400">
              Recover flags and submit them with: <code className="text-term-green font-bold">submit FLAG{'{...}'}</code>
            </div>
            <div className="border-b border-term-border pt-1 opacity-50" />
          </div>
        )}

        {terminalHistory.map((item, idx) => (
          <div key={idx} className="leading-relaxed">
            {item.type === 'input' ? (
              <div className="flex items-start gap-2 text-xs md:text-sm font-semibold">
                {isLinux ? (
                  <>
                    <span className="text-green-400 shrink-0">analyst@lab</span>
                    <span className="text-neutral-400">:</span>
                    <span className="text-cyan-400 shrink-0">{item.cwd || cwd}</span>
                    <span className="text-neutral-400 shrink-0">$</span>
                  </>
                ) : (
                  <span className="text-amber-400 shrink-0">{item.cwd || cwd}&gt;</span>
                )}
                <span className="text-white break-all">{item.text}</span>
              </div>
            ) : (
              <div
                className={`whitespace-pre-wrap pl-0 break-words text-xs md:text-sm ${
                  item.isCoach
                    ? 'text-cyan-400/80 italic'
                    : item.isDim
                      ? 'text-neutral-500 italic'
                      : item.isError
                        ? 'text-red-400'
                        : item.isSuccess
                          ? 'text-term-green font-semibold'
                          : 'text-neutral-300'
                }`}
              >
                {item.isCoach ? `» ${item.text}` : item.text}
              </div>
            )}
          </div>
        ))}

        {/* Current Command Input Line */}
        <div className="flex items-center gap-2 text-xs md:text-sm font-semibold pt-1">
          {isLinux ? (
            <>
              <span className="text-green-400 shrink-0">analyst@lab</span>
              <span className="text-neutral-400">:</span>
              <span className="text-cyan-400 shrink-0">{cwd}</span>
              <span className="text-neutral-400 shrink-0">$</span>
            </>
          ) : (
            <span className="text-amber-400 shrink-0">{cwd}&gt;</span>
          )}

          <input
            ref={inputRef}
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className="flex-1 bg-transparent text-white outline-none border-none p-0 focus:ring-0 font-mono text-xs md:text-sm caret-term-green"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck="false"
          />
        </div>
      </div>
    </div>
  );
};
