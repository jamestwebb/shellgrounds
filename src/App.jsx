// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds — learn the command line, one find at a time

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Terminal as TerminalIcon, Trophy, Shield, LogOut,
  Volume2, VolumeX, BookOpen, Package, Sparkles, ChevronDown
} from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { Boot, hasSeenBoot, rememberBootSeen } from './components/Boot';
import { Welcome, ChoosePack, PackBriefing } from './components/Onboarding';
import { Gate } from './components/Gate';
import { Terminal } from './components/Terminal';
import { ChallengeSidebar } from './components/ChallengeSidebar';
import { Leaderboard } from './components/Leaderboard';
import { Reveal } from './components/Reveal';
import { SystemMap } from './components/SystemMap';
import { AdminOverview } from './components/AdminOverview';
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
import { badgesEarned } from '../packages/engine/badges.js';
import { sounds } from './utils/audio';
import { setDemoPreview } from './utils/api';
import { readStoredTheme, storeTheme } from './utils/terminalThemes.js';
import { nextWrongAnswerMessage, nextSolveMessage } from './copy';

// Where a returning student's cursor belongs: the first thing they have not
// done yet. Linux challenges are preferred over the Windows parity act, which
// is a bonus track rather than the next step.
//
// This function existed and was not called for several commits, so every
// student who signed in landed on challenge one -- "Where Am I?" -- however
// much of the course they had already finished. Nothing looked broken, because
// the first screen of a course is a perfectly plausible first screen.
// Where a student stands when a pack opens.
//
// The old fallback was '/home/analyst', and no pack has ever had such a
// directory: the homes that exist are /home/examiner, /home/student and their
// Windows equivalents. Any path that reached the fallback therefore put the
// student in a directory that is not there, where `ls` answers "cannot access
// '.'", `cat notes.txt` cannot find the file, and every relative path in every
// brief is wrong. The prompt showed the phantom path the whole time.
export const homeFor = (pack, platform) => {
  const declared = platform === 'windows'
    ? pack?.manifest?.windows?.home
    : pack?.manifest?.linux?.home;
  return declared || (platform === 'windows' ? 'C:\\Users\\Student' : '/home/student');
};

/** True when `path` is a directory the given filesystem actually contains. */
export const cwdExists = (fs, path) =>
  !!fs && typeof path === 'string' && Object.prototype.hasOwnProperty.call(fs, path);

export const resumeSelection = (challenges, solves) => {
  const linux = challenges.find(c => (c.platform || 'linux') === 'linux' && !solves[c.id]);
  if (linux) return linux;
  const any = challenges.find(c => !solves[c.id]);
  if (any) return any;
  // Everything is done. Land on the end of the course rather than the start of
  // it: a student who has finished and come back should not be asked "Where Am
  // I?" again, which is the same wrong answer the missing call produced.
  return challenges[challenges.length - 1] || challenges[0];
};

// A public demonstration deployment. Set VITE_DEMO_MODE=1 on that site only.
//
// This is an EXPLICIT flag, not something inferred from configuration. Deducing
// "demo" from a missing CLASS_PASSWORD would mean a teacher who simply forgot to
// set one gets a friendly demo screen instead of the error telling them their
// deployment is broken.
const DEMO_MODE = import.meta.env?.VITE_DEMO_MODE === '1'
  || import.meta.env?.VITE_DEMO_MODE === 'true';

// Shown on the demo so a visitor can register and see scoring work for real. A
// class deployment never exposes its password anywhere in the interface.
const DEMO_CLASS_PASSWORD = import.meta.env?.VITE_DEMO_CLASS_PASSWORD || '';

export default function App() {
  // Navigation & Session States
  const [viewState, setViewState] = useState('boot');
  const [activeTab, setActiveTab] = useState('terminal'); // 'terminal' | 'leaderboard' | 'map' | 'admin' | 'reference'
  // ── The curtain only goes up once ────────────────────────────────────────
  //
  // Welcome and the pack briefing are each shown once and then stay out of the
  // way, which is the rule this product states about its own explanations. The
  // boot sequence was the exception: two and a half seconds of startup checks
  // on every single mount, including every reload during a lesson.
  //
  // Read once, at first render, so the decision is made before anything paints
  // and nobody watches the full sequence begin and then get cut short.
  const [bootBrief] = useState(() => hasSeenBoot());
  const [session, setSession] = useState(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  // Demo only: looking at the instructor console against a sample class.
  const [instructorPreview, setInstructorPreview] = useState(false);

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
  // Seeded from the default pack rather than from a literal, so the very first
  // render is already somewhere that exists.
  const [cwd, setCwd] = useState(() => homeFor(getPack(DEFAULT_PACK_ID), 'linux'));
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
  // The badge just earned, if the last solve earned one. Held here rather than
  // read from the leaderboard, because a badge that a student only discovers
  // later, from a ranking, is not a reward for anything they can remember doing.
  const [newBadge, setNewBadge] = useState(null);

  // Modals
  const [showPackModal, setShowPackModal] = useState(false);

  // Settings
  // Scanlines were state with no way to change them: nothing ever called the
  // setter, so this was a setting in name only. It is a constant until
  // something offers the student a control -- and a control is worth adding,
  // because a flickering overlay is exactly the kind of effect some readers
  // need to be able to turn off.
  const scanlines = true;
  // The student's terminal colour scheme. Read from this browser on first
  // render rather than in an effect, so nobody sees the default flash past
  // before their own choice is applied.
  const [terminalTheme, setTerminalTheme] = useState(() => readStoredTheme());
  const chooseTerminalTheme = useCallback((id) => {
    setTerminalTheme(id);
    storeTheme(id);
  }, []);
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

  // A cwd outside the filesystem is a dead end: every relative path fails and
  // nothing on screen explains why. Rather than leave a student stranded there,
  // step back to the pack's home. This runs whenever the filesystem or platform
  // changes, which is every route by which the two could disagree.
  useEffect(() => {
    if (!activeFs) return;
    if (cwdExists(activeFs, cwd)) return;
    setCwd(homeFor(currentPack, platform));
  }, [activeFs, currentPack, platform, cwd]);

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
    setCwd(homeFor(pack, plat));
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

          // Put the cursor back where they stopped. The pack is resolved here
          // rather than read from `currentPack`, because handleSelectPack above
          // has not re-rendered yet and state still holds the previous pack.
          const landing = getPack(preferred || activePackId);
          const resume = resumeSelection(landing.challenges, solves);
          if (resume) {
            setSelectedChallengeId(resume.id);
            setActiveActId(resume.act || 1);
            // Stand where the brief assumes you are standing. Every challenge
            // declares the directory the server replays it from, and until now
            // the client ignored that field entirely -- so a brief written
            // against `Documents/notes.txt` could be read from somewhere the
            // path does not resolve.
            const plat = resume.platform || landing.manifest.platforms?.[0] || 'linux';
            setCwd(resume.setup?.cwd || homeFor(landing, plat));
          }

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
    setCwd(homeFor(currentPack, newPlatform));
    if (targetChallengeId) {
      setSelectedChallengeId(targetChallengeId);
    }
  };

  // ── Standing where the challenge says it starts ─────────────────────────
  //
  // Every challenge declares `setup.cwd`. The validator proves the directory
  // exists, the format documents it, and it was applied in exactly one place:
  // restoring a session. Selecting a challenge did not apply it.
  //
  // So a student who had walked around -- which is the whole of act one --
  // arrived at "Tonight's paperwork lives in `Documents`. Run `cd Documents`"
  // already standing in Documents, where that command errors. The brief was
  // right, the student was right, and the challenge was unreachable.
  //
  // The move is announced. A prompt that silently changes directory underneath
  // somebody is a worse lesson than the one it fixes.
  const standAtStartOf = (challenge, plat = platform) => {
    const start = challenge?.setup?.cwd;
    if (!start || start === cwd) return;
    const fs = plat === 'windows' ? windowsFs : linuxFs;
    // A pack that has moved a directory should not strand anyone in a path
    // that is no longer there; the self-healing effect above handles that.
    if (!cwdExists(fs, start)) return;
    setCwd(start);
    setTerminalHistory(prev => [
      ...prev,
      { type: 'output', text: `» This task starts in ${start}`, isDim: true }
    ]);
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
      // The sentence a student reads when they type a real command this
      // simulator does not implement. The engine has taken this parameter
      // since it was written, all three packs write the field, the validator
      // checks it and the format documents it -- and nothing ever handed it
      // over, so every course shipped the engine's generic wording instead of
      // its own. The pack owns what this course says; the engine owns the
      // fallback for a pack that says nothing.
      unsimulatedMessage: currentPack.manifest.messages?.unsimulated,
      // The same seam, for the same reason, twice more.
      //
      // `courseTools` is the pack's honesty map: the tools this course names in
      // its briefs and does not simulate, each with a sentence saying what it
      // is for. A forensics student who types `mmls` -- a tool their own course
      // told them about -- was answered "command not found", which is not true
      // and which the pack had already written the true answer for. It reads as
      // "you typed it wrong", so they retype it.
      packTools: currentPack.manifest.courseTools,
      // And the wording for shell syntax this simulator does not parse. The
      // engine reads it from here; without it every course fell back to the
      // engine's generic sentence instead of its own.
      unsupportedSyntaxMessage: currentPack.manifest.messages?.unsupportedSyntax,
      user: isWin ? (currentPack.manifest.windows?.user || 'Student') : (currentPack.manifest.linux?.user || 'student')
    });

    // An install has to survive to the NEXT command line, or "install it,
    // then run it" is two commands that cannot both be true. runPipeline has
    // returned installedPackage since it was written; nothing ever read it, so
    // the Set stayed empty for the whole session and every pack tool had to
    // pretend it was already installed.
    if (res.installedPackage) {
      setInstalledPackages(prev => new Set(prev).add(res.installedPackage));
    }
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

  // ── Earning a badge, out loud ───────────────────────────────────────────
  //
  // Thirteen badges across the three packs, each one the reward for finishing
  // an act, and the only place a student could ever find out they had one was
  // the leaderboard -- a different tab, opened later, if at all. The overlay
  // that says so has existed and been imported the whole time; nothing called
  // the setter that shows it.
  //
  // The rule itself lives in packages/engine/badges.js, so the browser and the
  // leaderboard function agree about what has been earned. Diffing before
  // against after is what makes this the MOMENT of earning rather than a
  // standing fact: a student who already holds the badge must not be
  // congratulated again every time they practise a challenge in that act.
  const celebrateNewBadges = useCallback((beforeIds, afterIds) => {
    const held = new Set(badgesEarned(currentPack, beforeIds).map(b => b.id));
    const gained = badgesEarned(currentPack, afterIds).find(b => !held.has(b.id));
    if (gained) setNewBadge(gained);
  }, [currentPack]);

  const handleChallengeSuccess = async (challenge, proofCommand = '') => {
    // Redoing something already solved used to return here in silence. A
    // student typed the right answer and the terminal said nothing back, which
    // reads as a broken site rather than as "you already have this one".
    //
    // Practice is answered, and not paid for. Retrieval is how the command
    // sticks, so repeating a challenge is worth encouraging; paying twice for
    // it would turn a score into a count of how long somebody held down Enter,
    // and the class picture is built from the same solves.
    if (solvesMap[challenge.id]) {
      setTerminalHistory(prev => [
        ...prev,
        {
          type: 'output',
          text: `[✓] Still right: ${challenge.title}. You already have this one, so there are `
            + 'no points this time — practise it as often as you like.',
          isSuccess: true
        }
      ]);
      return;
    }

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
      // Practice mode keeps its solves in the browser and never asks the
      // server, so if the celebration were wired to the submit response
      // instead, every badge in practice mode would go unannounced.
      celebrateNewBadges(Object.keys(solvesMap), [...Object.keys(solvesMap), challenge.id]);
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
        celebrateNewBadges(Object.keys(solvesMap), [...Object.keys(solvesMap), challenge.id]);
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
        // Typing the find is a solve like any other, so the act it completes
        // pays out like any other. Wiring the celebration only to the command
        // path would have made a whole class of solve silent again.
        celebrateNewBadges(Object.keys(solvesMap), [...Object.keys(solvesMap), c.id]);
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
        celebrateNewBadges(
          Object.keys(solvesMap),
          [...Object.keys(solvesMap), res.challengeId || selectedChallengeId]
        );
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
    return (
      <Boot
        brief={bootBrief}
        onComplete={() => {
          rememberBootSeen();
          setViewState(session ? 'app' : 'gate');
        }}
        packName={currentPack.manifest.name}
      />
    );
  }

  if (viewState === 'gate') {
    // A demo deployment puts the explanation BESIDE the form rather than above
    // it: the form is the action and the panel is context, and stacking them
    // pushed the thing a visitor came to press below the fold.
    if (DEMO_MODE) {
      return (
        <div className="min-h-screen bg-term-void flex items-center justify-center p-4">
          <div className="w-full max-w-4xl flex flex-col lg:flex-row lg:items-start
                          gap-6 justify-center">
            <div className="w-full lg:max-w-md">
          <Gate
            fullHeight={false}
            onAuthenticated={handleAuthenticated}
            onResumeSession={(h) => {
              setSession({ handle: h, isAdmin: false });
              setViewState('app');
            }}
            existingHandle={session?.handle}
            packName={currentPack.manifest.name}
          />
              <div className="text-center pt-3">
                <button
                  onClick={handleStartPractice}
                  className="text-xs text-neutral-400 hover:text-emerald-400 underline transition"
                >
                  Or skip the handle and just practise. Nothing is scored.
                </button>
              </div>
            </div>

            <aside className="w-full lg:max-w-sm rounded-lg border border-term-green/40
                              bg-term-green-faint p-5 space-y-3 lg:mt-4">
              <p className="text-[11px] font-bold text-term-green tracking-widest">
                THIS IS A DEMONSTRATION SITE
              </p>
              <p className="text-xs text-neutral-300 leading-relaxed">
                A free command-line training ground for high school and university
                technology educators. Everything here is real except the class: pick a
                handle, use the password shown here, and you are a student. Your own
                deployment gets its own private class, its own password and its own
                scores.
              </p>
              <p className="text-xs text-neutral-300">
                Class password:{' '}
                <code className="px-1.5 py-0.5 rounded bg-term-black text-green-300
                                 border border-term-green/40 select-all">
                  {DEMO_CLASS_PASSWORD}
                </code>
              </p>
              <button
                type="button"
                onClick={() => {
                  setDemoPreview(true);
                  setInstructorPreview(true);
                  handleStartPractice();
                  setActiveTab('admin');
                }}
                className="w-full px-3 py-2 rounded-lg bg-purple-600/20 border border-purple-500/50
                           text-xs font-bold text-purple-200 hover:bg-purple-600/30
                           cursor-pointer transition-colors
                           focus-visible:outline focus-visible:outline-2
                           focus-visible:outline-offset-2 focus-visible:outline-purple-400"
              >
                See the instructor view
              </button>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Who is stuck, where the hints are going, and what to reteach. Shown
                against a sample class, and read-only.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <a
                  href="https://github.com/jamestwebb/shellgrounds"
                  className="text-xs font-bold text-term-green hover:text-green-300 underline"
                >
                  Source and setup guide
                </a>
                <a
                  href="https://app.netlify.com/start/deploy?repository=https://github.com/jamestwebb/shellgrounds"
                  aria-label="Deploy your own copy to Netlify"
                >
                  <img
                    src="https://www.netlify.com/img/deploy/button.svg"
                    alt="Deploy your own copy to Netlify"
                    className="h-7"
                  />
                </a>
              </div>
            </aside>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-term-void flex flex-col">
        <Gate
          fullHeight={true}
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
            Just looking? Practise here without a handle. Nothing is scored.
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-term-void text-neutral-200 flex flex-col font-mono select-none">
      {/* First focusable element on the page. Without it, a keyboard user
          tabs through the whole header and the act list on every load before
          ever reaching the terminal -- not a 2.1 AA failure on its own since
          the landmarks below satisfy 2.4.1 Bypass Blocks, but a daily tax on
          a keyboard user. See A6 in docs/ACCESSIBILITY.md.
          Off-screen at rest, the same way as any skip link, and pulled onto
          screen on focus so a sighted keyboard user can see where they are. */}
      <a
        href="#main-content"
        className="absolute left-2 top-2 z-50 -translate-y-16 focus:translate-y-0 transition-transform
                   bg-term-green text-term-black text-xs font-bold px-3 py-2 rounded
                   focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        Skip to terminal
      </a>

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

          {/* Course indicator, and the way back to the other courses.
              This was the pack's name in a bordered box with a tooltip, which
              is what a STATUS reads like, so students who wanted another
              course looked for it everywhere except here. The three things
              that make a control look like a control: a word saying what the
              value is ("Course"), a chevron saying it opens, and a name the
              screen reader announces as an action rather than as a pack. */}
          <button
            onClick={() => setShowPackModal(true)}
            aria-haspopup="dialog"
            aria-label={`Course: ${currentPack.manifest.name}. Choose a different course`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-700
                       text-xs text-slate-300 hover:bg-slate-800 hover:border-emerald-500/60 hover:text-white
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-term-green transition cursor-pointer max-w-[16rem]"
            title="Choose a different course"
          >
            <Package size={13} className="text-emerald-400 shrink-0" />
            <span className="text-slate-400 hidden lg:inline">Course:</span>
            <span className="font-semibold truncate">{currentPack.manifest.name}</span>
            <ChevronDown size={13} className="text-slate-400 shrink-0" />
          </button>
        </div>

        {/* Tab Navigation. The only <nav> landmark in the chrome -- App.jsx
            had <header> and <main> and nothing between them, so a screen
            reader had no way to jump straight to "the other places to be"
            the way 2.4.1 Bypass Blocks intends. See A6 in
            docs/ACCESSIBILITY.md. */}
        <nav aria-label="Sections" className="flex items-center space-x-1 sm:space-x-2">
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

          {/* A reference is read in the middle of doing something, and read
              again. It used to open as an overlay that had to be dismissed
              before anything could be typed, so it sits in the tab row now and
              looks like what it is: another place to be, one click from the
              terminal and back. */}
          <button
            onClick={() => setActiveTab('reference')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'reference'
                ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                : 'text-neutral-400 hover:text-white hover:bg-term-gray'
            }`}
            title="Every command this terminal simulates, and what it does not"
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
        </nav>

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

      {/* Main Content Body. tabIndex={-1} makes the fragment target of the
          skip link above programmatically focusable: a <main> is not
          focusable on its own, and a skip link that scrolls the target into
          view without moving focus there has not actually skipped anything
          for a keyboard or screen reader user. */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex overflow-hidden relative">
        <div className={`flex-1 overflow-hidden ${activeTab === 'terminal' ? 'flex' : 'hidden'}`}>
          {/* Left Rail: Challenge Navigation & Briefing */}
          <ChallengeSidebar
            acts={currentPack.manifest.acts}
            challenges={currentPack.challenges}
            activeActId={activeActId}
            setActiveActId={setActiveActId}
            selectedChallengeId={selectedChallengeId}
            packManifest={currentPack.manifest}
            onSelectChallenge={(id) => {
              setSelectedChallengeId(id);
              const challenge = currentPack.challenges.find(c => c.id === id);
              const target = challenge?.platform || platform;
              // Order matters: switching platform resets the directory to that
              // platform's home, so the challenge's own start goes after it.
              if (target !== platform) handleSwitchPlatform(target, id);
              standAtStartOf(challenge, target);
            }}
            solvesMap={solvesMap}
            totalScore={totalScore}
            onSubmitFlag={handleFlagSubmit}
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
              // Both sides read the pack. The Windows branch used to be the
              // literal 'Desktop', so windows-cmd-essentials -- which names its
              // seized machine `lostfound` -- put someone else's hostname on
              // every prompt of the course.
              host={platform === 'windows'
                ? (currentPack.manifest.windows?.host || 'Desktop')
                : (currentPack.manifest.linux?.host || 'sandbox')}
              terminalHistory={terminalHistory}
              currentInput={currentInput}
              setCurrentInput={setCurrentInput}
              onExecuteCommand={handleExecuteCommand}
              onClearHistory={handleClearHistory}
              onOpenMap={() => setActiveTab('map')}
              fs={activeFs}
              scanlines={scanlines}
              themeId={terminalTheme}
              onChangeTheme={chooseTerminalTheme}
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

        {activeTab === 'reference' && (
          <SimulationBoundary defaultPlatform={platform} />
        )}

        {activeTab === 'admin' && (session?.isAdmin || instructorPreview) && (
          <AdminOverview packId={activePackId} preview={instructorPreview} />
        )}
      </main>

      {/* The moment a badge is earned. Dismissing it clears the badge, which is
          what stops it reappearing on the next render. */}
      <BadgeCelebration badge={newBadge} onClose={() => setNewBadge(null)} />

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
