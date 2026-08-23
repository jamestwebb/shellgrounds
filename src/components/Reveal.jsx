// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The shore: one picture, uncovered by the whole class.
//
// What this screen must never do, in order of how easy it would be to do by
// accident:
//
//   Rank anybody. Not by tiles, not by points, not by "top contributors". The
//   endpoint does not send scores, and this file must not invent an ordering
//   out of what it does send. The feed is chronological, and stays that way.
//
//   Make a slow student visible. There is no "waiting on 3 students" line and
//   no per-person progress. The picture is the class's, and it finishes well
//   before the last person does.
//
//   Erase people. Every tile remembers who uncovered it, and hovering says so.
//   Recognition without ranking is the whole point: names, no order.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Users, Sparkles, Clock } from 'lucide-react';
import { fetchReveal } from '../utils/api';
import { getPack } from '../../packs/index.js';

const ago = (iso) => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.floor(h / 24)} d ago`;
};

export const Reveal = ({ packId, handle }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);

  // How often the picture catches up with the class, in milliseconds. It is a
  // shared thing being worked on by other people, so it has to move on its own
  // — but each poll costs the server a read per student, so this is minutes
  // rather than seconds, and it stops entirely when the tab is not being
  // looked at.
  const POLL_MS = 60_000;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReveal(packId);
      if (!res) throw new Error('Could not read the class picture.');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not read the class picture.');
    } finally {
      setLoading(false);
    }
  }, [packId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load(); };
    const timer = setInterval(tick, POLL_MS);
    // Catch up immediately on coming back, rather than making somebody wait out
    // the rest of an interval that ran while the tab was hidden.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  // index -> who uncovered it
  const byIndex = useMemo(() => {
    const m = new Map();
    for (const t of data?.tiles || []) m.set(t.index, t);
    return m;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
        <RefreshCw size={13} className="animate-spin" /> Looking at what the class has found…
      </div>
    );
  }

  if (error && !data) {
    return <div className="p-8 text-center text-xs text-red-300">{error}</div>;
  }

  const {
    columns, rows, total, uncovered, complete, contributors, yours, accent,
    target, finds
  } = data;
  // The art comes from this browser's own copy of the pack, not down the wire
  // on every poll.
  const image = data.hasImage
    ? (getPack(data.packId)?.manifest?.reveal || getPack(data.packId)?.manifest?.cover || null)
    : null;
  // Progress is a share of the picture, not a count of squares. The squares are
  // only how it is drawn, and the grid gets finer as the class gets bigger.
  const pct = Math.round((data.fraction ?? (total ? uncovered / total : 0)) * 100);

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-term-green flex items-center gap-2">
            <Sparkles size={15} /> The shore
          </h2>
          <p className="text-[11px] text-neutral-400 mt-1 max-w-lg leading-relaxed">
            {complete
              ? `Your class uncovered the whole picture from ${data.packName}. Anything found now still counts towards your own work — there is simply no more of it to turn over.`
              : 'Everything anyone in the class finds uncovers a little more of this. Nobody is racing anybody; the picture belongs to all of you.'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800
                     text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── The picture ──────────────────────────────────────────────────── */}
      <div
        className="relative rounded-lg overflow-hidden border border-term-border bg-term-black"
        style={{ aspectRatio: `${columns} / ${rows}` }}
      >
        {image ? (
          <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          // A pack with no art still gets a picture: its own accent, so the
          // reveal is not a privilege of packs that shipped an image.
          <div
            className="absolute inset-0"
            style={{
              background: accent
                ? `radial-gradient(circle at 30% 25%, ${accent}55, transparent 60%), radial-gradient(circle at 75% 70%, ${accent}33, #0a0a09)`
                : '#0a0a09'
            }}
          />
        )}

        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        >
          {Array.from({ length: total }, (_, i) => {
            const tile = byIndex.get(i);
            const open = !!tile;
            return (
              <div
                key={i}
                onMouseEnter={() => open && setHovered(tile)}
                onMouseLeave={() => setHovered(null)}
                className={`transition-all duration-700 ${
                  open
                    ? `opacity-0 ${tile.mine ? 'ring-1 ring-inset ring-term-green/40 opacity-10' : ''}`
                    : 'bg-term-gray/95 border border-term-void/40'
                }`}
                title={open ? `@${tile.handle} — ${tile.challengeId}` : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* ── Where it has got to ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-3 text-[11px]">
          <span className="text-neutral-300">
            {complete
              ? 'The whole picture'
              : <>{pct}% uncovered — <span className="text-neutral-500">{finds} of {target} finds</span></>}
          </span>
          <span className="text-neutral-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Users size={11} /> {contributors} finding</span>
            {yours > 0 && (
              <span className="text-term-green">
                you found {yours}
              </span>
            )}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-term-gray overflow-hidden">
          <div
            className="h-full bg-term-green transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {hovered && (
        <p className="text-[11px] text-neutral-400">
          <span className="text-term-green">@{hovered.handle}</span> turned that one over.
        </p>
      )}

      {/* ── Who found what, in the order it happened ─────────────────────── */}
      <div>
        <h3 className="text-[11px] text-neutral-400 flex items-center gap-1.5">
          <Clock size={11} /> Lately
        </h3>
        {data.feed.length === 0 ? (
          <p className="text-[11px] text-neutral-500 mt-2">
            Nothing found yet. The first square is there for whoever runs the first command.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.feed.map((f, i) => (
              <li key={`${f.handle}-${f.challengeId}-${i}`} className="flex gap-2 text-[11px]">
                <span className="text-neutral-600 w-16 shrink-0">{ago(f.solvedAt)}</span>
                <span className="min-w-0">
                  <span className={f.handle.toLowerCase() === String(handle).toLowerCase()
                    ? 'text-term-green' : 'text-neutral-300'}>
                    @{f.handle}
                  </span>
                  <span className="text-neutral-500"> found {f.title}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Every student gets a different find, so nobody can hand you theirs — and nobody here is
        ahead of or behind anybody. Helping someone next to you uncovers just as much as doing it
        yourself.{' '}
        {target > total && (
          <>The picture is sized to your class, so in a group this big each square takes a few
          finds between you.</>
        )}
      </p>
    </div>
  );
};
