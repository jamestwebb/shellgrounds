// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// The Gauntlet — Interactive Proving Ground

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Terminal as TerminalIcon, Trophy, MapPin, Shield, LogOut,
  Volume2, VolumeX, Monitor, Moon, Sun, Award, Zap, HelpCircle, BookOpen, Package, Layers
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
import SimulationBoundary from './components/SimulationBoundary';
import PackSelector from './components/PackSelector';

import { getPack, DEFAULT_PACK_ID, listPacks } from '../packs/index.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { ERROR_MARKERS } from '../packages/engine/constants.js';
import { fetchSession, fetchManifest, submitFlagApi, getAuthToken, setAuthToken } from './utils/api';
import { replaceFlagTokens } from './utils/vfs-injector';
import { explainCommand } from '../packages/engine/coach.js';
import { sounds } from './utils/audio';

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
  const currentPack = useMemo(() => getPack(activePackId), [activePackId]);

  // Terminal & Filesystem State
  const [platform, setPlatform] = useState('linux'); // 'linux' | 'windows'
  const [cwd, setCwd] = useState('/home/analyst');
  const [linuxFs, setLinuxFs] = useState(() => currentPack.createFs('linux'));
  const [windowsFs, setWindowsFs] = useState(() => currentPack.createFs('windows'));
  const [installedPackages, setInstalledPackages] = useState(new Set());
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

  // Load / Switch Pack
  const handleSelectPack = useCallback((newPackId) => {
    setActivePackId(newPackId);
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
        text: `[+] Switched active curriculum to: ${pack.manifest.name} (v${pack.manifest.version})`,
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
          if (data.packId && data.packId !== activePackId) {
            handleSelectPack(data.packId);
          }

          const solves = {};
          (data.solves || []).forEach(s => {
            solves[s.challengeId] = s;
          });
          setSolvesMap(solves);

          const manifestRes = await fetchManifest();
          if (manifestRes.success) {
            setFlagMap(manifestRes.flags || {});
          }

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
    setSession({ handle: 'guest_analyst', isAdmin: false });
    setViewState('app');
    sounds.playSuccess();
  };

  // Authenticated Login
  const handleAuthenticated = async (handle, token) => {
    setAuthToken(token);
    setSession({ handle, isAdmin: false });
    try {
      const manifestRes = await fetchManifest();
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
      installedPackages,
      packCommands: currentPack.commands,
      packHelp: currentPack.help,
      user: isWin ? (currentPack.manifest.windows?.user || 'Student') : (currentPack.manifest.linux?.user || 'student')
    });

    if (res.newCwd) setCwd(res.newCwd);
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
          text: `[★] CHALLENGE COMPLETE (+${challenge.points} XP): ${challenge.title}\n${challenge.successMessage || ''}`,
          isSuccess: true
        }
      ]);
      return;
    }

    try {
      const res = await submitFlagApi(challenge.id, null, unlockedHints[challenge.id] || 0, proofCommand, cwd);
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
            text: `[★] CHALLENGE COMPLETE (+${res.points} XP): ${challenge.title}\n${res.successMessage || ''}`,
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
          { type: 'output', text: `[★] FLAG ACCEPTED (+${c.points} XP): ${c.title}`, isSuccess: true }
        ]);
      }
      return;
    }

    try {
      const res = await submitFlagApi(selectedChallengeId, flagValue.trim(), unlockedHints[selectedChallengeId] || 0, '', cwd);
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
          { type: 'output', text: `[★] FLAG ACCEPTED (+${res.points} XP)\n${res.successMessage || ''}`, isSuccess: true }
        ]);
      }
    } catch (err) {
      sounds.playError();
      setTerminalHistory(prev => [
        ...prev,
        { type: 'output', text: `[!] ${err.message || 'Incorrect flag.'}`, isError: true }
      ]);
    }
  };

  const handleClearHistory = () => {
    setTerminalHistory([]);
  };

  // Active view routing
  if (viewState === 'boot') {
    return <Boot onComplete={() => setViewState(session ? 'app' : 'gate')} />;
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
        />
        <div className="text-center pb-6">
          <button
            onClick={handleStartPractice}
            className="text-xs text-neutral-400 hover:text-emerald-400 underline transition"
          >
            Enter Practice Sandbox Mode (No Login Required)
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
              THE GAUNTLET
            </span>
          </div>

          {/* Pack Indicator & Selector */}
          <button
            onClick={() => setShowPackModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition"
            title="Switch Content Pack"
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
            <TerminalIcon size={14} /> <span className="hidden sm:inline">TERMINAL</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'leaderboard'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-term-gray'
            }`}
          >
            <Trophy size={14} /> <span className="hidden sm:inline">RANKINGS</span>
          </button>

          <button
            onClick={() => setShowBoundaryModal(true)}
            className="px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-cyan-500/30"
            title="Simulation Boundary & Command Reference"
          >
            <BookOpen size={14} /> <span className="hidden sm:inline">REFERENCE</span>
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
              <Shield size={14} /> <span className="hidden sm:inline">INSTRUCTOR</span>
            </button>
          )}
        </div>

        {/* Right Status Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-term-gray transition-all cursor-pointer"
            title={`Audio: ${soundEnabled ? 'ON' : 'OFF'}`}
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
            setUnlockedHints={setUnlockedHints}
          />

          {/* Right: Simulated Terminal */}
          <div className="flex-1 flex flex-col p-3 overflow-hidden bg-term-shell-deep">
            <Terminal
              platform={platform}
              cwd={cwd}
              user={platform === 'windows' ? (currentPack.manifest.windows?.user || 'Student') : (currentPack.manifest.linux?.user || 'student')}
              host={platform === 'windows' ? 'DESKTOP' : (currentPack.manifest.linux?.host || 'sandbox')}
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
          <Leaderboard currentHandle={session?.handle} />
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
      />
    </div>
  );
}
