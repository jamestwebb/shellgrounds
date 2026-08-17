// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Challenge Sidebar / Left Rail component for navigation, briefs, hints, and scoring

import React, { useState } from 'react';
import {
  CheckCircle2, Circle, Lock, Lightbulb, ChevronRight,
  Zap, Trophy, Send, Award, Layers, AlertCircle, HelpCircle
} from 'lucide-react';
import { ACT_DEFINITIONS } from '../data/challenges';
import { sounds } from '../utils/audio';

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
  platform = 'linux',
  onSwitchPlatform,
  // Hint state lives in App so the terminal `submit` path counts revealed hints too
  unlockedHints = {},
  setUnlockedHints = () => {}
}) => {
  const [flagInput, setFlagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }

  const currentAct = acts.find(a => a.id === activeActId) || acts[0];
  const actChallenges = challenges.filter(c => c.act === activeActId);
  const currentChallenge = challenges.find(c => c.id === selectedChallengeId) || actChallenges[0];

  const isSolved = currentChallenge && !!solvesMap[currentChallenge.id];
  const solvedCountInAct = actChallenges.filter(c => solvesMap[c.id]).length;
  const actProgress = actChallenges.length > 0 ? (solvedCountInAct / actChallenges.length) * 100 : 0;

  // Check which acts are unlocked
  const isActUnlocked = (act) => {
    if (act.unlockThreshold === 0) return true;
    const prevAct = acts.find(a => a.id === act.id - 1);
    if (!prevAct) return true;
    const prevChallenges = challenges.filter(c => c.act === prevAct.id);
    const prevSolved = prevChallenges.filter(c => solvesMap[c.id]).length;
    return prevChallenges.length === 0 || (prevSolved / prevChallenges.length) >= (act.unlockThreshold || 0.8);
  };

  const hintsRevealedCount = (currentChallenge && unlockedHints[currentChallenge.id]) || 0;

  const handleRevealNextHint = (cost) => {
    if (!currentChallenge?.hints) return;
    if (hintsRevealedCount >= currentChallenge.hints.length) return;

    if (cost > 0) {
      const ok = window.confirm(`This hint costs ${cost} XP, subtracted from this challenge's points. Reveal it?`);
      if (!ok) return;
    }

    sounds.playKeypress();
    setUnlockedHints(prev => ({
      ...prev,
      [currentChallenge.id]: hintsRevealedCount + 1
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!flagInput.trim() || !currentChallenge) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await onSubmitFlag(currentChallenge.id, flagInput.trim(), hintsRevealedCount);
      if (res.success) {
        if (res.challengeId && res.challengeId !== currentChallenge.id) {
          const solved = challenges.find(c => c.id === res.challengeId);
          setFeedback({
            type: 'success',
            message: `That flag belonged to '${solved?.title || res.challengeId}' — recorded there! (+${res.pointsAwarded} XP)`
          });
        } else {
          setFeedback({ type: 'success', message: res.successMessage || 'Flag accepted!' });
        }
        setFlagInput('');
      } else {
        setFeedback({ type: 'error', message: res.error || 'Incorrect flag. Try again.' });
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
        setFeedback({
          type: 'success',
          message: `LOCKED: ${nextAct.name} opens after you solve 80% of this act's challenges.`
        });
      } else {
        setFeedback({
          type: 'success',
          message: 'That was the last challenge in this act — check the leaderboard, or try the Topside (WIN) quest!'
        });
      }
    }
  };

  return (
    <div className="w-80 md:w-96 flex-none bg-term-panel border-r border-term-border flex flex-col h-full overflow-hidden text-neutral-200 select-none">
      {/* Platform & Act Select Header */}
      <div className="p-4 border-b border-term-border bg-term-gray flex-none">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentAct?.icon}</span>
            <div>
              <div className="text-xs font-bold text-green-400 uppercase tracking-wider">{currentAct?.name}</div>
              <div className="text-[10px] text-neutral-400">{currentAct?.glyph}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-term-green-faint border border-term-green/30 text-term-green text-xs font-bold">
            <Zap size={13} className="fill-term-green" />
            <span>{totalScore} XP</span>
          </div>
        </div>

        {/* Act Switcher Tabs */}
        <div className="grid grid-cols-6 gap-1 bg-term-black p-1 rounded-lg border border-term-border">
          {acts.map((act) => {
            const unlocked = isActUnlocked(act);
            const isActive = act.id === activeActId;
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
                      ? 'text-neutral-400 hover:text-white hover:bg-term-gray'
                      : 'text-neutral-500 opacity-40 cursor-not-allowed'
                }`}
                title={`${act.name} ${!unlocked ? '(Locked - Solve 80% of prior act)' : ''}`}
              >
                <span>{act.id === 6 ? 'WIN' : act.id}</span>
              </button>
            );
          })}
        </div>

        {/* Act Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-neutral-400 mb-1">
            <span>Act Progress</span>
            <span className="text-term-green font-bold">{solvedCountInAct}/{actChallenges.length} Solved</span>
          </div>
          <div className="h-1.5 bg-term-black rounded-full overflow-hidden border border-term-border">
            <div
              className="h-full bg-term-green transition-all duration-300"
              style={{ width: `${actProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Challenge List in current Act */}
      <div className="p-3 border-b border-term-border bg-term-black/50 max-h-48 overflow-y-auto flex-none space-y-1 scrollbar-thin scrollbar-thumb-neutral-800">
        {actChallenges.map((challenge, idx) => {
          const solved = !!solvesMap[challenge.id];
          const isSelected = currentChallenge?.id === challenge.id;

          return (
            <button
              key={challenge.id}
              onClick={() => { onSelectChallenge(challenge.id); setFeedback(null); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center justify-between cursor-pointer border ${
                isSelected
                  ? 'bg-term-green-faint border-term-green text-white font-medium shadow-[0_0_10px_rgba(34,197,94,0.15)]'
                  : solved
                    ? 'bg-term-gray/60 border-term-border text-neutral-300 hover:border-neutral-600'
                    : 'bg-transparent border-transparent text-neutral-400 hover:bg-term-gray hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                {solved ? (
                  <CheckCircle2 size={14} className="text-term-green shrink-0" />
                ) : (
                  <Circle size={14} className="text-neutral-500 shrink-0" />
                )}
                <span className="truncate">{idx + 1}. {challenge.title}</span>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-400 shrink-0">
                +{challenge.points}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Challenge Briefing Box */}
      {currentChallenge && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between scrollbar-thin scrollbar-thumb-neutral-800">
          <div>
            {/* Title & Points Header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
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

            {/* Briefing text */}
            <div className="text-xs text-neutral-300 leading-relaxed bg-term-gray p-3.5 rounded-lg border border-term-border mb-4 font-mono select-text cursor-text">
              {formatBriefText(currentChallenge.brief)}
            </div>

            {/* Hint Accordion */}
            {currentChallenge.hints && currentChallenge.hints.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lightbulb size={13} className="text-term-amber" /> Hints
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {hintsRevealedCount}/{currentChallenge.hints.length} unlocked
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

                {hintsRevealedCount < currentChallenge.hints.length && (
                  <button
                    onClick={() => handleRevealNextHint(currentChallenge.hints[hintsRevealedCount].cost || 0)}
                    className="w-full py-2 px-3 rounded-lg bg-term-gray border border-dashed border-term-border hover:border-amber-500/50 hover:bg-neutral-900 text-xs text-amber-300 flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle size={13} /> Unlock Hint {hintsRevealedCount + 1}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-900 text-amber-400 border border-amber-900/40">
                      {currentChallenge.hints[hintsRevealedCount].cost === 0
                        ? 'FREE'
                        : `-${currentChallenge.hints[hintsRevealedCount].cost} XP`}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Submission and Success Section */}
          <div className="pt-2">
            {isSolved ? (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700 text-emerald-300 text-xs space-y-2 mb-2">
                <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={15} /> SOLVED (+{solvesMap[currentChallenge.id].netPoints} XP)
                </div>
                <div className="text-[11px] leading-relaxed text-emerald-200 font-mono">
                  {currentChallenge.successMessage}
                </div>
                <button
                  onClick={handleNextChallenge}
                  className="w-full mt-2 py-2 rounded bg-term-green text-term-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 hover:bg-green-400 transition-all cursor-pointer"
                >
                  Next Challenge <ChevronRight size={14} />
                </button>
              </div>
            ) : currentChallenge.success?.kind !== 'flag' ? (
              /* Command/state challenges have no flag: kill the "what do I type
                 in the box?" hunt before it starts */
              <div className="p-3 rounded-lg bg-term-gray border border-term-border text-xs text-neutral-300">
                <span className="text-term-green font-bold">No flag needed.</span> This challenge
                completes automatically the moment you run the right command in the terminal.
              </div>
            ) : (
              <div>
                {/* Submit Flag Form */}
                <form onSubmit={handleSubmit} className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={flagInput}
                      onChange={(e) => { setFlagInput(e.target.value); setFeedback(null); }}
                      placeholder="Submit flag (e.g. FLAG{...})"
                      className="w-full bg-term-gray border border-term-border rounded px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green font-mono"
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="submit"
                      disabled={submitting || !flagInput.trim()}
                      className="absolute right-1.5 top-1.5 px-2.5 py-1 rounded bg-term-green text-term-black font-bold text-[11px] hover:bg-green-400 disabled:opacity-40 transition-all cursor-pointer"
                    >
                      {submitting ? '...' : <Send size={11} />}
                    </button>
                  </div>

                  {feedback && (
                    <div
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
                    You can also type <code className="text-term-green">submit &lt;flag&gt;</code> in the terminal.
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
