// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Terminal component: Accessible Simulated CLI shell with history, tab completion, and redirection

import React, { useRef, useEffect, useCallback } from 'react';
import { Terminal as TerminalIcon, CornerDownLeft, Sparkles, Trash2, MapPin } from 'lucide-react';
import { getTabCompletions } from '../engine/complete';
import { sounds } from '../utils/audio';

const FLAG_PATTERN = /(FLAG\{[A-Z2-7]{12}\})/g;

export const Terminal = ({
  platform = 'linux',
  cwd = '/home/analyst',
  user = 'student',
  host = 'sandbox',
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
  const [copiedFlag, setCopiedFlag] = React.useState(null);

  const copyFlag = (flag) => {
    navigator.clipboard?.writeText(flag).then(() => {
      setCopiedFlag(flag);
      setTimeout(() => setCopiedFlag(null), 2000);
    }).catch(() => {});
  };

  // Render FLAG{...} tokens as click-to-copy chips
  const renderOutputText = (text) => {
    if (!text || !text.includes('FLAG{')) return text;
    const parts = text.split(FLAG_PATTERN);
    return parts.map((part, idx) => {
      if (/^FLAG\{[A-Z2-7]{12}\}$/.test(part)) {
        const isCopied = copiedFlag === part;
        return (
          <button
            key={idx}
            onClick={(e) => { e.stopPropagation(); copyFlag(part); }}
            title="Click to copy this flag"
            className={`inline px-1 py-0.5 mx-0.5 rounded border font-bold cursor-pointer transition-all align-baseline ${
              isCopied
                ? 'bg-term-green text-term-black border-term-green'
                : 'bg-term-green-faint text-term-green border-term-green/40 hover:bg-term-green hover:text-term-black'
            }`}
          >
            {isCopied ? '✓ copied!' : part}
          </button>
        );
      }
      return part;
    });
  };

  // Auto-scroll to bottom on output
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    if (stickToBottomRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalHistory]);

  const handleScroll = () => {
    const el = terminalRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Keep focus in terminal input
  const focusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput, cwd, platform]);

  // Tab completion
  const handleTabComplete = (e) => {
    e.preventDefault();
    sounds.playKey();

    const isWindows = platform === 'windows';
    const result = getTabCompletions(currentInput, cwd, fs, isWindows);

    if (result.type === 'command' || result.type === 'path') {
      if (result.matches.length === 1) {
        const match = result.matches[0];
        const parts = currentInput.trim().split(/\s+/);

        if (result.type === 'command') {
          setCurrentInput(match + ' ');
        } else {
          parts.pop();
          const prefix = parts.length > 0 ? parts.join(' ') + ' ' : '';
          const lastArg = currentInput.trim().split(/\s+/).pop() || '';
          const sep = isWindows ? '\\' : '/';
          const lastSlash = lastArg.lastIndexOf(sep);

          if (lastSlash !== -1) {
            const dirPart = lastArg.substring(0, lastSlash + 1);
            setCurrentInput(prefix + dirPart + match);
          } else {
            setCurrentInput(prefix + match);
          }
        }
      } else if (result.matches.length > 1) {
        onExecuteCommand(null, {
          isTabList: true,
          matches: result.matches,
          promptLine: currentInput
        });
      }
    }
  };

  // Key navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      handleTabComplete(e);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = currentInput.trim();

      if (cmd) {
        commandHistoryRef.current.push(cmd);
        historyIndexRef.current = commandHistoryRef.current.length;
      }

      sounds.playEnter();
      onExecuteCommand(currentInput);
      setCurrentInput('');
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistoryRef.current.length === 0) return;

      if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
        setCurrentInput(commandHistoryRef.current[historyIndexRef.current] || '');
        sounds.playKey();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndexRef.current < commandHistoryRef.current.length - 1) {
        historyIndexRef.current += 1;
        setCurrentInput(commandHistoryRef.current[historyIndexRef.current] || '');
        sounds.playKey();
      } else {
        historyIndexRef.current = commandHistoryRef.current.length;
        setCurrentInput('');
      }
      return;
    }

    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      onExecuteCommand('^C', { isCancel: true });
      setCurrentInput('');
      return;
    }

    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      onClearHistory();
      return;
    }

    sounds.playKey();
  };

  const isLinux = platform === 'linux';

  return (
    <div
      onClick={focusInput}
      className="flex-1 flex flex-col bg-term-black border border-term-border rounded-lg shadow-2xl overflow-hidden relative cursor-text font-mono select-text"
      role="region"
      aria-label="Interactive CLI Terminal"
    >
      {/* Optional CRT Scanlines Effect */}
      {scanlines && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] z-20 opacity-30" />
      )}

      {/* Terminal Top Window Bar */}
      <div className="bg-term-gray border-b border-term-border px-4 py-2 flex items-center justify-between z-10 select-none">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs font-bold text-neutral-400 pl-2 flex items-center gap-1.5">
            <TerminalIcon size={12} className={isLinux ? 'text-term-green' : 'text-amber-400'} />
            {isLinux ? `${user.toUpperCase()}@${host.toUpperCase()} TTY1` : `Command Prompt — C:\\Windows\\System32\\cmd.exe`}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenMap && isLinux && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenMap(); }}
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30 transition-all flex items-center gap-1 cursor-pointer"
              title="View Topographical Map"
            >
              <MapPin size={11} /> MAP
            </button>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onToggleCoach(); }}
            className={`text-[11px] font-bold px-2 py-0.5 rounded border transition-all flex items-center gap-1 cursor-pointer ${
              coachEnabled
                ? 'text-cyan-400 bg-cyan-950/30 border-cyan-500/40'
                : 'text-neutral-500 bg-term-gray border-term-border hover:text-neutral-300'
            }`}
            title="Toggle Coach Explanations"
          >
            <Sparkles size={11} /> COACH {coachEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onClearHistory(); }}
            className="text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-800 p-1 rounded transition-all cursor-pointer"
            title="Clear Screen (Ctrl+L)"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Terminal Screen / Output Log */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        aria-live="polite"
        className="flex-1 p-4 overflow-y-auto space-y-2 text-xs md:text-sm leading-relaxed z-10"
      >
        {terminalHistory.map((item, index) => (
          <div key={index} className="space-y-0.5">
            {item.type === 'input' ? (
              <div className="flex items-start gap-2 text-xs md:text-sm font-semibold">
                {isLinux ? (
                  <>
                    <span className="text-green-400 shrink-0">{user}@{host}</span>
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
                {item.isCoach ? `» ${item.text}` : renderOutputText(item.text)}
              </div>
            )}
          </div>
        ))}

        {/* Current Command Input Line */}
        <div className="flex items-center gap-2 text-xs md:text-sm font-semibold pt-1">
          {isLinux ? (
            <>
              <span className="text-green-400 shrink-0">{user}@{host}</span>
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
            aria-label="Shell input"
          />
        </div>
      </div>
    </div>
  );
};
