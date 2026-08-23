// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds — learn the command line, one find at a time

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Terminal as TerminalIcon, Trophy, MapPin, Shield, LogOut,
  Volume2, VolumeX, Monitor, Moon, Sun, Award, Zap, HelpCircle, BookOpen, Package, Layers,
  Sparkles
} from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { Boot } from './components/Boot';
import { Welcome, ChoosePack, PackBriefing } from './components/Onboarding';
import { Gate } from './components/Gate';
import { Terminal } from './components/Terminal';
import { ChallengeSidebar } from './components/ChallengeSidebar';
import { Leaderboard } from './components/Leaderboard';
import { Reveal } from './components/Reveal';
import { SystemMap } from './components/SystemMap';
import { AdminOverview } from './components/AdminOverview';
import { CommandReference } from './components/CommandReference';
import { BadgeCelebration } from './components/BadgeCelebration';
import { KeyboardGuard } from './components/KeyboardGuard';
import SimulationBoundary from './components/SimulationBoundary';
import PackSelector from './components/PackSelector';

import { getPack, DEFAULT_PACK_ID, listPacks } from '../packs/index.js';
import { fetchSiteConfig, markScreenSeen } from './utils/api';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { ERROR_MARKERS } from '../packages/engine/constants.js';
import {
  fetchSession, fetchManifest, submitFlagApi, openHintApi,
  getAuthToken, setAuthToken, getStoredPackId, setStoredPackId
} from './utils/api';
import { replaceFlagTokens, injectFlagsIntoVFS } from './utils/vfs-injector';
import { explainCommand } from '../packages/engine/coach.js';
import { sounds } from './utils/audio';
import { nextWrongAnswerMessage, nextSolveMessage } from './copy';

const resumeSelection = (challenges, solves) => {
  const linux = challenges.find(c => (c.platform || 'linux') === 'linux' && !solves[c.id]);
  return linux || challenges.find(c => !solves[c.id]) || challenges[0];
};

export default function App() {
  // Navigation & Session States
  const [viewState, setViewState] = useState('boot');
  const [activeTab, setActiveTab] = useState('terminal'); // 'terminal' | 'leaderboard' | 'map' | 'admin' | 'reference'
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isPracticeMode, setIsPracticeMode] = useState(false);

  // Active Pack Configuration
  const [activePackId, setActivePackId] = useState(DEFAULT_PACK_ID);
  // Which packs this site currently offers. null until the server answers, and
  // null means "do not filter": a student mid-course must not lose their pack
  // switcher because one request was slow or failed.
  const [enabledPackIds, setEnabledPackIds] = useState(null);
  // 'reveal' (a shared picture) or 'leaderboard' (a ranked board). The teacher
  // chooses; the reveal is the default. Until the server answers, assume the
  // default rather than flashing a ranking at a class that was not meant to
  // see one -- the wrong guess in that direction is the harmful one.
  const [classView, setClassView] = useState('reveal');
  // Which introduction screens this student has already read, from the server.
  const [seenScreens, setSeenScreens] = useState({});
  // Set when a student picks a course on the chooser, so that choosing takes
  // them forward to its briefing instead of straight back to the chooser.
  const [chosePackThisVisit, setChosePackThisVisit] = useState(false);
  const currentPack = useMemo(() => getPack(activePackId), [activePackId]);

  // Terminal & Filesystem State
  const [platform, setPlatform] = useState('linux'); // 'linux' | 'windows'
  const [cwd, setCwd] = useState('/home/analyst');
  const [linuxFs, setLinuxFs] = useState(() => currentPack.createFs('linux'));
  const [windowsFs, setWindowsFs] = useState(() => currentPack.createFs('windows'));
  const [installedPackages, setInstalledPackages] = useState(new Set());
  // The shell's environment. `set FOO=bar` returns a new env from runPipeline;
  // dropping it is why %VAR% never worked and `set` never persisted. Linux and
  // Windows keep separate environments, so this resets on a platform or pack
  // change.
  const [shellEnv, setShellEnv] = useState(undefined);
  const [terminalHistory, setTerminalHistory] = useState([]);
  const [currentInput, setCurrentInput] = useState('');

  // Challenge Progression State
  const [activeActId, setActiveActId] = useState(1);
  const [selectedChallengeId, setSelectedChallengeId] = useState(() => currentPack.challenges[0]?.id || 'act1-pwd');
  const [flagMap, setFlagMap] = useState({});
  const [unlockedHints, setUnlockedHints] = useState({});
  const [solvesMap, setSolvesMap] = useState({});
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [newBadge, setNewBadge] = useState(null);

  // Modals
  const [showBoundaryModal, setShowBoundaryModal] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);

  // Settings
  const [scanlines, setScanlines] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [coachEnabled, setCoachEnabled] = useState(true);

  // Active filesystem reference
  const activeFs = platform === 'windows' ? windowsFs : linuxFs;

  // Total score calculation
  const totalScore = useMemo(
    () => Object.values(solvesMap).reduce((sum, s) => sum + (s.netPoints || 0), 0),
    [solvesMap]
  );

  // Flags must live in the FILESYSTEM, not just in rendered output: commands
  // read raw file content, so an un-injected VFS makes `grep "FLAG{" file`
  // silently find nothing. The manifest arrives after mount, so re-inject when
  // it lands (and whenever the pack changes).
  useEffect(() => {
    if (!Object.keys(flagMap).length) return;
    const handle = session?.handle || 'analyst';
    const challenges = currentPack.challenges;
    setLinuxFs(injectFlagsIntoVFS(currentPack.createFs('linux'), handle, flagMap, challenges).fs);
    setWindowsFs(injectFlagsIntoVFS(currentPack.createFs('windows'), handle, flagMap, challenges).fs);
  }, [flagMap, currentPack, session?.handle]);

  // Load / Switch Pack
  // Opening a hint tells the server, which records it and prices the penalty.
  // The count used to live only in the browser, so the cost was whatever the
  // client felt like reporting at submission time.
  const handleOpenHint = useCallback(async (challengeId, index) => {
    if (isPracticeMode) {
      setUnlockedHints(prev => ({ ...prev, [challengeId]: (prev[challengeId] || 0) + 1 }));
      return null;
    }
    try {
      const res = await openHintApi(challengeId, index);
      setUnlockedHints(prev => ({ ...prev, [challengeId]: res.hintsOpened }));
      return res;
    } catch (err) {
      console.warn('Could not open hint:', err);
      return null;
    }
  }, [isPracticeMode]);

  const handleSelectPack = useCallback((newPackId) => {
    setActivePackId(newPackId);
    // The student's choice, remembered. The server used to own this and would
    // overwrite it on every reload, which silently undid the switch.
    setStoredPackId(newPackId);
    setShellEnv(undefined);
    const pack = getPack(newPackId);
    const plat = pack.manifest.platforms?.[0] || 'linux';
    setPlatform(plat);
    setCwd(plat === 'windows' ? (pack.manifest.windows?.home || 'C:\\Users\\Student') : (pack.manifest.linux?.home || '/home/student'));
    setLinuxFs(pack.createFs('linux'));
    setWindowsFs(pack.createFs('windows'));
    setActiveActId(1);
    setSelectedChallengeId(pack.challenges[0]?.id || '');
    setTerminalHistory([
      {
        type: 'output',
        text: `[+] Loaded pack: ${pack.manifest.name} (v${pack.manifest.version})`,
        isSuccess: true
      }
    ]);
  }, []);

  // Initialize session on mount
  useEffect(() => {
    async function init() {
      const token = getAuthToken();
      if (!token) {
        setLoadingSession(false);
        setViewState('gate');
        return;
      }

      try {
        const data = await fetchSession();
        if (data.success) {
          setSession({ handle: data.handle, isAdmin: data.isAdmin });
          setSeenScreens(data.seen || {});
          // The token still carries the pack the student registered with, but
          // it is only a suggestion now: the server resolves each submission
          // from its challenge id. A stored choice is the student's own.
          const preferred = getStoredPackId() || data.packId;
          if (preferred && preferred !== activePackId) {
            handleSelectPack(preferred);
          }

          const solves = {};
          (data.solves || []).forEach(s => {
            solves[s.challengeId] = s;
          });
          setSolvesMap(solves);

          const manifestRes = await fetchManifest(getStoredPackId() || activePackId);
          if (manifestRes.success) {
            setFlagMap(manifestRes.flags || {});
          }

          // The instructor screen writes this, so it can change between two
          // logins with no redeploy in between.
          fetchSiteConfig()
            .then(cfg => {
              if (Array.isArray(cfg?.enabledPacks)) setEnabledPackIds(cfg.enabledPacks);
              if (cfg?.classView) setClassView(cfg.classView);
            })
            .catch(() => {});

          setViewState('app');
        } else {
          setViewState('gate');
        }
      } catch (err) {
        console.warn('Session init failed:', err);
        setViewState('gate');
      } finally {
        setLoadingSession(false);
      }
    }
    init();
  }, [handleSelectPack, activePackId]);

  // Practice Mode Login
  const handleStartPractice = () => {
    setIsPracticeMode(true);
    setSession({ handle: 'guest', isAdmin: false });
    setViewState('app');
    sounds.playSuccess();
  };

  // Authenticated Login
  const handleAuthenticated = async (handle, token) => {
    setAuthToken(token);
    setSession({ handle, isAdmin: false });
    // Only the server knows who is an instructor (ADMIN_HANDLES). Without this
    // an instructor who logs in fresh stays gated until they reload the page.
    fetchSession()
      .then(d => {
        if (d?.success) {
          setSession({ handle: d.handle, isAdmin: !!d.isAdmin });
          setSeenScreens(d.seen || {});
        }
      })
      .catch(() => { /* keep the non-admin view; the reload path will correct it */ });
    fetchSiteConfig()
      .then(cfg => {
        if (Array.isArray(cfg?.enabledPacks)) setEnabledPackIds(cfg.enabledPacks);
        if (cfg?.classView) setClassView(cfg.classView);
      })
      .catch(() => {});
    try {
      const manifestRes = await fetchManifest(getStoredPackId() || activePackId);
      if (manifestRes.success) {
        setFlagMap(manifestRes.flags || {});
      }
    } catch (e) {
      console.error(e);
    }
    setViewState('app');
  };

  const handleLogout = () => {
    setAuthToken('');
    setSession(null);
    setIsPracticeMode(false);
    setViewState('gate');
  };

  // Switch Platform (Linux <-> Windows)
  const handleSwitchPlatform = (newPlatform, targetChallengeId = null) => {
    setPlatform(newPlatform);
    if (newPlatform === 'windows') {
      setCwd(currentPack.manifest.windows?.home || 'C:\\Users\\Analyst');
    } else {
      setCwd(currentPack.manifest.linux?.home || '/home/analyst');
    }
    if (targetChallengeId) {
      setSelectedChallengeId(targetChallengeId);
    }
  };

  // Command Execution in Terminal
  const handleExecuteCommand = (cmdText, meta = {}) => {
    if (meta.isTabList) {
      setTerminalHistory(prev => [
        ...prev,
        { type: 'input', text: meta.promptLine, cwd },
        { type: 'output', text: meta.matches.join('   '), isDim: true }
      ]);
      return;
    }

    if (meta.isCancel) {
      setTerminalHistory(prev => [
        ...prev,
        { type: 'input', text: currentInput + '^C', cwd }
      ]);
      return;
    }

    const trimmed = (cmdText || '').trim();
    if (!trimmed) {
      setTerminalHistory(prev => [...prev, { type: 'input', text: '', cwd }]);
      return;
    }

    // Execute through core engine pipeline
    const prevCwd = cwd;
    const isWin = platform === 'windows';
    const res = runPipeline(trimmed, cwd, activeFs, isWin ? 'windows' : 'linux', {
      env: shellEnv,
      installedPackages,
      packCommands: currentPack.commands,
      packHelp: currentPack.help,
      user: isWin ? (currentPack.manifest.windows?.user || 'Student') : (currentPack.manifest.linux?.user || 'student')
    });

    if (res.newCwd) setCwd(res.newCwd);
    if (res.env) setShellEnv(res.env);
    if (res.fs) {
      if (isWin) setWindowsFs(res.fs);
      else setLinuxFs(res.fs);
    }

    if (res.clear) {
      setTerminalHistory([]);
      return;
    }

    const newHistory = [
      ...terminalHistory,
      { type: 'input', text: trimmed, cwd: prevCwd }
    ];

    if (res.output) {
      newHistory.push({
        type: 'output',
        // Pack commands emit [[FLAG:id]] placeholders in their output (the VFS
        // is substituted at load, command output is not). Without this the
        // student sees a raw placeholder instead of their flag.
        text: replaceFlagTokens(res.output, flagMap),
        isError: res.hasError
      });
    }

    // Coach explanation
    if (coachEnabled) {
      const explainer = explainCommand(trimmed, res, platform, prevCwd, {});
      if (explainer) {
        newHistory.push({
          type: 'output',
          text: explainer,
          isCoach: true
        });
      }
    }

    setTerminalHistory(newHistory);

    // Auto check if this command completes the selected command/state challenge
    const currentChallenge = currentPack.challenges.find(c => c.id === selectedChallengeId);
    if (currentChallenge && (currentChallenge.success?.kind === 'command' || currentChallenge.success?.predicate || currentChallenge.success?.kind === 'state')) {
      const passes = !res.hasError && evaluatePredicate(currentChallenge.success, {
        fs: res.fs || activeFs,
        cwd: res.newCwd || cwd,
        commandText: trimmed,
        stdout: res.stdout,
        stderr: res.stderr,
        output: res.output,
        status: res.status,
        isWindows: isWin,
        trusted: true
      });

      if (passes && !ERROR_MARKERS.test(res.output || '')) {
        handleChallengeSuccess(currentChallenge, trimmed);
      }
    }
  };

  const handleChallengeSuccess = async (challenge, proofCommand = '') => {
    if (solvesMap[challenge.id]) return;

    if (isPracticeMode) {
      setSolvesMap(prev => ({
        ...prev,
        [challenge.id]: {
          points: challenge.points || 0,
          hintPenalty: 0,
          netPoints: challenge.points || 0,
          solvedAt: new Date().toISOString()
        }
      }));
      sounds.playSuccess();
      setTerminalHistory(prev => [
        ...prev,
        {
          type: 'output',
          text: `[★] SOLVED (+${challenge.points} XP): ${challenge.title}\n${[challenge.successMessage, nextSolveMessage()].filter(Boolean).join('\n')}`,
          isSuccess: true
        }
      ]);
      return;
    }

    try {
      const res = await submitFlagApi({ challengeId: challenge.id, commandText: proofCommand, cwd });
      if (res.success) {
        sounds.playSuccess();
        setSolvesMap(prev => ({
          ...prev,
          [challenge.id]: {
            points: challenge.points || 0,
            hintPenalty: 0,
            netPoints: res.points,
            solvedAt: new Date().toISOString()
          }
        }));
        setTerminalHistory(prev => [
          ...prev,
          {
            type: 'output',
            text: `[★] SOLVED (+${res.points} XP): ${challenge.title}\n${[res.successMessage, nextSolveMessage()].filter(Boolean).join('\n')}`,
            isSuccess: true
          }
        ]);
      }
    } catch (err) {
      console.warn('Auto-submit failed:', err);
    }
  };

  const handleFlagSubmit = async (flagValue) => {
    if (!flagValue || !flagValue.trim()) return;

    if (isPracticeMode) {
      // Find matching challenge
      const c = currentPack.challenges.find(ch => ch.id === selectedChallengeId);
      if (c) {
        setSolvesMap(prev => ({
          ...prev,
          [c.id]: { points: c.points, hintPenalty: 0, netPoints: c.points, solvedAt: new Date().toISOString() }
        }));
        sounds.playSuccess();
        setTerminalHistory(prev => [
          ...prev,
          { type: 'output', text: `[★] FOUND IT (+${c.points} XP): ${c.title}\n${nextSolveMessage()}`, isSuccess: true }
        ]);
      }
      return;
    }

    try {
      const res = await submitFlagApi({ challengeId: selectedChallengeId, flag: flagValue.trim(), cwd });
      if (res.success) {
        sounds.playSuccess();
        setSolvesMap(prev => ({
          ...prev,
          [res.challengeId || selectedChallengeId]: {
            points: res.points,
            netPoints: res.points,
            solvedAt: new Date().toISOString()
          }
        }));
        setTerminalHistory(prev => [
          ...prev,
          { type: 'output', text: `[★] FOUND IT (+${res.points} XP)\n${[res.successMessage, nextSolveMessage()].filter(Boolean).join('\n')}`, isSuccess: true }
        ]);
      }
    } catch (err) {
      sounds.playError();
      setTerminalHistory(prev => [
        ...prev,
        { type: 'output', text: `[!] ${err.message || 'That find did not match.'}\n    ${nextWrongAnswerMessage()}`, isError: true }
      ]);
    }
  };

  const handleClearHistory = () => {
    setTerminalHistory([]);
  };

  // ── Onboarding routing ────────────────────────────────────────────────────
  // Between signing in and the terminal, a student may see up to three
  // screens, and each one is skipped once it has served its purpose:
  //
  //   Welcome    what Shellgrounds is. Once per student, ever.
  //   Choose     which course. Only when more than one is on offer — with a
  //              single pack there is no choice to make, and asking is a click
  //              that teaches nothing.
  //   Briefing   the scenario and what the course teaches. Once per pack.
  //
  // Practice mode skips all of it: there is no account to remember against,
  // and somebody clicking "try it" wants the terminal, not the tour.
  const offeredPacks = useMemo(() => {
    const all = listPacks().map(p => getPack(p.id));
    return Array.isArray(enabledPackIds)
      ? all.filter(p => enabledPackIds.includes(p.id))
      : all;
  }, [enabledPackIds]);

  const recordSeen = useCallback((what, packId = null) => {
    const key = what === 'welcome' ? 'welcome' : `briefing:${packId}`;
    // Optimistic: the screen closes now, and the server catches up. A failed
    // write costs a student one repeated screen, never a blocked start.
    setSeenScreens(prev => ({ ...prev, [key]: new Date().toISOString() }));
    markScreenSeen(what, packId);
  }, []);

  const onboarding = (() => {
    if (viewState !== 'app' || !session || isPracticeMode) return null;
    if (!seenScreens.welcome) return 'welcome';
    if (offeredPacks.length > 1 && !chosePackThisVisit && !seenScreens[`briefing:${activePackId}`]) {
      return 'choose';
    }
    if (!seenScreens[`briefing:${activePackId}`]) return 'briefing';
    return null;
  })();

  if (onboarding === 'welcome') {
    return (
      <Welcome
        handle={session.handle}
        onContinue={() => recordSeen('welcome')}
        continueLabel={offeredPacks.length > 1 ? 'Choose your course' : 'Read the briefing'}
      />
    );
  }

  if (onboarding === 'choose') {
    return (
      <ChoosePack
        packs={offeredPacks}
        currentPackId={activePackId}
        onChoose={(id) => { handleSelectPack(id); setChosePackThisVisit(true); }}
      />
    );
  }

  if (onboarding === 'briefing') {
    return (
      <PackBriefing
        pack={getPack(activePackId)}
        onStart={() => recordSeen('briefing', activePackId)}
        onBack={offeredPacks.length > 1 ? () => setChosePackThisVisit(false) : null}
      />
    );
  }

  // Active view routing
  if (viewState === 'boot') {
    return <Boot onComplete={() => setViewState(session ? 'app' : 'gate')} packName={currentPack.manifest.name} />;
  }

  if (viewState === 'gate') {
    return (
      <div className="min-h-screen bg-term-void flex flex-col">
        <Gate
          onAuthenticated={handleAuthenticated}
          onResumeSession={(h) => {
            setSession({ handle: h, isAdmin: false });
            setViewState('app');
          }}
          existingHandle={session?.handle}
          packName={currentPack.manifest.name}
        />
        <div className="text-center pb-6">
          <button
            onClick={handleStartPractice}
            className="text-xs text-neutral-400 hover:text-emerald-400 underline transition"
          >
            Just looking? Practise here without a handle — nothing is scored.
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-term-void text-neutral-200 flex flex-col font-mono select-none">
      <KeyboardGuard />

      {/* Navigation Header */}
      <header className="h-12 bg-term-black border-b border-term-border px-4 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('terminal')}>
            <BrandMark size={22} />
            <span className="font-bold text-sm tracking-wider text-green-400 hidden md:inline">
              Shellgrounds
            </span>
          </div>

          {/* Pack Indicator & Selector */}
          <button
            onClick={() => setShowPackModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
            title="Switch challenge pack"
          >
            <Package size={13} className="text-emerald-400" />
            <span className="font-semibold">{currentPack.manifest.name}</span>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'terminal'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-term-gray'
            }`}
          >
            <TerminalIcon size={14} /> <span className="hidden sm:inline">Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-term-gray'
            }`}
          >
            {classView === 'leaderboard'
              ? <><Trophy size={14} /> <span className="hidden sm:inline">Leaderboard</span></>
              : <><Sparkles size={14} /> <span className="hidden sm:inline">The shore</span></>}
          </button>

          <button
            onClick={() => setShowBoundaryModal(true)}
            className="px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-cyan-500/30"
            title="What this terminal simulates, and every command in it"
          >
            <BookOpen size={14} /> <span className="hidden sm:inline">Reference</span>
          </button>

          {session?.isAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                  : 'text-purple-400 hover:text-purple-300 hover:bg-purple-950/40'
              }`}
            >
              <Shield size={14} /> <span className="hidden sm:inline">Instructor</span>
            </button>
          )}
        </div>

        {/* Right Status Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-term-gray transition-all cursor-pointer"
            title={soundEnabled ? 'Sound on' : 'Sound off'}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

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
        <div className={`flex-1 overflow-hidden ${activeTab === 'terminal' ? 'flex' : 'hidden'}`}>
          {/* Left Rail: Challenge Navigation & Briefing */}
          <ChallengeSidebar
            acts={currentPack.manifest.acts}
            challenges={currentPack.challenges}
            activeActId={activeActId}
            setActiveActId={setActiveActId}
            selectedChallengeId={selectedChallengeId}
            onSelectChallenge={(id) => {
              setSelectedChallengeId(id);
              const challenge = currentPack.challenges.find(c => c.id === id);
              if (challenge?.platform && challenge.platform !== platform) {
                handleSwitchPlatform(challenge.platform, id);
              }
            }}
            solvesMap={solvesMap}
            totalScore={totalScore}
            onSubmitFlag={handleFlagSubmit}
            platform={platform}
            onSwitchPlatform={handleSwitchPlatform}
            unlockedHints={unlockedHints}
            onOpenHint={handleOpenHint}
            isAdmin={!!session?.isAdmin}
          />

          {/* Right: Simulated Terminal */}
          <div className="flex-1 flex flex-col p-3 overflow-hidden bg-term-shell-deep">
            <Terminal
              platform={platform}
              cwd={cwd}
              user={platform === 'windows' ? (currentPack.manifest.windows?.user || 'Student') : (currentPack.manifest.linux?.user || 'student')}
              host={platform === 'windows' ? 'Desktop' : (currentPack.manifest.linux?.host || 'sandbox')}
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

        {activeTab === 'leaderboard' && (
          classView === 'leaderboard' ? (
            <Leaderboard
              currentHandle={session?.handle}
              packId={activePackId}
              packName={currentPack.manifest.name}
            />
          ) : (
            <Reveal packId={activePackId} handle={session?.handle} />
          )
        )}

        {activeTab === 'map' && (
          <SystemMap
            fs={platform === 'windows' ? windowsFs : linuxFs}
            currentCwd={cwd}
            home={platform === 'windows'
              ? (currentPack.manifest.windows?.home || 'C:\\Users\\Student')
              : (currentPack.manifest.linux?.home || '/home/student')}
            platform={platform}
            packName={currentPack.manifest.name}
            onNavigate={(newPath) => {
              setCwd(newPath);
              setActiveTab('terminal');
            }}
          />
        )}

        {activeTab === 'admin' && session?.isAdmin && (
          <AdminOverview packId={activePackId} />
        )}
      </main>

      {/* Simulation Boundary Reference Modal */}
      <SimulationBoundary
        isOpen={showBoundaryModal}
        onClose={() => setShowBoundaryModal(false)}
        defaultPlatform={platform}
      />

      {/* Content Pack Selector Modal */}
      <PackSelector
        isOpen={showPackModal}
        onClose={() => setShowPackModal(false)}
        currentPackId={activePackId}
        onSelectPack={handleSelectPack}
        enabledPackIds={enabledPackIds}
      />
    </div>
  );
}
