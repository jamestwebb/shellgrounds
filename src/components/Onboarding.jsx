// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// What a student sees between signing in and their first command.
//
// Three screens, and a student may see one, two, or none of them:
//
//   Welcome    what Shellgrounds is. Once per student, ever.
//   Choose     which course. Only when the site offers more than one; with one
//              pack there is no choice to make and asking is just a click.
//   Briefing   the scenario, and what this course teaches. Once per pack.
//
// The rule behind all three: explain once, then get out of the way. A student
// opening the site in week six wants their terminal, not the tour. Whether a
// screen has been seen is recorded against the account rather than the browser,
// because a student on a shared lab machine gets a different browser every
// week and would otherwise be welcomed to Shellgrounds every single time.

import React from 'react';
import {
  Terminal, Flag, Trophy, Lightbulb, ArrowRight, Check, Users, Monitor
} from 'lucide-react';
import { BrandMark } from './BrandMark';

const Shell = ({ children, footer }) => (
  <div className="min-h-screen bg-term-void flex flex-col items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-3xl">
      <div className="bg-term-gray border border-term-border rounded-xl overflow-hidden shadow-2xl">
        {children}
      </div>
      {footer && <div className="mt-4 text-center">{footer}</div>}
    </div>
  </div>
);

const Primary = ({ children, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="px-5 py-2.5 rounded-lg bg-term-green text-term-black font-bold text-sm
               flex items-center gap-2 cursor-pointer hover:brightness-110 transition-all
               disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

// ── 1. What this is ─────────────────────────────────────────────────────────

const POINTS = [
  {
    icon: Terminal,
    title: 'A real terminal, safely',
    body: 'You type actual commands into a simulated machine. Nothing you do here can break '
        + 'anything, so the fastest way to learn is to try something and read what comes back.'
  },
  {
    icon: Flag,
    title: 'Capture flags to prove it',
    body: 'Each challenge is solved by doing the thing, not by describing it. Some hide a flag '
        + 'in the filesystem for you to find; others watch what your command actually produced.'
  },
  {
    icon: Trophy,
    title: 'Your flags are yours',
    body: 'Every student gets different flags, generated from their own handle. A classmate’s '
        + 'answer will not work for you, so the leaderboard is a record of what you did.'
  },
  {
    icon: Lightbulb,
    title: 'Hints are not cheating',
    body: 'The first hint on every challenge is free. Later ones cost a few points, and nothing '
        + 'is ever locked behind one. There are no timers and no streaks to lose.'
  }
];

export const Welcome = ({ handle, onContinue, continueLabel = 'Continue' }) => (
  <Shell>
    <div className="p-6 sm:p-8 border-b border-term-border">
      <BrandMark />
      <h1 className="mt-4 text-xl sm:text-2xl font-bold text-green-200">
        Welcome{handle ? `, ${handle}` : ''}.
      </h1>
      <p className="mt-2 text-sm text-neutral-300 leading-relaxed max-w-2xl">
        Shellgrounds teaches the command line by having you use it. Not a video, not a quiz —
        a terminal, a problem, and a flag you can only capture by solving it.
      </p>
    </div>

    <div className="p-6 sm:p-8 grid gap-5 sm:grid-cols-2">
      {POINTS.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex gap-3">
          <Icon size={17} className="text-term-green shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-green-200">{title}</h2>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
      ))}
    </div>

    <div className="p-6 sm:p-8 pt-0 flex justify-end">
      <Primary onClick={onContinue}>{continueLabel} <ArrowRight size={15} /></Primary>
    </div>
  </Shell>
);

// ── 2. Which course ─────────────────────────────────────────────────────────

const PlatformLine = ({ platforms = [] }) => (
  <span className="inline-flex items-center gap-2 text-[11px] text-neutral-500">
    {platforms.includes('linux') && (
      <span className="inline-flex items-center gap-1"><Terminal size={11} /> Linux</span>
    )}
    {platforms.includes('windows') && (
      <span className="inline-flex items-center gap-1"><Monitor size={11} /> Windows</span>
    )}
  </span>
);

export const ChoosePack = ({ packs, onChoose, currentPackId = null }) => (
  <Shell
    footer={
      <p className="text-[11px] text-neutral-500">
        You can switch between courses at any time from the header. Your progress in each one is
        kept separately.
      </p>
    }
  >
    <div className="p-6 sm:p-8 border-b border-term-border">
      <h1 className="text-lg sm:text-xl font-bold text-green-200">Choose your course</h1>
      <p className="mt-1.5 text-sm text-neutral-400">
        Your teacher has made {packs.length} available. Each one is a full course with its own
        machine, its own story, and its own leaderboard.
      </p>
    </div>

    <div className="p-4 sm:p-6 space-y-3">
      {packs.map(pack => {
        const m = pack.manifest;
        const current = pack.id === currentPackId;
        return (
          <button
            key={pack.id}
            type="button"
            onClick={() => onChoose(pack.id)}
            className="w-full text-left p-4 rounded-lg bg-term-black border border-term-border
                       hover:border-term-green/60 hover:bg-term-gray transition-all cursor-pointer
                       flex gap-4 group"
          >
            {m.cover ? (
              <img
                src={m.cover}
                alt=""
                className="w-14 h-14 rounded object-cover shrink-0 border border-term-border"
              />
            ) : (
              <span className="w-14 h-14 rounded bg-term-gray border border-term-border shrink-0
                               flex items-center justify-center text-2xl">
                {m.icon || '📦'}
              </span>
            )}

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-bold text-green-200 group-hover:text-term-green transition-colors">
                  {m.name}
                </span>
                {current && (
                  <span className="text-[10px] uppercase tracking-wider text-term-green
                                   inline-flex items-center gap-1">
                    <Check size={10} /> current
                  </span>
                )}
              </span>

              {m.description && (
                <span className="block text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  {m.description}
                </span>
              )}

              <span className="flex flex-wrap items-center gap-3 mt-2">
                <span className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                  <Users size={11} /> {pack.challenges.length} challenges
                </span>
                <PlatformLine platforms={m.platforms} />
              </span>
            </span>

            <ArrowRight
              size={16}
              className="text-neutral-600 group-hover:text-term-green transition-colors shrink-0 mt-1"
            />
          </button>
        );
      })}
    </div>
  </Shell>
);

// ── 3. The scenario ─────────────────────────────────────────────────────────

export const PackBriefing = ({ pack, onStart, onBack = null }) => {
  const m = pack.manifest;
  const b = m.briefing || {};
  const acts = m.acts || [];

  return (
    <Shell>
      <div className="p-6 sm:p-8 border-b border-term-border flex gap-4 items-start">
        {m.cover ? (
          <img src={m.cover} alt="" className="w-14 h-14 rounded object-cover shrink-0 border border-term-border" />
        ) : (
          <span className="text-3xl shrink-0">{m.icon || '📦'}</span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500">{m.name}</p>
          <h1 className="text-lg sm:text-xl font-bold text-green-200 mt-0.5">
            {b.heading || 'Your briefing'}
          </h1>
        </div>
      </div>

      {b.body && (
        <div className="p-6 sm:p-8 border-b border-term-border">
          {b.body.split('\n\n').map((para, i) => (
            <p key={i} className="text-sm text-neutral-300 leading-relaxed mb-3 last:mb-0">
              {para}
            </p>
          ))}
        </div>
      )}

      {b.youWillLearn?.length > 0 && (
        <div className="p-6 sm:p-8 border-b border-term-border">
          <h2 className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            By the end you will be able to
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {b.youWillLearn.map(line => (
              <li key={line} className="flex gap-2 text-xs text-neutral-300">
                <Check size={13} className="text-term-green shrink-0 mt-0.5" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {acts.length > 0 && (
        <div className="p-6 sm:p-8 border-b border-term-border">
          <h2 className="text-xs uppercase tracking-wider text-neutral-400 font-medium">
            {acts.length} acts
          </h2>
          <ul className="mt-3 space-y-2">
            {acts.map(act => (
              <li key={act.id} className="flex gap-2.5 text-xs">
                <span className="shrink-0">{act.icon || '·'}</span>
                <span className="min-w-0">
                  <span className="text-neutral-200">{act.name}</span>
                  {act.tagline && <span className="text-neutral-500"> — {act.tagline}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="p-6 sm:p-8 flex items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors"
          >
            Choose a different course
          </button>
        ) : <span />}
        <Primary onClick={onStart}>Open the terminal <ArrowRight size={15} /></Primary>
      </div>
    </Shell>
  );
};
