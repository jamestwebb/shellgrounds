// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Admin Overview component: Instructor oversight, solve analytics, and stuck points

import React, { useState, useEffect } from 'react';
import { Shield, Users, Trophy, AlertTriangle, RefreshCw, Activity, CheckCircle2 } from 'lucide-react';
import { fetchAdminOverview } from '../utils/api';

export const AdminOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOverview();
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load instructor analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 bg-term-void flex items-center justify-center p-8 text-neutral-400 font-mono">
        <RefreshCw size={24} className="animate-spin text-term-green mr-3" />
        <span>Aggregating student telemetry...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 bg-term-void p-8 font-mono text-red-400">
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg max-w-xl mx-auto">
          <div className="font-bold flex items-center gap-2 mb-1">
            <AlertTriangle size={18} /> Access Error
          </div>
          <div className="text-xs">{error}</div>
        </div>
      </div>
    );
  }

  const { totalPlayers = 0, challengeStats = [], recentSolves = [] } = data || {};

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200 select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Title */}
        <div className="flex items-center justify-between border-b border-term-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-green-400">
                INSTRUCTOR OVERSIGHT // THE GAUNTLET
              </h1>
              <p className="text-xs text-neutral-400">
                CIS 4400 / 5544 Analytics & Diagnostic Telemetry
              </p>
            </div>
          </div>

          <button
            onClick={loadStats}
            className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={12} /> REFRESH
          </button>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Users size={14} className="text-term-green" /> Total Registered Students
            </div>
            <div className="text-3xl font-bold text-white mt-2">{totalPlayers}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Unique handles claimed</div>
          </div>

          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={14} className="text-cyan-400" /> Total Challenges Active
            </div>
            <div className="text-3xl font-bold text-cyan-400 mt-2">{challengeStats.length}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Across 5 Acts + Topside Quest</div>
          </div>

          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Activity size={14} className="text-term-amber" /> Total Solves Recorded
            </div>
            <div className="text-3xl font-bold text-term-amber mt-2">
              {challengeStats.reduce((sum, c) => sum + (c.solveCount || 0), 0)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Cryptographically verified</div>
          </div>
        </div>

        {/* Challenge Diagnostic Table */}
        <div className="bg-term-black border border-term-border rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 bg-term-panel border-b border-term-border flex items-center justify-between">
            <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">
              Challenge Solve Rates & Diagnostic Stuck Points
            </h3>
            <span className="text-[11px] text-neutral-500">
              Low solve rates highlight concepts for Monday lecture review
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-term-gray border-b border-term-border text-neutral-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Act</th>
                  <th className="p-3">Challenge Title</th>
                  <th className="p-3 text-center">Base XP</th>
                  <th className="p-3 text-center">Solve Count</th>
                  <th className="p-3 text-center">Solve Rate</th>
                  <th className="p-3 text-center">Hints Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-term-border/50">
                {challengeStats.map((c) => {
                  const rate = totalPlayers > 0 ? Math.round((c.solveCount / totalPlayers) * 100) : 0;
                  const isStuckPoint = totalPlayers > 5 && rate < 30;

                  return (
                    <tr key={c.id} className="hover:bg-term-gray/50 transition-colors">
                      <td className="p-3 font-bold text-neutral-400">Act {c.act}</td>
                      <td className="p-3 font-medium text-white">
                        {c.title}
                        {isStuckPoint && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-red-950 text-red-400 text-[10px] border border-red-800">
                            STUCK POINT
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center text-term-green font-bold">+{c.points}</td>
                      <td className="p-3 text-center font-bold text-white">{c.solveCount}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-term-green"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono">{rate}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-amber-400">{c.totalHintsUsed || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Solves Feed */}
        {recentSolves.length > 0 && (
          <div className="bg-term-black border border-term-border rounded-xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-3">
              Live Solves Activity Feed
            </h3>
            <div className="divide-y divide-term-border/50 max-h-56 overflow-y-auto">
              {recentSolves.map((s, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-term-green" />
                    <span className="font-bold text-white">@{s.handle}</span>
                    <span className="text-neutral-400">solved</span>
                    <span className="text-cyan-400 font-mono">{s.challengeId}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    {new Date(s.solvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
