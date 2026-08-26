// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Challenge Sidebar / Left Rail component for navigation, briefs, hints, and scoring

import React, { useState } from 'react';
import {
  CheckCircle2, Circle, Lightbulb, ChevronRight, ChevronLeft, ChevronDown,
  Zap, Trophy, Send, Layers, AlertCircle, HelpCircle, RotateCcw, Eye
} from 'lucide-react';
import { practiceState } from '../../packages/engine/practice.js';
import { firstEncounters } from '../../packages/engine/glossary.js';
import { ACT_DEFINITIONS, isActUnlockedFor, requiredSolvesToUnlock } from '../data/challenges';
import { nextWrongAnswerMessage, actLockedCopy } from '../copy';
import { sounds } from '../utils/audio';
import { ConfirmDialog } from './ConfirmDialog';

// Helper to highlight backtick-wrapped commands in text
const formatBriefText = (text) => {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-term-green-faint text-green-300 border border-term-green/40 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
};

export const ChallengeSidebar = ({
  acts = ACT_DEFINITIONS,
  challenges = [],
  activeActId = 1,
  setActiveActId,
  selectedChallengeId,
  onSelectChallenge,
  solvesMap = {},
  totalScore = 0,
  onSubmitFlag,
  // platform and onSwitchPlatform were passed in here and read by nothing:
  // the platform switch happens in App, when a challenge declaring the other
  // platform is selected. Two props that look like wiring and are not.
  // Instructors need to read and work every challenge in any order to build a
  // lesson. Students keep the act gate: it is the pacing mechanism.
  isAdmin = false,
  // Hint state lives in App so the terminal `submit` path counts revealed hints
  // too. Opening one goes through the server, which records it and prices the
  // penalty — the count used to be the browser's word alone.
  unlockedHints = {},
  onOpenHint = async () => null,
  // The pack's own glossary, which overrides the engine's for its own
  // commands and its own course vocabulary.
  packManifest = {}
}) => {
  const [flagInput, setFlagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }
  // The list of challenges is navigation. The brief is the work. Closed by
  // default so the work owns the panel; see the navigator below.
  const [listOpen, setListOpen] = useState(false);

  const currentAct = acts.find(a => a.id === activeActId) || acts[0];
  const actChallenges = challenges.filter(c => c.act === activeActId);
  const currentChallenge = challenges.find(c => c.id === selectedChallengeId) || actChallenges[0];

  // The challenges this one is written on top of, resolved to real entries. An
  // id that names nothing is dropped rather than rendered as a dead link; the
  // validator rejects such an id, so this only guards against a pack loaded
  // some other way.
  const builtOnLinks = (currentChallenge?.builtOn || [])
    .map(id => challenges.find(c => c.id === id))
    .filter(Boolean);

  const currentIndex = Math.max(0, actChallenges.findIndex(c => c.id === currentChallenge?.id));
  const prevChallenge = actChallenges[currentIndex - 1] || null;
  const nextChallenge = actChallenges[currentIndex + 1] || null;

  const isSolved = currentChallenge && !!solvesMap[currentChallenge.id];
  const solvedCountInAct = actChallenges.filter(c => solvesMap[c.id]).length;
  const actProgress = actChallenges.length > 0 ? (solvedCountInAct / actChallenges.length) * 100 : 0;

  // Check which acts are unlocked. An instructor is never gated.
  const isActUnlocked = (act) =>
    isAdmin || isActUnlockedFor(act, new Set(Object.keys(solvesMap)), challenges, acts);
  // What a STUDENT would see, so the instructor can tell the gate still works.
  const isActUnlockedForStudent = (act) =>
    isActUnlockedFor(act, new Set(Object.keys(solvesMap)), challenges, acts);

  const paidHints = (currentChallenge && unlockedHints[currentChallenge.id]) || 0;

  // ── Practising something already solved ───────────────────────────────────
  // Held here rather than in App because it is a way of looking at a
  // challenge, not a fact about the student. It ends when they navigate away.
  const [practisingId, setPractisingId] = useState(null);
  // Hints re-opened during practice. Separate from `paidHints` so that hiding
  // them cannot un-buy them: the student already paid, and this number only
  // decides what is on screen right now.
  const [practiceHintsShown, setPracticeHintsShown] = useState(0);

  const practising = !!currentChallenge && practisingId === currentChallenge.id;
  const history = practiceState(currentChallenge && solvesMap[currentChallenge.id]);

  // Selecting a different challenge leaves practice mode, and re-hides
  // anything that was reopened inside it.
  React.useEffect(() => {
    setPractisingId(null);
    setPracticeHintsShown(0);
  }, [selectedChallengeId]);

  const startPractice = () => {
    setPractisingId(currentChallenge.id);
    setPracticeHintsShown(0);
    setFeedback(null);
  };

  // During practice the answer is put away: the success message goes, and the
  // hints the student already owns collapse. Recalling something unaided is
  // most of where the value is, and it cannot happen with the answer on
  // screen. They come back with one click, at no cost.
  // What this challenge is the first to teach. Derived from the pack, so there
  // is no per-student "seen" state to keep in step with anything.
  const introductions = React.useMemo(
    () => firstEncounters({ challenges, manifest: packManifest || {} }),
    [challenges, packManifest]
  ).get(currentChallenge?.id) || [];

  const hintsRevealedCount = practising ? practiceHintsShown : paidHints;
  const hintsAreFree = practising;

  const [openingHint, setOpeningHint] = useState(false);

  // The hint awaiting a yes or no, or null. Holds the cost as it was when the
  // student clicked, so the figures in the dialog cannot drift under them.
  const [pendingHint, setPendingHint] = useState(null);

  // What a hint actually costs this challenge, in the terms a student cares
  // about: not "minus ten", but "you can still earn twenty of thirty".
  const hintArithmetic = (cost) => {
    const worth = currentChallenge?.points || 0;
    const spentAlready = (currentChallenge?.hints || [])
      .slice(0, paidHints)
      .reduce((sum, h) => sum + (h.cost || 0), 0);
    return { worth, spentAlready, cost, remaining: Math.max(0, worth - spentAlready - cost) };
  };

  const handleRevealNextHint = async (cost) => {
    if (!currentChallenge?.hints || openingHint) return;
    if (hintsRevealedCount >= currentChallenge.hints.length) return;

    // Already bought. Showing it again is a local act with no price and no
    // server call -- charging a second time would teach a student that going
    // back over their own work costs them, which is the wrong lesson to sell.
    if (practising && practiceHintsShown < paidHints) {
      setPracticeHintsShown(n => n + 1);
      return;
    }

    // A free hint needs no ceremony. A costed one is asked about in the page
    // rather than in a browser dialog -- see ConfirmDialog for why that swap
    // needed the platform's <dialog> and not another hand-rolled overlay.
    if (cost > 0) {
      setPendingHint({ index: hintsRevealedCount, cost });
      return;
    }
    await openHintNow();
  };

  const openHintNow = async () => {
    sounds.playKeypress();
    setOpeningHint(true);
    try {
      await onOpenHint(currentChallenge.id, hintsRevealedCount);
    } finally {
      setOpeningHint(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!flagInput.trim() || !currentChallenge) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      // No hint count. The server prices the penalty from its own record of
      // which hints were opened, so a number sent from the browser is at best
      // ignored and at worst a way to claim a discount that was not earned.
      const res = await onSubmitFlag(currentChallenge.id, flagInput.trim());
      // `res?.` deliberately. A handler that returns nothing is a bug, but the
      // student should not read the resulting TypeError in the box where their
      // answer goes.
      if (res?.success) {
        if (res.challengeId && res.challengeId !== currentChallenge.id) {
          const solved = challenges.find(c => c.id === res.challengeId);
          setFeedback({
            type: 'success',
            message: `That one belonged to '${solved?.title || res.challengeId}' — recorded there! (+${res.points} XP)`
          });
        } else if (res.alreadySolved) {
          setFeedback({
            type: 'success',
            message: 'Still right — and still yours. Nothing scored, which is the point of practice.'
          });
        } else {
          setFeedback({ type: 'success', message: res.successMessage || 'Found it!' });
        }
        setFlagInput('');
      } else {
        setFeedback({ type: 'error', message: res?.error || nextWrongAnswerMessage() });
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Submission error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextChallenge = () => {
    const currentIndex = actChallenges.findIndex(c => c.id === currentChallenge.id);
    if (currentIndex < actChallenges.length - 1) {
      onSelectChallenge(actChallenges[currentIndex + 1].id);
      setFeedback(null);
    } else {
      // Find next unlocked act — and always say something at the boundaries
      const nextAct = acts.find(a => a.id === activeActId + 1);
      if (nextAct && isActUnlocked(nextAct)) {
        setActiveActId(nextAct.id);
        const nextActChallenges = challenges.filter(c => c.act === nextAct.id);
        if (nextActChallenges[0]) onSelectChallenge(nextActChallenges[0].id);
        setFeedback(null);
      } else if (nextAct) {
        // How many more solves in THIS act would open the next one.
        const solvedInThisAct = actChallenges.filter(c => solvesMap[c.id]).length;
        setFeedback({
          type: 'success',
          message: actLockedCopy(
            Math.max(0, requiredSolvesToUnlock(nextAct.id, challenges, acts) - solvedInThisAct),
            currentAct?.name || 'the previous act'
          )
        });
      } else {
        setFeedback({
          type: 'success',
          message: 'That was the last challenge in this act. Take a look at the leaderboard, or switch packs for something new.'
        });
      }
    }
  };

  return (
    <div className="w-80 md:w-96 flex-none bg-term-sidebar border-r-2 border-term-sidebar-border flex flex-col h-full overflow-hidden text-neutral-200 select-none">
      {/* Platform & Act Select Header */}
      <div className="p-4 border-b border-term-sidebar-border bg-term-sidebar-deep flex-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">{currentAct?.icon}</span>
            {/* Act names are evocative and opaque on purpose -- "First on
                Scene", "The Night Shift" -- and a student has no way to know
                what a term of that act contains. Every pack already writes
                that down as `tagline`, and this slot used to spend itself on
                `glyph`: a decorative "---.---" that said nothing. The
                explanation goes where the decoration was. */}
            <div className="min-w-0">
              <div className="text-xs font-bold text-green-400 tracking-wider">{currentAct?.name}</div>
              {currentAct?.tagline && (
                <div className="text-[10px] text-neutral-400 leading-snug mt-0.5">
                  {currentAct.tagline}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-term-green-faint border border-term-green/30 text-term-green text-xs font-bold">
            <Zap size={13} className="fill-term-green" />
            <span>{totalScore} XP</span>
          </div>
        </div>

        {/* Act Switcher Tabs. The column count follows the pack: hardcoding six
            left three empty cells on the 3-act and 4-act packs. */}
        <div
          className="grid gap-1 bg-term-sidebar-deep p-1 rounded-lg border border-term-sidebar-border"
          style={{ gridTemplateColumns: `repeat(${Math.max(acts.length, 1)}, minmax(0, 1fr))` }}
        >
          {acts.map((act) => {
            const unlocked = isActUnlocked(act);
            const studentUnlocked = isActUnlockedForStudent(act);
            const isActive = act.id === activeActId;
            // A Windows-only act reads as WIN rather than as a number; this was
            // hardcoded to act 6, which is only true of one pack.
            const actCs = challenges.filter(c => c.act === act.id);
            const label = actCs.length && actCs.every(c => c.platform === 'windows') ? 'Win' : act.id;
            return (
              <button
                key={act.id}
                onClick={() => {
                  if (unlocked) {
                    setActiveActId(act.id);
                    const firstC = challenges.find(c => c.act === act.id);
                    if (firstC) onSelectChallenge(firstC.id);
                    setFeedback(null);
                  }
                }}
                disabled={!unlocked}
                className={`py-1.5 rounded text-center transition-all text-xs font-bold flex flex-col items-center justify-center cursor-pointer ${
                  isActive
                    ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.4)]'
                    : unlocked
                      ? `text-neutral-400 hover:text-white hover:bg-term-sidebar-raised${!studentUnlocked ? ' ring-1 ring-amber-500/50' : ''}`
                      : 'text-neutral-500 opacity-40 cursor-not-allowed'
                }`}
                title={
                  isAdmin && !studentUnlocked
                    ? `${act.name} — open to you as instructor. A student would still need ${requiredSolvesToUnlock(act.id, challenges, acts)} solves in the previous act.`
                    : `${act.name}${!unlocked ? ` — locked. Solve ${requiredSolvesToUnlock(act.id, challenges, acts)} of the previous act's challenges.` : ''}`
                }
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[10px] font-bold tracking-wider">
            <Layers size={11} />
            <span>Instructor view — every act open</span>
            <span className="ml-auto font-normal normal-case tracking-normal text-amber-200/70">
              amber outline = still locked for students
            </span>
          </div>
        )}

      </div>

      {/* ── Where you are, and the way to anywhere else ─────────────────
          This was an always-open list with its own faint scrollbar, sitting
          between the act header and the brief. Two scroll regions competed in
          one 320px column, the inner scrollbar was nearly invisible, and the
          thing a student came to read started below the fold.

          So the list collapses. What stays on screen is a single line saying
          where you are out of how many, with the act's progress under it and
          an arrow on each side for the commonest move of all -- the next one.
          The full list is one tap away, opens in place above the brief, and
          closes again as soon as something is chosen -- nobody reads a brief
          and a contents page at the same moment. */}
      {/* The two arrows are colour-coded by DIRECTION, and the colours are the
          ones this product already uses rather than a new pair:

            forward  term-green, 9.59:1 -- the same green as the "Next
                     Challenge" button a student presses after solving, so
                     green means "onward" in one voice across the panel.
            back     term-cyan,  7.59:1 -- distinct from green, and distinct
                     from term-amber, which is already spoken for: amber is
                     "solved a while ago, worth revisiting" on the tick glyph.
                     Reusing it here would say something it does not mean.

          Colour is never the only signal (WCAG 1.4.1): the glyphs already point
          opposite ways, and each button carries an aria-label naming the actual
          task it leads to. A dead end drops to neutral rather than dimming a
          colour, so "there is nothing that way" reads as absence rather than as
          a faded instruction. */}
      <div className="flex-none border-b border-term-sidebar-border bg-term-sidebar-deep/60">
        <div className="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => { if (prevChallenge) { onSelectChallenge(prevChallenge.id); setFeedback(null); } }}
            disabled={!prevChallenge}
            aria-label={prevChallenge ? `Previous task: ${prevChallenge.title}` : 'No previous task'}
            className="p-1.5 rounded text-term-cyan hover:text-cyan-200 hover:bg-term-sidebar-raised
                       disabled:opacity-30 disabled:text-neutral-500 disabled:hover:bg-transparent
                       disabled:cursor-default
                       cursor-pointer transition-colors shrink-0
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-cyan"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={() => setListOpen(open => !open)}
            aria-expanded={listOpen}
            aria-controls="challenge-list"
            className="flex-1 min-w-0 px-2 py-1 rounded text-left cursor-pointer
                       hover:bg-term-sidebar-raised transition-colors
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green"
          >
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-neutral-200">
                Task {currentIndex + 1} of {actChallenges.length}
              </span>
              <ChevronDown
                size={14}
                className={`text-neutral-400 transition-transform ${listOpen ? 'rotate-180' : ''}`}
              />
            </span>
            <span className="block text-[10px] text-neutral-400 truncate">
              {solvedCountInAct} of {actChallenges.length} solved in this act
            </span>
          </button>

          <button
            type="button"
            onClick={() => { if (nextChallenge) { onSelectChallenge(nextChallenge.id); setFeedback(null); } }}
            disabled={!nextChallenge}
            aria-label={nextChallenge ? `Next task: ${nextChallenge.title}` : 'No next task'}
            className="p-1.5 rounded text-term-green hover:text-green-300 hover:bg-term-sidebar-raised
                       disabled:opacity-30 disabled:text-neutral-500 disabled:hover:bg-transparent
                       disabled:cursor-default
                       cursor-pointer transition-colors shrink-0
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-term-green"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* The act's progress, as a rule under the navigator rather than as a
            fourth widget of its own. */}
        <div
          className="h-1 bg-term-sidebar-deep"
          role="progressbar"
          aria-valuenow={solvedCountInAct}
          aria-valuemin={0}
          aria-valuemax={actChallenges.length}
          aria-label={`Act progress: ${solvedCountInAct} of ${actChallenges.length} solved`}
        >
          <div
            className="h-full bg-term-green transition-all duration-300"
            style={{ width: `${actProgress}%` }}
          />
        </div>
      </div>

      {listOpen && (
        <div
          id="challenge-list"
          className="flex-none max-h-[60vh] overflow-y-auto p-3 space-y-1 border-b border-term-sidebar-border
                     bg-term-sidebar-deep/60 scrollbar-thin scrollbar-thumb-neutral-600"
        >
          {actChallenges.map((challenge, idx) => {
            const solved = !!solvesMap[challenge.id];
            const stale = practiceState(solvesMap[challenge.id]).worthRevisiting;
            const isSelected = currentChallenge?.id === challenge.id;

            return (
              <button
                key={challenge.id}
                onClick={() => { onSelectChallenge(challenge.id); setFeedback(null); setListOpen(false); }}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between cursor-pointer border ${
                  isSelected
                    ? 'bg-term-green-faint border-term-green text-white font-medium shadow-[0_0_10px_rgba(34,197,94,0.15)]'
                    : solved
                      ? 'bg-term-sidebar-raised/70 border-term-sidebar-border text-neutral-300 hover:border-neutral-500'
                      : 'bg-transparent border-transparent text-neutral-400 hover:bg-term-sidebar-raised hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 truncate pr-2">
                  {solved ? (
                    /* Solved, but a while ago. The GLYPH changes as well as the
                       colour: an amber tick and a green tick differ only in hue,
                       which is invisible to roughly one man in twelve and fails
                       WCAG 1.4.1. The circular arrow says "come back to this" on
                       its own, and the label says it in words. */
                    stale ? (
                      <RotateCcw
                        size={14}
                        className="text-term-amber shrink-0"
                        aria-label="solved a while ago, worth revisiting"
                      />
                    ) : (
                      <CheckCircle2 size={14} className="text-term-green shrink-0" aria-label="solved" />
                    )
                  ) : (
                    <Circle size={14} className="text-neutral-500 shrink-0" />
                  )}
                  <span className="truncate">{idx + 1}. {challenge.title}</span>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-term-sidebar-deep text-neutral-400 shrink-0">
                  +{challenge.points}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active Challenge Briefing Box */}
      {currentChallenge && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-800">
          <div>
            {/* Title & Points Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <span className="text-[10px] font-bold text-neutral-400 tracking-wider">
                  {currentAct.name}
                </span>
                <h3 className="text-sm font-bold text-green-400 mt-0.5">
                  {currentChallenge.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-term-green px-2 py-1 rounded bg-term-green-faint border border-term-green/30 shrink-0">
                <Trophy size={12} />
                +{currentChallenge.points} XP
              </div>
            </div>

            {/* ── What this one stands on ───────────────────────────────
                `teaches` says what a challenge covers; `builtOn` says what a
                student is assumed to have done already. That is the sentence a
                stuck student needs and cannot otherwise get: not "you are
                locked out", but "this expects the thing you did three tasks
                ago, and here it is again". So it is a link, not a label.

                One line, and no more. There is no dependency graph to draw
                here and drawing one would put a diagram between a beginner and
                a task. The act is set alongside the selection because the
                named challenge may live in an earlier act, and choosing it
                without moving the act leaves the list showing somewhere else. */}
            {builtOnLinks.length > 0 && (
              <p className="text-[11px] text-neutral-400 mb-3 leading-relaxed">
                Follows on from:{' '}
                {builtOnLinks.map((dep, i) => (
                  <React.Fragment key={dep.id}>
                    {i > 0 && <span className="text-neutral-500">, </span>}
                    <button
                      onClick={() => {
                        if (dep.act) setActiveActId(dep.act);
                        onSelectChallenge(dep.id);
                      }}
                      className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200
                                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                                 focus-visible:outline-term-green rounded cursor-pointer"
                    >
                      {dep.title}
                    </button>
                  </React.Fragment>
                ))}
              </p>
            )}

            {/* ── The task, said as a task ──────────────────────────────
                A brief is a scene: where you are, why it matters, and -- in
                one sentence somewhere inside it -- what to do. Nothing marked
                which sentence that was, so the screen offered a student three
                sentences of story and no visible instruction. They read the
                title, looked for the task, did not find one, and typed
                nothing.

                So the instruction comes out of the prose, gets a label, and
                goes first. `objective` is the pack's line; a pack that has not
                written one still gets the frame, with its brief inside it,
                because the framing is the engine's job and the words are the
                pack's.

                The order below is what a stuck student actually wants, in
                order: what am I asked to do, what do these words mean, and
                only then, why does this matter. */}
            <div className="mb-3 rounded-lg border border-term-amber/40 bg-term-amber/10 p-3.5 select-text cursor-text">
              <div className="text-[10px] font-bold text-term-amber tracking-widest mb-1.5">
                YOUR TASK
              </div>
              <p className="text-xs text-neutral-100 leading-relaxed font-mono">
                {formatBriefText(currentChallenge.objective || currentChallenge.brief)}
              </p>
            </div>

            {/* What this thing IS, before what to do with it. A brief used to
                say "run grep" and nothing ever said what grep was; the man page
                said it well and lived behind a command a beginner has no reason
                to run about a tool they have not met. Shown on the challenge
                that introduces each term. */}
            {introductions.length > 0 && (
              <div className="mb-3 space-y-2">
                {introductions.map(def => (
                  <div
                    key={def.tag}
                    className="text-xs leading-relaxed bg-term-green-faint border border-term-green/30
                               rounded-lg p-3 select-text cursor-text"
                  >
                    <span className="font-bold text-term-green">{def.term}</span>
                    <span className="text-neutral-500"> — new here</span>
                    <p className="text-neutral-200 mt-1">{formatBriefText(def.what)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* The scene. Only shown when the task line is a separate thing --
                otherwise this is the same text twice. */}
            {currentChallenge.objective && (
              <div className="text-xs text-neutral-400 leading-relaxed bg-term-sidebar-raised p-3.5 rounded-lg border border-term-sidebar-border mb-4 font-mono select-text cursor-text">
                <div className="text-[10px] font-bold text-neutral-400 tracking-widest mb-1.5">
                  THE SITUATION
                </div>
                {formatBriefText(currentChallenge.brief)}
              </div>
            )}

            {/* Hint Accordion */}
            {currentChallenge.hints && currentChallenge.hints.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="text-xs font-bold text-neutral-400 tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lightbulb size={13} className="text-term-amber" /> Hints
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {practising
                      ? `${hintsRevealedCount}/${paidHints} shown — already paid for`
                      : `${hintsRevealedCount}/${currentChallenge.hints.length} unlocked`}
                  </span>
                </div>

                {currentChallenge.hints.map((hint, idx) => {
                  const isRevealed = idx < hintsRevealedCount;
                  if (!isRevealed) return null;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-amber-950/30 border border-amber-800 text-xs text-amber-200 leading-relaxed font-mono select-text cursor-text"
                    >
                      <span className="font-bold text-amber-400">Hint {idx + 1}: </span>
                      {formatBriefText(hint.text)}
                    </div>
                  );
                })}

                {/* In practice, only hints the student already bought can come
                    back. Buying a NEW one mid-practice would charge for a
                    challenge that can no longer pay, so the button stops at
                    what they own. */}
                {hintsRevealedCount < (practising ? paidHints : currentChallenge.hints.length) && (
                  <button
                    onClick={() => handleRevealNextHint(currentChallenge.hints[hintsRevealedCount].cost || 0)}
                    disabled={openingHint}
                    className="w-full py-2 px-3 rounded-lg bg-term-sidebar-raised border border-dashed border-term-sidebar-border hover:border-amber-500/50 hover:bg-term-sidebar-deep text-xs text-amber-300 flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle size={13} />
                      {hintsAreFree ? 'Show' : 'Unlock'} Hint {hintsRevealedCount + 1}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-900 text-amber-400 border border-amber-900/40">
                      {hintsAreFree || currentChallenge.hints[hintsRevealedCount].cost === 0
                        ? 'Free'
                        : `-${currentChallenge.hints[hintsRevealedCount].cost} XP`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Submission and Success Section */}
          <div className="pt-2">
            {isSolved && practising ? (
              /* Practising something already owned. The answer is put away and
                 the terminal is the only place to prove it again. Nothing here
                 is scored: the run is worth doing, and worth nothing. */
              <div className="p-3 rounded-lg bg-term-sidebar-raised border border-term-border text-xs space-y-2 mb-2">
                <div className="font-bold flex items-center gap-1.5 text-neutral-200">
                  <RotateCcw size={14} /> Practising
                </div>
                <div className="text-[11px] leading-relaxed text-neutral-400">
                  {currentChallenge.success?.kind === 'flag'
                    ? 'The answer is hidden and the points are already yours, so this run is worth '
                      + 'nothing and worth doing. Go and find it again.'
                    : 'The answer is hidden and the points are already yours, so this run is worth '
                      + 'nothing and worth doing. Run the command in the terminal from memory.'}
                </div>

                {/* A flag challenge is proved by pasting, so practice needs the
                    box back. The server answers a second submission with
                    alreadySolved and pays nothing, which is the behaviour we
                    want anyway. */}
                {currentChallenge.success?.kind === 'flag' && (
                  <form onSubmit={handleSubmit} className="pt-1">
                    <input
                      type="text"
                      value={flagInput}
                      onChange={(e) => setFlagInput(e.target.value)}
                      placeholder="FIND{...}"
                      spellCheck="false"
                      autoComplete="off"
                      className="w-full px-2.5 py-2 rounded bg-term-black border border-term-border
                                 text-xs font-mono text-neutral-200 placeholder-neutral-600
                                 focus:border-term-green focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !flagInput.trim()}
                      className="w-full mt-2 py-2 rounded bg-term-sidebar-deep border border-term-border
                                 text-neutral-300 hover:text-white font-bold text-xs tracking-wider
                                 flex items-center justify-center gap-1.5 transition-all cursor-pointer
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={13} /> Check it
                    </button>
                  </form>
                )}

                {feedback && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`text-[11px] leading-relaxed ${
                      feedback.type === 'success' ? 'text-term-green' : 'text-red-300'
                    }`}
                  >
                    {feedback.message}
                  </div>
                )}
                <button
                  onClick={() => { setPractisingId(null); setPracticeHintsShown(0); }}
                  className="w-full mt-1 py-2 rounded bg-term-sidebar-deep border border-term-border text-neutral-300 hover:text-white font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Eye size={13} /> Show me the answer again
                </button>
              </div>
            ) : isSolved ? (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700 text-emerald-300 text-xs space-y-2 mb-2">
                <div className="font-bold flex items-center justify-between gap-2 text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> SOLVED (+{solvesMap[currentChallenge.id].netPoints} XP)
                  </span>
                  {history.sinceLabel && (
                    <span className="text-[10px] font-normal text-emerald-600/90">
                      {history.sinceLabel}
                    </span>
                  )}
                </div>
                <div className="text-[11px] leading-relaxed text-emerald-200 font-mono">
                  {currentChallenge.successMessage}
                </div>

                {/* Retrieval beats re-reading, and it is the one study habit a
                    student will not adopt unless something asks them to. */}
                <button
                  onClick={startPractice}
                  className={`w-full py-2 rounded border font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    history.worthRevisiting
                      ? 'bg-term-amber/15 border-term-amber/50 text-amber-300 hover:bg-term-amber/25'
                      : 'bg-transparent border-emerald-800 text-emerald-300 hover:bg-emerald-900/40'
                  }`}
                >
                  <RotateCcw size={13} />
                  {history.worthRevisiting ? 'Worth a revisit — practise it' : 'Practise it again'}
                </button>

                <button
                  onClick={handleNextChallenge}
                  className="w-full py-2 rounded bg-term-green text-term-black font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 hover:bg-green-400 transition-all cursor-pointer"
                >
                  Next Challenge <ChevronRight size={14} />
                </button>
              </div>
            ) : currentChallenge.success?.kind !== 'flag' ? (
              /* Command/state challenges have no flag: kill the "what do I type
                 in the box?" hunt before it starts */
              <div className="p-3 rounded-lg bg-term-sidebar-raised border border-term-sidebar-border text-xs text-neutral-300">
                <span className="text-term-green font-bold">Nothing to paste.</span> This challenge
                completes automatically the moment you run the right command in the terminal.
              </div>
            ) : (
              <div>
                {/* Submit a find */}
                <form onSubmit={handleSubmit} className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={flagInput}
                      onChange={(e) => { setFlagInput(e.target.value); setFeedback(null); }}
                      placeholder="Submit flag (e.g. FLAG{...})"
                      className="w-full bg-term-sidebar-raised border border-term-sidebar-border rounded px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green font-mono"
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="submit"
                      aria-label="Submit this find"
                      disabled={submitting || !flagInput.trim()}
                      className="absolute right-1.5 top-1.5 px-2.5 py-1 rounded bg-term-green text-term-black font-bold text-[11px] hover:bg-green-400 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      {submitting ? '...' : <Send size={11} />}
                    </button>
                  </div>

                  {feedback && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`p-2 rounded text-[11px] flex items-start gap-1.5 ${
                        feedback.type === 'success'
                          ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                          : 'bg-red-950/40 border border-red-800 text-red-300'
                      }`}
                    >
                      <AlertCircle size={13} className="shrink-0 mt-0.5" />
                      <span>{feedback.message}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-neutral-500 text-center">
                    You can also type <code className="text-term-green">submit &lt;find&gt;</code> in the terminal.
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spending points is the one thing here a student cannot undo, so it is
          asked in the page, with the arithmetic shown rather than a bare cost. */}
      <ConfirmDialog
        open={!!pendingHint}
        title={`Reveal hint ${(pendingHint?.index ?? 0) + 1}?`}
        confirmLabel={`Reveal it (-${pendingHint?.cost ?? 0} XP)`}
        cancelLabel="Not yet"
        onCancel={() => setPendingHint(null)}
        onConfirm={async () => {
          setPendingHint(null);
          await openHintNow();
        }}
      >
        {pendingHint && (() => {
          const a = hintArithmetic(pendingHint.cost);
          return (
            <>
              <p>
                This hint costs <span className="text-term-amber font-bold">{a.cost} XP</span>, taken
                off what this challenge can still pay you.
              </p>
              <p className="text-neutral-400">
                {currentChallenge?.title} is worth {a.worth} XP
                {a.spentAlready > 0 && <> and you have spent {a.spentAlready} on hints already</>}.
                Take this one and you can still earn{' '}
                <span className="text-term-green font-bold">{a.remaining} XP</span> for it.
              </p>
              <p className="text-neutral-500">
                Solving it is worth more than the points. A hint you needed is cheaper than
                twenty minutes stuck.
              </p>
            </>
          );
        })()}
      </ConfirmDialog>
    </div>
  );
};
