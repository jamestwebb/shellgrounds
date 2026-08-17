// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// The Gauntlet — Forensics CLI 101 — a standalone Netlify CLI challenge site for cyber forensics courses

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Terminal as TerminalIcon, Trophy, MapPin, Shield, LogOut,
  Volume2, VolumeX, Monitor, Moon, Sun, Award, Zap, HelpCircle, BookOpen
} from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { Boot } from './components/Boot';
import { Gate } from './components/Gate';
import { Terminal } from './components/Terminal';
import { ChallengeSidebar } from './components/ChallengeSidebar';
import { Leaderboard } from './components/Leaderboard';
import { WarrenMap } from './components/WarrenMap';
import { AdminOverview } from './components/AdminOverview';
import { CommandReference } from './components/CommandReference';
import { BadgeCelebration } from './components/BadgeCelebration';
import { KeyboardGuard } from './components/KeyboardGuard';

import { createWarrenFilesystem } from './engine/fs.warren';
import { createTopsideFilesystem } from './engine/fs.topside';
import { runPipeline } from './engine/pipeline';
import { ACT_DEFINITIONS, BADGE_DEFINITIONS, CHALLENGES, isActUnlockedFor } from './data/challenges';
import { fetchSession, fetchManifest, submitFlagApi, getAuthToken, setAuthToken } from './utils/api';
import { injectFlagsIntoVFS, replaceFlagTokens } from './utils/vfs-injector';
import { explainCommand } from './engine/coach';
import { sounds } from './utils/audio';

// A command that "ran" but errored must not satisfy a challenge (kept in sync with submit-flag.js)
const ERROR_MARKERS = /command not found|not available in this simulator|that is the (Linux|Windows) name|No such file|missing operand|Not a directory|Is a directory|cannot access|is not recognized|cannot find/i;

// Badges implied by an existing solve set — used to seed state silently on
// session load so returning players don't get re-celebrated with confetti.
const computeEarnedBadges = (solves) => {
  const solvedSet = new Set(Object.keys(solves));
  return BADGE_DEFINITIONS.filter(b => {
    if (!b.act) return false;
    const actChallenges = CHALLENGES.filter(c => c.act === b.act);
    const solvedInAct = actChallenges.filter(c => solvedSet.has(c.id));
    return actChallenges.length > 0 && solvedInAct.length >= Math.ceil(actChallenges.length * 0.8);
  }).map(b => b.id);
};

// Where a returning player should land: their first unsolved challenge on any
// platform (a player deep in the Windows quest resumes there, not at Act I)
const resumeSelection = (solves) => {
  const linux = CHALLENGES.find(c => (c.platform || 'linux') === 'linux' && !solves[c.id]);
  return linux || CHALLENGES.find(c => !solves[c.id]);
};

const MANIFEST_WARNING = {
  type: 'output',
  text: '[!] WARNING: Could not load your personal flag set from HQ. Refresh the page before hunting flags.',
  isError: true
};

export default function App() {
  // Navigation & Session States
  const [viewState, setViewState] = useState(() => {
    // If returning user has token, go to boot; otherwise gate
    return 'boot';
  });
  const [activeTab, setActiveTab] = useState('terminal'); // 'terminal' | 'leaderboard' | 'map' | 'admin'
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Terminal & Filesystem State
  const [platform, setPlatform] = useState('linux'); // 'linux' | 'windows'
  const [cwd, setCwd] = useState('/home/analyst');
  const [linuxFs, setLinuxFs] = useState(() => createWarrenFilesystem());
  const [windowsFs, setWindowsFs] = useState(() => createTopsideFilesystem());
  const [installedPackages, setInstalledPackages] = useState(new Set());
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState('');

  // Challenge Progression State
  const [activeActId, setActiveActId] = useState(1);
  const [selectedChallengeId, setSelectedChallengeId] = useState('act1-pwd');
  const [flagMap, setFlagMap] = useState({}); // challengeId -> per-user flag (from server manifest)
  const [unlockedHints, setUnlockedHints] = useState({}); // challengeId -> number of hints revealed
  const [solvesMap, setSolvesMap] = useState({}); // challengeId -> { points, hintPenalty, netPoints, solvedAt }
  // Derived, never stored: a second source of truth would drift under concurrent submissions
  const totalScore = useMemo(
    () => Object.values(solvesMap).reduce((sum, s) => sum + (s.netPoints || 0), 0),
    [solvesMap]
  );
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [newBadge, setNewBadge] = useState(null);

  // Settings
  const [scanlines, setScanlines] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [coachEnabled, setCoachEnabled] = useState(true);
  const coachCountsRef = useRef({}); // command -> times a success explainer was shown

  // Active filesystem reference
  const activeFs = platform === 'linux' ? linuxFs : windowsFs;

  // Hint reveals persist per handle so a refresh neither hides paid hints
  // nor quietly resets their penalties.
  const loadStoredHints = (handle) => {
    try {
      return JSON.parse(localStorage.getItem(`gauntlet_hints_${handle}`)) || {};
    } catch {
      return {};
    }
  };
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const setUnlockedHintsPersist = useCallback((updater) => {
    setUnlockedHints(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const handle = sessionRef.current?.handle;
      if (handle) {
        try { localStorage.setItem(`gauntlet_hints_${handle}`, JSON.stringify(next)); } catch { /* storage full/blocked */ }
      }
      return next;
    });
  }, []);

  // 1. Initial Session Load
  useEffect(() => {
    const init = async () => {
      setLoadingSession(true);
      const token = getAuthToken();
      if (token) {
        try {
          const sess = await fetchSession();
          if (sess && sess.success) {
            setSession(sess);
            setUnlockedHints(loadStoredHints(sess.handle));
            const map = {};
            (sess.solves || []).forEach(s => {
              map[s.challengeId] = s;
            });
            setSolvesMap(map);
            setEarnedBadges(computeEarnedBadges(map)); // silent — no confetti replay
            const resume = resumeSelection(map);
            if (resume) {
              setActiveActId(resume.act);
              setSelectedChallengeId(resume.id);
              if (resume.platform === 'windows') {
                setPlatform('windows');
                setCwd('C:\\Users\\Analyst');
              }
            }

            // Fetch manifest and splice flags into VFS
            const manifest = await fetchManifest();
            const serverFlags = manifest.flags || {};
            const linuxResult = injectFlagsIntoVFS(createWarrenFilesystem(), sess.handle, serverFlags);
            const windowsResult = injectFlagsIntoVFS(createTopsideFilesystem(), sess.handle, serverFlags);
            setLinuxFs(linuxResult.fs);
            setWindowsFs(windowsResult.fs);
            setFlagMap({ ...linuxResult.flagMap, ...windowsResult.flagMap });
            if (Object.keys(serverFlags).length === 0) {
              setTerminalHistory([MANIFEST_WARNING]);
            }
          }
        } catch (err) {
          console.error('Session load error:', err);
        }
      }
      setLoadingSession(false);
    };
    init();
  }, []);

  // Sync sound settings
  useEffect(() => {
    sounds.enabled = soundEnabled;
  }, [soundEnabled]);

  // Check and award badges
  const checkBadges = useCallback((currentSolves) => {
    const solvedSet = new Set(Object.keys(currentSolves));
    const newlyEarned = [];

    BADGE_DEFINITIONS.forEach(badge => {
      if (earnedBadges.includes(badge.id)) return;

      let earned = false;
      if (badge.act) {
        const actChallenges = CHALLENGES.filter(c => c.act === badge.act);
        const solvedInAct = actChallenges.filter(c => solvedSet.has(c.id));
        if (actChallenges.length > 0 && solvedInAct.length >= Math.ceil(actChallenges.length * 0.8)) {
          earned = true;
        }
      }

      if (earned) {
        newlyEarned.push(badge);
      }
    });

    if (newlyEarned.length > 0) {
      const newIds = newlyEarned.map(b => b.id);
      setEarnedBadges(prev => [...prev, ...newIds]);
      setNewBadge(newlyEarned[0]);
    }
  }, [earnedBadges]);

  // Badges react to the solve map itself, so every solve path (sidebar, terminal
  // submit, auto-solve) is covered without threading the updated map around.
  useEffect(() => {
    checkBadges(solvesMap);
  }, [solvesMap, checkBadges]);

  // Handle successful authentication
  const handleAuthenticated = async (handle, token) => {
    // Registration already succeeded and the token is stored: from here on,
    // NEVER throw — a manifest/session blip must not strand the player on the
    // Gate where re-registering errors with "already claimed".
    setAuthToken(token);
    setUnlockedHints(loadStoredHints(handle));

    try {
      const manifest = await fetchManifest();
      const serverFlags = manifest.flags || {};
      const linuxResult = injectFlagsIntoVFS(createWarrenFilesystem(), handle, serverFlags);
      const windowsResult = injectFlagsIntoVFS(createTopsideFilesystem(), handle, serverFlags);
      setLinuxFs(linuxResult.fs);
      setWindowsFs(windowsResult.fs);
      setFlagMap({ ...linuxResult.flagMap, ...windowsResult.flagMap });
      if (Object.keys(serverFlags).length === 0) {
        setTerminalHistory([MANIFEST_WARNING]);
      }
    } catch (err) {
      console.error('Manifest load error:', err);
      setTerminalHistory([MANIFEST_WARNING]);
    }

    // isAdmin and any existing solves come from the server, never from local guesses
    let sess = null;
    try {
      sess = await fetchSession();
    } catch (err) {
      console.error('Session fetch error after registration:', err);
    }
    const map = {};
    (sess?.solves || []).forEach(s => {
      map[s.challengeId] = s;
    });
    setSolvesMap(map);
    setEarnedBadges(computeEarnedBadges(map));
    const resume = resumeSelection(map);
    if (resume) {
      setActiveActId(resume.act);
      setSelectedChallengeId(resume.id);
      if (resume.platform === 'windows') {
        setPlatform('windows');
        setCwd('C:\\Users\\Analyst');
      }
    }

    setSession({
      handle,
      token,
      isAdmin: sess?.isAdmin || false,
      solves: sess?.solves || [],
      totalScore: sess?.totalScore || 0
    });
    setViewState('warren');
  };

  // Submit flag handler
  const handleFlagSubmit = async (challengeId, flagText, hintsUsed = 0, commandText = '', submitCwd = undefined) => {
    try {
      // The per-challenge hint map lets the server charge the penalty against
      // whichever challenge the flag actually matches, not the selected one.
      // submitCwd lets the server replay the command from where it really ran.
      const res = await submitFlagApi(challengeId, flagText, hintsUsed, commandText, unlockedHints, submitCwd);
      if (res.success) {
        sounds.playSuccess();
        // The server resolves which challenge a flag actually belongs to.
        // Functional update: concurrent submissions (terminal auto-solve racing a
        // sidebar submit) must not clobber each other via a stale closure, and a
        // repeat solve must not overwrite the original entry with 0 points.
        const solvedId = res.challengeId || challengeId;
        setSolvesMap(prev => {
          if (res.alreadySolved && prev[solvedId]) return prev;
          return {
            ...prev,
            [solvedId]: {
              challengeId: solvedId,
              points: res.basePoints || 20,
              hintPenalty: res.hintPenalty || 0,
              netPoints: res.alreadySolved
                ? Math.max(0, (res.basePoints || 0) - (res.hintPenalty || 0))
                : (res.pointsAwarded || 0),
              solvedAt: new Date().toISOString()
            }
          };
        });

        return {
          success: true,
          successMessage: res.successMessage,
          pointsAwarded: res.pointsAwarded,
          challengeId: solvedId,
          challengeTitle: res.challengeTitle,
          alreadySolved: res.alreadySolved
        };
      } else {
        sounds.playError();
        return { success: false, error: res.error || 'Incorrect flag' };
      }
    } catch (err) {
      sounds.playError();
      return { success: false, error: err.message || 'Submission failed' };
    }
  };

  // After a terminal-driven solve, move the sidebar to the next unsolved challenge
  // so students never hunt for what comes next. Only fires when the current
  // selection is the solved challenge or is itself already solved.
  const advanceAfterSolve = useCallback((solvedId) => {
    const solved = CHALLENGES.find(c => c.id === solvedId);
    if (!solved) return;
    const isSolvedNow = (id) => id === solvedId || !!solvesMap[id];
    if (selectedChallengeId !== solvedId && !isSolvedNow(selectedChallengeId)) return;
    const actList = CHALLENGES.filter(c => c.act === solved.act);
    let next = actList.find(c => !isSolvedNow(c.id));
    if (!next && solved.act < 5) {
      next = CHALLENGES.find(c =>
        c.act === solved.act + 1 &&
        (c.platform || 'linux') === platform &&
        !isSolvedNow(c.id)
      );
    }
    if (next) {
      setActiveActId(next.act);
      setSelectedChallengeId(next.id);
    }
  }, [solvesMap, selectedChallengeId, platform]);

  // Execute terminal command handler
  const handleExecuteCommand = useCallback(async (input, options = {}) => {
    if (options.showCompletions) {
      setTerminalHistory(prev => [
        ...prev,
        { type: 'input', text: options.input, cwd },
        { type: 'output', text: options.showCompletions }
      ]);
      return;
    }

    if (!input || !input.trim()) return;

    const trimmed = input.trim();

    // Run command through pipeline engine
    const res = runPipeline(trimmed, cwd, activeFs, platform, {
      installedPackages,
      session
    });

    // Update packages if newly installed
    if (res.installedPackage) {
      setInstalledPackages(prev => {
        const updated = new Set(prev);
        updated.add(res.installedPackage);
        return updated;
      });
    }

    // Handle clear screen
    if (res.clear) {
      setTerminalHistory([]);
      setCwd(res.newCwd);
      return;
    }

    // Update VFS and CWD
    if (platform === 'linux') {
      setLinuxFs(res.fs);
    } else {
      setWindowsFs(res.fs);
    }
    setCwd(res.newCwd);

    // Append to terminal history. Command output can carry [[FLAG:id]] tokens
    // (e.g. from `tracker` and `extract`) — resolve them with the user's flag map.
    const outputText = replaceFlagTokens(res.output, flagMap);
    const historyItems = [
      { type: 'input', text: trimmed, cwd },
      ...(outputText ? [{ type: 'output', text: outputText, isError: res.hasError }] : [])
    ];

    // Explicit null feedback: silence is indistinguishable from a freeze for novices
    if (!outputText && !res.hasError && !res.submitFlag) {
      historyItems.push({
        type: 'output',
        text: '(no output — in a shell, silence usually means success)',
        isDim: true
      });
    }

    // Coach line: explain what just happened. Errors are always explained;
    // success explanations fade out after the second use of a command.
    if (coachEnabled) {
      const tip = explainCommand(trimmed, res, platform, cwd);
      if (tip) {
        const cmdKey = trimmed.split(/\s+/)[0].toLowerCase();
        let show = true;
        if (!res.hasError) {
          coachCountsRef.current[cmdKey] = (coachCountsRef.current[cmdKey] || 0) + 1;
          show = coachCountsRef.current[cmdKey] <= 2;
        }
        if (show) {
          historyItems.push({ type: 'output', text: tip, isCoach: true });
        }
      }
    }
    setTerminalHistory(prev => [...prev, ...historyItems]);

    // Handle in-terminal 'submit' command. The server matches the flag against
    // every challenge, so it does not matter which one is selected in the sidebar.
    if (res.submitFlag) {
      const subResult = await handleFlagSubmit(
        selectedChallengeId,
        res.submitFlag,
        unlockedHints[selectedChallengeId] || 0
      );
      if (subResult.success) {
        const solvedTitle = subResult.challengeTitle
          || CHALLENGES.find(c => c.id === subResult.challengeId)?.title
          || 'challenge';
        const already = subResult.alreadySolved ? ' (already solved — no new XP)' : '';
        setTerminalHistory(prev => [
          ...prev,
          {
            type: 'output',
            text: `[+] SUCCESS: Flag accepted for '${solvedTitle}'! (+${subResult.pointsAwarded} XP)${already}\n${subResult.successMessage || ''}`,
            isSuccess: true
          }
        ]);
        advanceAfterSolve(subResult.challengeId);
      } else {
        setTerminalHistory(prev => [
          ...prev,
          {
            type: 'output',
            text: `[-] REJECTED: ${subResult.error || 'Incorrect flag string.'}`,
            isError: true
          }
        ]);
      }
    }

    // Command- and state-kind challenges score no matter which challenge is
    // selected in the sidebar: the executed command is tested against the first
    // unsolved matching challenge on this platform (in act order).
    if (!res.hasError && !ERROR_MARKERS.test(res.output || '')) {
      // Mirrors the server's act gating: never auto-submit into a locked act
      const solvedIds = new Set(Object.keys(solvesMap));
      const actUnlocked = (actId) =>
        isActUnlockedFor(ACT_DEFINITIONS.find(a => a.id === actId), solvedIds, CHALLENGES);
      const candidate = CHALLENGES.find(c => {
        if (solvesMap[c.id]) return false;
        if ((c.platform || 'linux') !== platform) return false;
        if (!actUnlocked(c.act)) return false;
        if (c.success.kind === 'command') {
          return !!c.success.matchRegex && new RegExp(c.success.matchRegex, 'i').test(trimmed);
        }
        if (c.success.kind === 'state') {
          return typeof c.success.check === 'function' && !!c.success.check(res.fs);
        }
        return false;
      });
      if (candidate) {
        const subResult = await handleFlagSubmit(candidate.id, '', unlockedHints[candidate.id] || 0, trimmed, cwd);
        if (!subResult.success) {
          // Never fail silently: the student's command LOOKED right locally
          setTerminalHistory(prev => [
            ...prev,
            {
              type: 'output',
              text: `[!] '${candidate.title}' matched your command, but validation failed: ${subResult.error || 'unknown error'}. Try again, or refresh the page if this repeats.`,
              isError: true
            }
          ]);
        }
        if (subResult.success) {
          setTerminalHistory(prev => [
            ...prev,
            {
              type: 'output',
              text: `[+] CHALLENGE COMPLETE: '${candidate.title}' (+${subResult.pointsAwarded} XP)\n${subResult.successMessage || ''}`,
              isSuccess: true
            }
          ]);
          advanceAfterSolve(candidate.id);
        }
      }
    }
  }, [cwd, activeFs, platform, installedPackages, session, selectedChallengeId, solvesMap, handleFlagSubmit, flagMap, unlockedHints, coachEnabled, advanceAfterSolve]);

  // Clear terminal screen
  const handleClearHistory = () => {
    setTerminalHistory([]);
  };

  // Switch between Linux (The Warren) and Windows (Topside)
  const handleSwitchPlatform = (newPlatform, targetChallengeId = null) => {
    setPlatform(newPlatform);
    const fallback = newPlatform === 'windows' ? 'topside-nav' : 'act1-pwd';
    const targetId = targetChallengeId || fallback;
    const target = CHALLENGES.find(c => c.id === targetId);
    setCwd(newPlatform === 'windows' ? 'C:\\Users\\Analyst' : '/home/analyst');
    setActiveActId(target?.act ?? (newPlatform === 'windows' ? 6 : 1));
    setSelectedChallengeId(targetId);
    setTerminalHistory([{
      type: 'output',
      text: newPlatform === 'windows'
        ? '(switched to the Windows CMD side — fresh session)'
        : '(switched to the Linux side — fresh session)',
      isDim: true
    }]);
  };

  // Handle logout: reset EVERYTHING a next player on this machine could inherit
  // (scrollback with flag chips, hint counts, platform, installed tools)
  const handleLogout = () => {
    setAuthToken(null);
    setSession(null);
    setSolvesMap({});
    setEarnedBadges([]);
    setNewBadge(null);
    setFlagMap({});
    setUnlockedHints({});
    setTerminalHistory([]);
    setCurrentInput('');
    setPlatform('linux');
    setCwd('/home/analyst');
    setInstalledPackages(new Set());
    setLinuxFs(createWarrenFilesystem());
    setWindowsFs(createTopsideFilesystem());
    setActiveActId(1);
    setSelectedChallengeId('act1-pwd');
    coachCountsRef.current = {};
    setViewState('gate');
  };

  // View routing
  if (viewState === 'boot') {
    return (
      <Boot
        onBootComplete={() => {
          if (session) {
            setViewState('warren');
          } else {
            setViewState('gate');
          }
        }}
        userHandle={session?.handle}
      />
    );
  }

  // Never show the registration form while a stored session may still be loading:
  // a returning player would re-type their handle and hit "already claimed".
  if (!session && loadingSession) {
    return (
      <div className="min-h-screen bg-term-void text-term-green flex items-center justify-center font-mono text-sm">
        <div className="animate-pulse">RESTORING SESSION...</div>
      </div>
    );
  }

  // Route on session alone: once a stored session resolves, a stale
  // viewState of 'gate' (boot skipped before the fetch finished) must not
  // strand a returning player on the registration form.
  if (!session) {
    return (
      <Gate
        onAuthenticated={handleAuthenticated}
        onResumeSession={(h) => {
          if (session) setViewState('warren');
          else setViewState('gate');
        }}
        existingHandle={session?.handle}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-term-void text-neutral-200 flex flex-col overflow-hidden font-mono select-none">
      {/* Desktop Keyboard Guard (for screens < 768px) */}
      <KeyboardGuard />

      {/* Badge Earned Celebration Overlay */}
      {newBadge && (
        <BadgeCelebration
          badge={newBadge}
          onClose={() => setNewBadge(null)}
        />
      )}

      {/* Top Application Navigation Bar */}
      <header className="flex-none bg-term-black border-b border-term-border px-4 py-2.5 flex items-center justify-between z-30">
        {/* Left: Brand Mark & Title */}
        <div className="flex items-center gap-3">
          <BrandMark size={24} />
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-green-400 tracking-wider">THE GAUNTLET</span>
            <span className="text-[11px] text-neutral-400 hidden sm:inline">· Forensics CLI 101</span>
          </div>
        </div>

        {/* Center: Main View Navigation */}
        <nav className="flex items-center gap-1 bg-term-panel p-1 rounded-lg border border-term-border">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'terminal'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <TerminalIcon size={13} />
            <span className="hidden sm:inline">TERMINAL</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Trophy size={13} />
            <span className="hidden sm:inline">LEADERBOARD</span>
          </button>

          <button
            onClick={() => setActiveTab('map')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'map'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MapPin size={13} />
            <span className="hidden sm:inline">MAP</span>
          </button>

          <button
            onClick={() => setActiveTab('reference')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'reference'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <BookOpen size={13} />
            <span className="hidden sm:inline">REFERENCE</span>
          </button>

          {session?.isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-term-amber text-term-black shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'text-term-amber/70 hover:text-term-amber'
              }`}
            >
              <Shield size={13} />
              <span className="hidden sm:inline">INSTRUCTOR</span>
            </button>
          )}
        </nav>

        {/* Right: Settings, Score & User Info */}
        <div className="flex items-center gap-3">
          {/* CRT Scanline Toggle */}
          <button
            onClick={() => setScanlines(!scanlines)}
            className={`p-1.5 rounded border transition-all cursor-pointer ${
              scanlines
                ? 'bg-term-green-faint text-term-green border-term-green/40'
                : 'bg-term-gray text-neutral-400 border-term-border'
            }`}
            title={`CRT Scanlines: ${scanlines ? 'ON' : 'OFF'}`}
          >
            <Monitor size={14} />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded border transition-all cursor-pointer ${
              soundEnabled
                ? 'bg-term-green-faint text-term-green border-term-green/40'
                : 'bg-term-gray text-neutral-400 border-term-border'
            }`}
            title={`Retro Terminal Audio: ${soundEnabled ? 'ON' : 'OFF'}`}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {/* User Handle & Score Badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-term-border">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white">@{session?.handle}</div>
              <div className="text-[10px] text-term-green font-bold">{totalScore} XP</div>
            </div>

            <button
              onClick={handleLogout}
              className="p-1.5 rounded text-neutral-400 hover:text-red-400 hover:bg-term-gray transition-all cursor-pointer"
              title="Log out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Keep the terminal MOUNTED when other tabs show: unmounting resets
            command history (up-arrow recall) and scroll position. */}
        {(
          <div className={`flex-1 overflow-hidden ${activeTab === 'terminal' ? 'flex' : 'hidden'}`}>
            {/* Left Rail: Challenge Navigation & Briefing */}
            <ChallengeSidebar
              acts={ACT_DEFINITIONS}
              challenges={CHALLENGES}
              activeActId={activeActId}
              setActiveActId={setActiveActId}
              selectedChallengeId={selectedChallengeId}
              onSelectChallenge={(id) => {
                setSelectedChallengeId(id);
                const challenge = CHALLENGES.find(c => c.id === id);
                if (challenge?.platform && challenge.platform !== platform) {
                  handleSwitchPlatform(challenge.platform, id);
                } else if (!challenge?.platform && platform === 'windows') {
                  handleSwitchPlatform('linux', id);
                }
              }}
              solvesMap={solvesMap}
              totalScore={totalScore}
              onSubmitFlag={handleFlagSubmit}
              platform={platform}
              onSwitchPlatform={handleSwitchPlatform}
              unlockedHints={unlockedHints}
              setUnlockedHints={setUnlockedHintsPersist}
            />

            {/* Right: Simulated Terminal */}
            <div className="flex-1 flex flex-col p-3 overflow-hidden bg-term-shell-deep">
              <Terminal
                platform={platform}
                cwd={cwd}
                terminalHistory={terminalHistory}
                currentInput={currentInput}
                setCurrentInput={setCurrentInput}
                onExecuteCommand={handleExecuteCommand}
                onClearHistory={handleClearHistory}
                onOpenMap={() => setActiveTab('map')}
                fs={activeFs}
                scanlines={scanlines}
                coachEnabled={coachEnabled}
                onToggleCoach={() => setCoachEnabled(prev => !prev)}
              />
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <Leaderboard currentHandle={session?.handle} />
        )}

        {activeTab === 'reference' && (
          <CommandReference />
        )}

        {activeTab === 'map' && (
          <WarrenMap
            currentCwd={cwd}
            onNavigate={(newPath) => {
              setCwd(newPath);
              setActiveTab('terminal');
            }}
          />
        )}

        {activeTab === 'admin' && session?.isAdmin && (
          <AdminOverview />
        )}
      </main>
    </div>
  );
}
