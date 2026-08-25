// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Public Leaderboard view with time-windowing and badge achievements

import { useState, useEffect } from 'react';
import {
  Trophy, RefreshCw, Search, Shield
} from 'lucide-react';
import { fetchLeaderboard } from '../utils/api';
import { PACKS } from '../../packs/index.js';
import { EMPTY_STATES } from '../copy';

// Badges are per pack. Reading them from one hardcoded module meant only the
// forensics pack could ever award one, and students in the other two modules
// earned nothing at all.
const badgesForPack = (packId) =>
  Object.values(PACKS).find(p => p.id === packId)?.manifest.badges
  || Object.values(PACKS).flatMap(p => p.manifest.badges || []);

export const Leaderboard = ({ currentHandle, packId = null, packName = null }) => {
  const [windowFilter, setWindowFilter] = useState('all'); // 'all' | 'week'
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const loadData = async (filter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLeaderboard(filter, packId);
      setLeaderboard(res.leaderboard || []);
      // The API returns a player count and this screen has never shown it.
      // Reading it into state that nothing rendered only made that look wired.
    } catch {
      setError('Could not load the board. That is usually the network, not you.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(windowFilter);
  }, [windowFilter, packId]);

  const filteredBoard = leaderboard.filter(entry =>
    entry.handle.toLowerCase().includes(search.trim().toLowerCase())
  );

  const userEntry = leaderboard.find(
    entry => entry.handle.toLowerCase() === currentHandle?.toLowerCase()
  );

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200 select-none">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-term-border pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green">
                <Trophy size={24} />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-green-400 tracking-wide">
                  Leaderboard
                </h1>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {packName ? `${packName} · live standings` : 'Live standings'}
                </p>
              </div>
            </div>
          </div>

          {/* Controls: Window Switcher & Refresh */}
          <div className="flex items-center gap-3">
            <div className="flex bg-term-black p-1 rounded-lg border border-term-border text-xs font-bold">
              <button
                onClick={() => setWindowFilter('all')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  windowFilter === 'all'
                    ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All time
              </button>
              <button
                onClick={() => setWindowFilter('week')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  windowFilter === 'week'
                    ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                This week
              </button>
            </div>

            <button
              onClick={() => loadData(windowFilter)}
              disabled={loading}
              className="p-2 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all cursor-pointer"
              title="Refresh the board"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Current User Rank Card if available */}
        {userEntry && (
          <div className="p-4 rounded-xl bg-term-green-faint/30 border border-term-green/50 flex items-center justify-between shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-term-green text-term-black flex items-center justify-center font-bold text-lg">
                #{userEntry.rank}
              </div>
              <div>
                <div className="text-xs text-term-green font-bold tracking-wider">Your standing</div>
                <div className="text-base font-bold text-white">@{userEntry.handle}</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-xs text-neutral-400">Total Solves</div>
                <div className="text-sm font-bold text-white">{userEntry.solveCount}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-400">Net Score</div>
                <div className="text-base font-bold text-term-green">{userEntry.score} XP</div>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-3 text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search handles..."
            className="w-full bg-term-black border border-term-border rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-term-green"
          />
        </div>

        {/* Fetch failure must be visible — an empty table reads as "nobody is playing" */}
        {error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs">
            {error} Press the refresh button to try again.
          </div>
        )}

        {/* Leaderboard Table */}
        <div className="bg-term-black border border-term-border rounded-xl overflow-hidden shadow-xl">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-term-panel border-b border-term-border text-[11px] font-bold text-neutral-400 tracking-wider">
            <div className="col-span-2 md:col-span-1 text-center">Rank</div>
            <div className="col-span-5 md:col-span-4">Handle</div>
            <div className="hidden md:block md:col-span-4">Badges</div>
            <div className="col-span-2 md:col-span-1 text-center">Solves</div>
            <div className="col-span-3 md:col-span-2 text-right">XP Score</div>
          </div>

          <div className="divide-y divide-term-border/50">
            {filteredBoard.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                {loading
                  ? EMPTY_STATES.boardLoading
                  : search.trim()
                    ? EMPTY_STATES.boardNoSearchMatch
                    : EMPTY_STATES.boardEmpty}
              </div>
            ) : (
              filteredBoard.map((entry) => {
                const isUser = entry.handle.toLowerCase() === currentHandle?.toLowerCase();
                const isTop1 = entry.rank === 1;
                const isTop2 = entry.rank === 2;
                const isTop3 = entry.rank === 3;

                return (
                  <div
                    key={entry.handle}
                    className={`grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-xs transition-all ${
                      isUser
                        ? 'bg-term-green-faint/20 font-medium'
                        : 'hover:bg-term-gray/50'
                    }`}
                  >
                    {/* Rank Badge */}
                    <div className="col-span-2 md:col-span-1 flex justify-center">
                      {isTop1 ? (
                        <div className="w-7 h-7 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 flex items-center justify-center font-bold text-xs">
                          🥇
                        </div>
                      ) : isTop2 ? (
                        <div className="w-7 h-7 rounded-full bg-slate-400/20 text-slate-300 border border-slate-400/40 flex items-center justify-center font-bold text-xs">
                          🥈
                        </div>
                      ) : isTop3 ? (
                        <div className="w-7 h-7 rounded-full bg-amber-700/20 text-amber-500 border border-amber-600/40 flex items-center justify-center font-bold text-xs">
                          🥉
                        </div>
                      ) : (
                        <span className="text-neutral-500 font-bold text-xs">#{entry.rank}</span>
                      )}
                    </div>

                    {/* Handle */}
                    <div className="col-span-5 md:col-span-4 flex items-center gap-2 truncate">
                      <span className={`font-bold truncate ${isUser ? 'text-term-green' : 'text-white'}`}>
                        {entry.handle}
                      </span>
                      {isUser && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-term-green text-term-black font-bold shrink-0">
                          You
                        </span>
                      )}
                    </div>

                    {/* Badges Chips */}
                    <div className="hidden md:flex md:col-span-4 items-center gap-1.5 flex-wrap">
                      {entry.badges && entry.badges.length > 0 ? (
                        entry.badges.map(bId => {
                          const badge = badgesForPack(packId).find(b => b.id === bId);
                          if (!badge) return null;
                          return (
                            <span
                              key={bId}
                              className="px-2 py-0.5 rounded-full bg-term-gray border border-term-border text-[11px] flex items-center gap-1 text-neutral-300"
                              title={`${badge.name}: ${badge.description}`}
                            >
                              <span>{badge.icon}</span>
                              <span className="truncate max-w-[100px]">{badge.name}</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-neutral-600 text-[11px]">—</span>
                      )}
                    </div>

                    {/* Solve Count */}
                    <div className="col-span-2 md:col-span-1 text-center text-neutral-300 font-medium">
                      {entry.solveCount}
                    </div>

                    {/* Net XP Score */}
                    <div className="col-span-3 md:col-span-2 text-right font-bold text-term-green">
                      {entry.score} XP
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* A board with exactly one name reads as broken. Say what it is. */}
        {!loading && !search.trim() && leaderboard.length === 1 && (
          <div className="p-3 rounded-lg bg-term-gray border border-term-border text-neutral-400 text-xs">
            {EMPTY_STATES.boardSolo}
          </div>
        )}

        {/* Scoring policy footer notice */}
        <div className="p-4 rounded-lg bg-term-gray border border-term-border text-neutral-400 text-xs space-y-1">
          <div className="font-bold text-neutral-300 flex items-center gap-1.5">
            <Shield size={14} className="text-term-green" /> How scoring works
          </div>
          <div>
            Every student finds something different, so copying a classmate's answer will not work.
            First hints are free; later hints subtract a few XP from that challenge's points.
          </div>
        </div>
      </div>
    </div>
  );
};
