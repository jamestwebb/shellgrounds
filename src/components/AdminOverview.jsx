// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Admin Overview component: Instructor oversight, solve analytics, gradebook export, and stuck points

import React, { useState, useEffect } from 'react';
import { Shield, Users, Trophy, AlertTriangle, RefreshCw, Activity, CheckCircle2, Download, Package } from 'lucide-react';
import { fetchAdminOverview, getAuthToken } from '../utils/api';
import { listPacks } from '../../packs/index.js';

export const AdminOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPackId, setSelectedPackId] = useState('forensics-cli-101');
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const packs = listPacks();

  const loadStats = async (packId = selectedPackId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOverview(packId);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load instructor analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats(selectedPackId);
  }, [selectedPackId]);

  const handleExportCsv = async () => {
    setDownloadingCsv(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin-overview?format=csv&packId=${encodeURIComponent(selectedPackId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to generate CSV export');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gauntlet-gradebook-${selectedPackId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Error exporting CSV');
    } finally {
      setDownloadingCsv(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 bg-term-void flex items-center justify-center p-8 text-neutral-400 font-mono">
        <RefreshCw size={24} className="animate-spin text-term-green mr-3" />
        <span>Aggregating student telemetry...</span>
      </div>
    );
  }

  if (error && !data) {
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

  const { totalPlayers = 0, challengeStats = [], recentSolves = [], playerSummaries = [] } = data || {};

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200 select-none">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Title & Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-term-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/40 text-purple-400">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-purple-400 flex items-center gap-2">
                INSTRUCTOR CONSOLE // THE GAUNTLET
              </h1>
              <p className="text-xs text-neutral-400">
                Live Cohort Analytics, Solvability Diagnostic Telemetry & Gradebook Export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pack Selector */}
            <select
              value={selectedPackId}
              onChange={(e) => setSelectedPackId(e.target.value)}
              className="bg-term-black border border-term-border rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-purple-500"
            >
              {packs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* CSV Gradebook Export Button */}
            <button
              onClick={handleExportCsv}
              disabled={downloadingCsv}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg"
              title="Download Canvas / Blackboard CSV Gradebook"
            >
              <Download size={13} /> {downloadingCsv ? 'EXPORTING...' : 'EXPORT CSV'}
            </button>

            <button
              onClick={() => loadStats(selectedPackId)}
              className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> REFRESH
            </button>
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Users size={14} className="text-term-green" /> Registered Students
            </div>
            <div className="text-3xl font-bold text-white mt-2">{totalPlayers}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Unique handles in cohort</div>
          </div>

          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={14} className="text-cyan-400" /> Active Pack Challenges
            </div>
            <div className="text-3xl font-bold text-cyan-400 mt-2">{challengeStats.length}</div>
            <div className="text-[11px] text-neutral-500 mt-1">{selectedPackId}</div>
          </div>

          <div className="p-5 rounded-xl bg-term-black border border-term-border">
            <div className="text-xs text-neutral-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Activity size={14} className="text-term-amber" /> Total Solves Recorded
            </div>
            <div className="text-3xl font-bold text-term-amber mt-2">
              {challengeStats.reduce((sum, c) => sum + (c.solveCount || 0), 0)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Machine-verified replay proofs</div>
          </div>
        </div>

        {/* Challenge Diagnostic Table */}
        <div className="bg-term-black border border-term-border rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 bg-term-panel border-b border-term-border flex items-center justify-between">
            <h3 className="text-xs font-bold text-green-400 uppercase tracking-wider">
              Challenge Solve Rates & Diagnostic Stuck Points
            </h3>
            <span className="text-[11px] text-neutral-500">
              Low solve rates highlight concepts for lecture review
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-term-gray border-b border-term-border text-neutral-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Act</th>
                  <th className="p-3">Challenge Title</th>
                  <th className="p-3 text-center">Points</th>
                  <th className="p-3 text-center">Solve Count</th>
                  <th className="p-3 text-center">Solve Rate</th>
                  <th className="p-3 text-center">Hints Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-term-border/50">
                {challengeStats.map((c) => {
                  const rate = totalPlayers > 0 ? Math.round((c.solveCount / totalPlayers) * 100) : 0;
                  const isStuckPoint = totalPlayers > 3 && rate < 35;

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

        {/* Student Gradebook Summary Table */}
        {playerSummaries.length > 0 && (
          <div className="bg-term-black border border-term-border rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 bg-term-panel border-b border-term-border flex items-center justify-between">
              <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                Cohort Student Gradebook Overview
              </h3>
              <span className="text-[11px] text-neutral-500">
                Sorted by total points earned
              </span>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs">
                <thead className="bg-term-gray border-b border-term-border text-neutral-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Student Handle</th>
                    <th className="p-3 text-center">Total Score</th>
                    <th className="p-3 text-center">Challenges Solved</th>
                    <th className="p-3 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-term-border/50">
                  {playerSummaries.map((ps) => (
                    <tr key={ps.handle} className="hover:bg-term-gray/50 transition-colors">
                      <td className="p-3 font-bold text-white">@{ps.handle}</td>
                      <td className="p-3 text-center text-term-green font-bold">{ps.totalScore} XP</td>
                      <td className="p-3 text-center text-slate-300 font-mono">{ps.solvesCount} / {challengeStats.length}</td>
                      <td className="p-3 text-right text-neutral-400 text-[11px]">
                        {ps.lastActive !== 'N/A' ? new Date(ps.lastActive).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
