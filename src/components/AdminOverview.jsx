// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Instructor console. The organising question is "who do I help, and with
// what?", so the triage list leads and the aggregate tables follow it.
//
// Three server views back this screen:
//   view=overview  class totals, per-challenge stats, classStuckOn, recent solves
//   view=answers   the answer key for one module
//   view=student   one student's solves, frontier, and stuck challenges

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Shield, Users, AlertTriangle, RefreshCw, Activity, CheckCircle2, Circle,
  Download, Search, ChevronRight, ChevronDown, ArrowLeft, KeyRound,
  Lightbulb, LifeBuoy, Target, Info, User, Layers
} from 'lucide-react';
import { fetchAdminOverview, fetchGradebookCsv, getStoredPackId, fetchSiteConfig } from '../utils/api';
import { PackSettings } from './PackSettings';
import { PACKS, DEFAULT_PACK_ID } from '../../packs/index.js';

const PACK_LIST = Object.values(PACKS).map(p => ({ id: p.id, name: p.manifest.name }));

// The class overview does not say WHICH students are stuck, only how many per
// challenge, so the triage list is assembled from one view=student call per
// student. A classroom is small; the cap is a guard against a shared server
// with hundreds of historic handles, not against a normal roster.
const MAX_TRIAGE_STUDENTS = 60;
const TRIAGE_CONCURRENCY = 4;

function resolveInitialPack(preferred) {
  if (preferred && PACKS[preferred]) return preferred;
  const stored = getStoredPackId();
  return PACKS[stored] ? stored : DEFAULT_PACK_ID;
}

async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index], index);
    }
  });
  await Promise.all(workers);
}

function formatWhen(value) {
  if (!value || value === 'N/A') return 'never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatClock(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Backticked commands read as code everywhere else in the app; keep that here.
function formatText(text) {
  if (!text) return null;
  return String(text).split(/(`[^`]+`)/g).map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="px-1.5 py-0.5 rounded bg-term-green-faint text-green-300 border border-term-green/40 font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// The search has to cover what a teacher actually gropes for mid-room: a title,
// a command they half-remember, a phrase from a hint, or the challenge id.
function matchesQuery(challenge, query) {
  if (!query) return true;
  return [
    challenge.id, challenge.title, challenge.solution, challenge.check,
    challenge.brief, challenge.successMessage,
    ...(challenge.acceptedVariants || []),
    ...(challenge.hints || []).map(h => h.text)
  ].some(v => String(v || '').toLowerCase().includes(query));
}

const SectionCard = ({ title, note, icon: Icon, accent = 'text-neutral-300', children }) => (
  <div className="bg-term-black border border-term-border rounded-xl overflow-hidden shadow-xl">
    <div className="px-4 py-3 bg-term-panel border-b border-term-border flex flex-wrap items-center justify-between gap-2">
      <h3 className={`text-xs font-bold tracking-wider flex items-center gap-1.5 ${accent}`}>
        {Icon && <Icon size={14} />} {title}
      </h3>
      {note && <span className="text-[11px] text-neutral-500">{note}</span>}
    </div>
    {children}
  </div>
);

const EmptyNote = ({ children }) => (
  <div className="p-8 text-center text-xs text-neutral-500">{children}</div>
);

export const AdminOverview = ({ packId: preferredPackId = null }) => {
  const [packId, setPackId] = useState(() => resolveInitialPack(preferredPackId));
  const [view, setView] = useState('class');            // 'class' | 'answers' | 'packs'

  // Deciding which courses the class can see comes before looking at how the
  // class is doing, so an instructor who has never saved that choice lands on
  // the pack screen. Once it is saved, this stops happening: opening the site
  // in week six to see who is stuck should not reopen setup every time.
  useEffect(() => {
    let live = true;
    fetchSiteConfig()
      .then(cfg => { if (live && cfg && cfg.configured === false) setView('packs'); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const [openStudent, setOpenStudent] = useState(null); // handle, or null for the whole class

  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [triage, setTriage] = useState({ loading: false, done: 0, total: 0, students: [], failures: 0, truncated: false });

  const [answers, setAnswers] = useState(null);
  const [answersError, setAnswersError] = useState(null);
  const [loadingAnswers, setLoadingAnswers] = useState(false);

  const [studentData, setStudentData] = useState(null);
  const [studentError, setStudentError] = useState(null);
  const [loadingStudent, setLoadingStudent] = useState(false);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [csv, setCsv] = useState({ busy: false, error: null });

  const detailCache = useRef(new Map()); // `${packId}:${handle}` -> view=student payload
  const classToken = useRef(0);
  const answersToken = useRef(0);
  const studentToken = useRef(0);

  // ---- loaders -------------------------------------------------------

  const loadClass = useCallback(async (pid) => {
    const token = ++classToken.current;
    setLoadingOverview(true);
    setOverviewError(null);

    let res;
    try {
      res = await fetchAdminOverview(pid);
    } catch (err) {
      if (token !== classToken.current) return;
      setOverviewError(err.message || 'Could not load the class data.');
      setLoadingOverview(false);
      setTriage({ loading: false, done: 0, total: 0, students: [], failures: 0, truncated: false });
      return;
    }
    if (token !== classToken.current) return;
    setOverview(res);
    setLoadingOverview(false);

    const handles = (res.playerSummaries || []).map(p => p.handle);
    const roster = handles.slice(0, MAX_TRIAGE_STUDENTS);
    setTriage({
      loading: roster.length > 0, done: 0, total: roster.length,
      students: [], failures: 0, truncated: handles.length > roster.length
    });
    if (!roster.length) return;

    const collected = [];
    let failures = 0;
    await mapLimit(roster, TRIAGE_CONCURRENCY, async (handle) => {
      try {
        const detail = await fetchAdminOverview(pid, { view: 'student', handle });
        detailCache.current.set(`${pid}:${handle}`, detail);
        collected.push(detail);
      } catch {
        failures += 1;
      }
      if (token === classToken.current) setTriage(t => ({ ...t, done: t.done + 1 }));
    });
    if (token !== classToken.current) return;
    setTriage(t => ({ ...t, loading: false, students: collected, failures }));
  }, []);

  // Prefetched with the class data: finding an answer while a student waits
  // must not also wait on a round trip.
  const loadAnswers = useCallback(async (pid) => {
    const token = ++answersToken.current;
    setLoadingAnswers(true);
    setAnswersError(null);
    try {
      const res = await fetchAdminOverview(pid, { view: 'answers' });
      if (token !== answersToken.current) return;
      setAnswers(res);
    } catch (err) {
      if (token !== answersToken.current) return;
      setAnswersError(err.message || 'Could not load the answer key.');
    } finally {
      if (token === answersToken.current) setLoadingAnswers(false);
    }
  }, []);

  useEffect(() => {
    detailCache.current.clear();
    setOpenStudent(null);
    setStudentData(null);
    setStudentError(null);
    setAnswers(null);
    setExpanded(new Set());
    setSearch('');
    setCsv({ busy: false, error: null });
    loadClass(packId);
    loadAnswers(packId);
  }, [packId, loadClass, loadAnswers]);

  const refreshAll = () => {
    loadClass(packId);
    loadAnswers(packId);
    if (openStudent) {
      detailCache.current.delete(`${packId}:${openStudent}`);
      openStudentDetail(openStudent, { force: true });
    }
  };

  async function openStudentDetail(handle, { force = false } = {}) {
    const token = ++studentToken.current;
    setOpenStudent(handle);
    setView('class');
    setStudentError(null);

    const cached = force ? null : detailCache.current.get(`${packId}:${handle}`);
    if (cached) {
      setStudentData(cached);
      setLoadingStudent(false);
      return;
    }
    setStudentData(null);
    setLoadingStudent(true);
    try {
      const detail = await fetchAdminOverview(packId, { view: 'student', handle });
      if (token !== studentToken.current) return;
      detailCache.current.set(`${packId}:${handle}`, detail);
      setStudentData(detail);
    } catch (err) {
      if (token !== studentToken.current) return;
      setStudentError(err.message || 'Could not load that student.');
    } finally {
      if (token === studentToken.current) setLoadingStudent(false);
    }
  }

  const backToClass = () => {
    studentToken.current += 1;
    setOpenStudent(null);
    setStudentData(null);
    setStudentError(null);
    setLoadingStudent(false);
  };

  const exportCsv = async () => {
    setCsv({ busy: true, error: null });
    try {
      const blob = await fetchGradebookCsv(packId);
      // The artifact viewer sandbox blocks a download a script starts. A real
      // deployment does not, and this console only ever runs on the deployed
      // site, so the anchor click below is the right mechanism here.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gradebook-${packId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setCsv({ busy: false, error: null });
    } catch (err) {
      setCsv({ busy: false, error: err.message || 'The gradebook export failed.' });
    }
  };

  // Jump from a stuck student, or a class-wide wall, straight to the answer.
  const showAnswerFor = (challenge) => {
    setView('answers');
    setSearch(challenge.title || challenge.id);
    setExpanded(new Set([challenge.id]));
  };

  const toggleExpanded = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ---- derived -------------------------------------------------------

  const {
    packName = PACKS[packId]?.manifest?.name || packId,
    totalPlayers = 0,
    playerSummaries = [],
    challengeStats = [],
    classStuckOn = [],
    recentSolves = []
  } = overview || {};

  const totalSolves = challengeStats.reduce((sum, c) => sum + (c.solveCount || 0), 0);

  const stuckStudents = useMemo(() => triage.students
    .filter(s => (s.struggling || []).length > 0)
    .sort((a, b) => (b.struggling.length - a.struggling.length) || (a.solvedCount - b.solvedCount)),
    [triage.students]);

  const furthestBehind = useMemo(() => [...triage.students]
    .sort((a, b) => (a.solvedCount - b.solvedCount) || a.handle.localeCompare(b.handle))
    .slice(0, 5),
    [triage.students]);

  const query = search.trim().toLowerCase();
  const answerChallenges = answers?.challenges || [];
  const filteredAnswers = useMemo(
    () => answerChallenges.filter(c => matchesQuery(c, query)),
    [answerChallenges, query]
  );

  // Acts the server did not describe still have to appear, or a challenge with
  // an unknown act id would silently vanish from the key.
  const answerGroups = useMemo(() => {
    const known = answers?.acts || [];
    const groups = known.map(act => ({
      key: `act-${act.id}`,
      name: act.name,
      note: act.tagline,
      items: filteredAnswers.filter(c => c.act === act.id)
    }));
    const knownIds = new Set(known.map(a => a.id));
    const orphans = filteredAnswers.filter(c => !knownIds.has(c.act));
    if (orphans.length) {
      groups.push({ key: 'act-other', name: 'Other challenges', note: 'No act description', items: orphans });
    }
    return groups.filter(g => g.items.length > 0);
  }, [answers, filteredAnswers]);

  // A short result set is the "answer in three seconds" case: open it already.
  // Done here rather than at render time so a teacher can still collapse one.
  const handleSearchChange = (value) => {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) {
      setExpanded(new Set());
      return;
    }
    const hits = answerChallenges.filter(c => matchesQuery(c, q));
    setExpanded(hits.length > 0 && hits.length <= 5 ? new Set(hits.map(c => c.id)) : new Set());
  };

  // ---- whole-screen states -------------------------------------------

  if (loadingOverview && !overview) {
    return (
      <div className="flex-1 bg-term-void flex items-center justify-center p-8 text-neutral-400 font-mono">
        <RefreshCw size={22} className="animate-spin text-term-green mr-3" />
        <span className="text-sm">Loading the class...</span>
      </div>
    );
  }

  if (overviewError && !overview) {
    return (
      <div className="flex-1 bg-term-void p-8 font-mono">
        <div className="max-w-xl mx-auto p-5 bg-red-950/40 border border-red-800 rounded-xl text-red-300">
          <div className="font-bold flex items-center gap-2 mb-1 text-red-400">
            <AlertTriangle size={18} /> Could not load the instructor console
          </div>
          <div className="text-xs mb-4">{overviewError}</div>
          <button
            onClick={refreshAll}
            className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer text-neutral-200"
          >
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      </div>
    );
  }

  // ---- render --------------------------------------------------------

  return (
    <div className="flex-1 bg-term-void overflow-y-auto p-4 md:p-8 font-mono text-neutral-200 select-none">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-term-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/40 text-purple-400">
              <Shield size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-purple-400 tracking-wide">
                Instructor console
              </h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                {packName} — who needs help right now, and the answers to give them
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={packId}
              onChange={(e) => setPackId(e.target.value)}
              className="bg-term-black border border-term-border rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 font-bold focus:outline-none focus:border-purple-500 cursor-pointer"
              title="Which module the whole screen reports on"
            >
              {PACK_LIST.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <button
              onClick={exportCsv}
              disabled={csv.busy}
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-lg"
              title="Download the gradebook for this module as CSV"
            >
              <Download size={13} /> {csv.busy ? 'EXPORTING...' : 'Gradebook CSV'}
            </button>

            <button
              onClick={refreshAll}
              className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Refetch everything for this module"
            >
              <RefreshCw size={12} className={loadingOverview || triage.loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex bg-term-black p-1 rounded-lg border border-term-border text-xs font-bold">
            <button
              onClick={() => setView('class')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                view === 'class'
                  ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Users size={13} /> The class
            </button>
            <button
              onClick={() => setView('answers')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                view === 'answers'
                  ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <KeyRound size={13} /> Answer key
            </button>
            <button
              onClick={() => setView('packs')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                view === 'packs'
                  ? 'bg-term-green text-term-black shadow-[0_0_10px_rgba(34,197,94,0.3)]'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Layers size={13} /> Packs
            </button>
          </div>

          {overviewError && overview && (
            <span className="text-[11px] text-red-300 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Showing the last good data — the refresh failed.
            </span>
          )}
        </div>

        {csv.error && (
          <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs">
            {csv.error} Use the gradebook button to try again.
          </div>
        )}

        {/* ================= PACKS ================= */}
        {view === 'packs' && (
          <PackSettings onSaved={() => refreshAll()} />
        )}

        {/* ================= ANSWER KEY ================= */}
        {view === 'answers' && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-3 text-neutral-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search titles, solutions, hints, or what the checker wants..."
                autoComplete="off"
                spellCheck="false"
                className="w-full bg-term-black border border-term-border rounded-lg pl-10 pr-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-term-green"
              />
            </div>

            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-term-gray border border-term-border text-[11px] text-neutral-400">
              <Info size={13} className="shrink-0 mt-0.5 text-neutral-500" />
              <span>
                Every challenge, hint, and solution is bundled into each student's browser.
                This key is a convenience for you, not a secret kept from them.
              </span>
            </div>

            {loadingAnswers && !answers && (
              <SectionCard title="Answer key" icon={KeyRound} accent="text-purple-400">
                <EmptyNote>Loading the answer key...</EmptyNote>
              </SectionCard>
            )}

            {answersError && !answers && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} /> {answersError}
                </span>
                <button
                  onClick={() => loadAnswers(packId)}
                  className="px-2.5 py-1 rounded bg-term-gray border border-term-border hover:bg-neutral-800 text-neutral-200 font-bold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {answers && answerChallenges.length === 0 && (
              <SectionCard title="Answer key" icon={KeyRound} accent="text-purple-400">
                <EmptyNote>This module has no challenges yet.</EmptyNote>
              </SectionCard>
            )}

            {answers && answerChallenges.length > 0 && filteredAnswers.length === 0 && (
              <SectionCard title="Answer key" icon={KeyRound} accent="text-purple-400">
                <EmptyNote>Nothing matched "{search.trim()}". Clear the search to see all {answerChallenges.length} challenges.</EmptyNote>
              </SectionCard>
            )}

            {answers && answerGroups.map(group => {
              return (
                <SectionCard
                  key={group.key}
                  title={group.name}
                  note={group.note}
                  icon={Target}
                  accent="text-green-400"
                >
                  <div className="divide-y divide-term-border/50">
                    {group.items.map(c => {
                      const isOpen = expanded.has(c.id);
                      return (
                        <div key={c.id}>
                          <button
                            onClick={() => toggleExpanded(c.id)}
                            className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-term-gray/60 transition-colors cursor-pointer"
                          >
                            {isOpen
                              ? <ChevronDown size={14} className="text-neutral-500 shrink-0" />
                              : <ChevronRight size={14} className="text-neutral-500 shrink-0" />}
                            <span className="text-xs font-bold text-white truncate">{c.title}</span>
                            <span className="text-[10px] text-neutral-500 truncate hidden md:inline">{c.id}</span>
                            <span className="ml-auto flex items-center gap-2 shrink-0">
                              {c.platform === 'windows' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-term-shell-bar border border-term-shell-border text-cyan-300 font-bold">Win</span>
                              )}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-term-green-faint border border-term-green/30 text-term-green">
                                +{c.points}
                              </span>
                            </span>
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4 pt-1 space-y-3 bg-term-gray/30">
                              <div>
                                <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1">Solution</div>
                                <div className="p-3 rounded-lg bg-term-black border border-term-green/40 text-xs text-green-300 font-mono select-text cursor-text break-words">
                                  {c.solution || <span className="text-neutral-500">No canonical solution recorded.</span>}
                                </div>
                              </div>

                              <div>
                                <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1">What the checker requires</div>
                                <div className="p-2.5 rounded-lg bg-term-black border border-term-border text-xs text-neutral-300 select-text cursor-text break-words">
                                  {c.check || 'none'}
                                </div>
                              </div>

                              {(c.acceptedVariants || []).length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1">
                                    Also accepted ({c.acceptedVariants.length})
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {c.acceptedVariants.map((v, i) => (
                                      <code
                                        key={i}
                                        className="px-2 py-1 rounded bg-term-black border border-term-border text-[11px] text-cyan-300 select-text cursor-text break-all"
                                      >
                                        {v}
                                      </code>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(c.hints || []).length > 0 && (
                                <div>
                                  <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1 flex items-center gap-1.5">
                                    <Lightbulb size={11} className="text-term-amber" /> Hint ladder
                                  </div>
                                  <div className="space-y-1.5">
                                    {c.hints.map(h => (
                                      <div
                                        key={h.index}
                                        className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/60 text-[11px] text-amber-200 leading-relaxed select-text cursor-text flex gap-2"
                                      >
                                        <span className="font-bold text-amber-400 shrink-0">{h.index + 1}.</span>
                                        <span className="flex-1">{formatText(h.text)}</span>
                                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-term-black text-amber-400 border border-amber-900/60 h-fit">
                                          {h.cost > 0 ? `-${h.cost} XP` : 'Free'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {c.brief && (
                                <div>
                                  <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1">Brief the student sees</div>
                                  <div className="p-2.5 rounded-lg bg-term-black border border-term-border text-[11px] text-neutral-400 leading-relaxed select-text cursor-text">
                                    {formatText(c.brief)}
                                  </div>
                                </div>
                              )}

                              {c.successMessage && (
                                <div className="text-[11px] text-emerald-300/80 flex items-start gap-1.5 select-text cursor-text">
                                  <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                                  <span>{c.successMessage}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}

        {/* ================= ONE STUDENT ================= */}
        {view === 'class' && openStudent && (
          <div className="space-y-4">
            <button
              onClick={backToClass}
              className="px-3 py-1.5 rounded-lg bg-term-gray border border-term-border hover:bg-neutral-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={13} /> Back to the class
            </button>

            {loadingStudent && (
              <SectionCard title={`@${openStudent}`} icon={User} accent="text-purple-400">
                <EmptyNote>Loading this student...</EmptyNote>
              </SectionCard>
            )}

            {studentError && !loadingStudent && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={14} /> {studentError}
                </span>
                <button
                  onClick={() => openStudentDetail(openStudent, { force: true })}
                  className="px-2.5 py-1 rounded bg-term-gray border border-term-border hover:bg-neutral-800 text-neutral-200 font-bold cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {studentData && !loadingStudent && (() => {
              const solved = studentData.solvedCount || 0;
              const total = studentData.totalChallenges || 0;
              const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
              const struggling = studentData.struggling || [];
              return (
                <>
                  <div className="p-5 rounded-xl bg-term-black border border-term-border">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-lg font-bold text-white">@{studentData.handle}</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">{packName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-term-green">{solved} / {total}</div>
                        <div className="text-[11px] text-neutral-500">challenges solved</div>
                      </div>
                    </div>
                    <div className="h-1.5 mt-4 bg-neutral-900 rounded-full overflow-hidden border border-term-border">
                      <div className="h-full bg-term-green transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SectionCard title="Where they are" note="First unsolved challenge" icon={Target} accent="text-cyan-400">
                      {studentData.frontier ? (
                        <div className="p-4 space-y-2">
                          <div className="text-sm font-bold text-white">{studentData.frontier.title}</div>
                          <div className="text-[11px] text-neutral-500">
                            Act {studentData.frontier.act} — worth {studentData.frontier.points} XP
                          </div>
                          <button
                            onClick={() => showAnswerFor(studentData.frontier)}
                            className="mt-1 px-2.5 py-1 rounded bg-term-gray border border-term-border hover:bg-neutral-800 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer text-neutral-200"
                          >
                            <KeyRound size={11} /> Open the answer
                          </button>
                        </div>
                      ) : (
                        <EmptyNote>Finished every challenge in this module.</EmptyNote>
                      )}
                    </SectionCard>

                    <SectionCard title="Stuck on" note="Every hint opened, still unsolved" icon={LifeBuoy} accent="text-red-400">
                      {struggling.length === 0 ? (
                        <EmptyNote>Not out of hints anywhere. Nothing urgent here.</EmptyNote>
                      ) : (
                        <div className="divide-y divide-term-border/50">
                          {struggling.map(c => (
                            <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{c.title}</div>
                                <div className="text-[10px] text-neutral-500">Act {c.act} — {c.hintsOpened}/{c.totalHints} hints</div>
                              </div>
                              <button
                                onClick={() => showAnswerFor(c)}
                                className="shrink-0 px-2.5 py-1 rounded bg-term-gray border border-term-border hover:bg-neutral-800 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer text-neutral-200"
                              >
                                <KeyRound size={11} /> Answer
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  <SectionCard
                    title="Every challenge"
                    note={`${solved} solved of ${total}`}
                    icon={Activity}
                    accent="text-purple-400"
                  >
                    {(studentData.challenges || []).length === 0 ? (
                      <EmptyNote>This module has no challenges yet.</EmptyNote>
                    ) : (
                      <div className="divide-y divide-term-border/50 max-h-96 overflow-y-auto">
                        {studentData.challenges.map(c => (
                          <div key={c.id} className="px-4 py-2.5 flex items-center gap-3 text-xs hover:bg-term-gray/40 transition-colors">
                            {c.solved
                              ? <CheckCircle2 size={14} className="text-term-green shrink-0" />
                              : <Circle size={14} className="text-neutral-600 shrink-0" />}
                            <span className={`truncate ${c.solved ? 'text-neutral-300' : 'text-white font-medium'}`}>{c.title}</span>
                            <span className="text-[10px] text-neutral-600 shrink-0 hidden md:inline">Act {c.act}</span>
                            <span className="ml-auto flex items-center gap-3 shrink-0">
                              <span className={`text-[10px] ${c.hintsOpened > 0 ? 'text-amber-400' : 'text-neutral-600'}`}>
                                {c.hintsOpened}/{c.totalHints} hints
                              </span>
                              <span className="text-[10px] font-bold text-neutral-500 w-10 text-right">+{c.points}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                </>
              );
            })()}
          </div>
        )}

        {/* ================= THE CLASS ================= */}
        {view === 'class' && !openStudent && (
          <div className="space-y-6">

            {/* Triage: the reason this screen exists */}
            <div className="rounded-xl border border-amber-600/40 bg-amber-950/10 overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-amber-950/30 border-b border-amber-600/30 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-amber-300 tracking-wider flex items-center gap-2">
                  <LifeBuoy size={16} /> Help these students first
                </h2>
                <span className="text-[11px] text-amber-200/70">
                  Opened every hint on a challenge and still have not solved it
                </span>
              </div>

              {totalPlayers === 0 ? (
                <EmptyNote>No one has registered yet. This fills in as students join.</EmptyNote>
              ) : triage.loading ? (
                <div className="p-6 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-amber-400" />
                  Checking {triage.total} students... ({triage.done}/{triage.total})
                </div>
              ) : triage.students.length === 0 ? (
                <EmptyNote>
                  Could not read any student's progress. Use refresh to try again.
                </EmptyNote>
              ) : stuckStudents.length > 0 ? (
                <div className="divide-y divide-amber-900/30">
                  {stuckStudents.map(s => (
                    <div key={s.handle} className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
                      <button
                        onClick={() => openStudentDetail(s.handle)}
                        className="text-left shrink-0 md:w-48 cursor-pointer group"
                      >
                        <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                          @{s.handle}
                        </div>
                        <div className="text-[10px] text-neutral-500">
                          {s.solvedCount}/{s.totalChallenges} solved
                        </div>
                      </button>

                      <div className="flex-1 flex flex-wrap gap-1.5">
                        {s.struggling.map(c => (
                          <button
                            key={c.id}
                            onClick={() => showAnswerFor(c)}
                            className="px-2 py-1 rounded-lg bg-term-black border border-amber-800/60 hover:border-amber-500 text-[11px] text-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                            title="Open this challenge in the answer key"
                          >
                            <KeyRound size={11} className="text-amber-500" />
                            <span className="truncate max-w-[240px]">{c.title}</span>
                            <span className="text-[10px] text-neutral-500">Act {c.act}</span>
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => openStudentDetail(s.handle)}
                        className="shrink-0 px-2.5 py-1 rounded bg-term-gray border border-term-border hover:bg-neutral-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer text-neutral-200"
                      >
                        Detail <ChevronRight size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : totalSolves === 0 ? (
                <div className="p-6 text-xs text-neutral-400 space-y-3">
                  <div>No one has started this module yet. The students below are registered and idle.</div>
                  <div className="flex flex-wrap gap-1.5">
                    {furthestBehind.map(s => (
                      <button
                        key={s.handle}
                        onClick={() => openStudentDetail(s.handle)}
                        className="px-2 py-1 rounded-lg bg-term-black border border-term-border hover:border-neutral-500 text-[11px] text-neutral-300 cursor-pointer"
                      >
                        @{s.handle}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-xs text-neutral-400 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 size={14} /> No one has run out of hints. Nothing is urgent.
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-neutral-500 tracking-wider mb-1.5">
                      Furthest behind — worth a look
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {furthestBehind.map(s => (
                        <button
                          key={s.handle}
                          onClick={() => openStudentDetail(s.handle)}
                          className="px-2 py-1 rounded-lg bg-term-black border border-term-border hover:border-neutral-500 text-[11px] text-neutral-300 cursor-pointer"
                        >
                          @{s.handle} <span className="text-neutral-500">{s.solvedCount}/{s.totalChallenges}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(triage.failures > 0 || triage.truncated) && !triage.loading && (
                <div className="px-4 py-2 border-t border-amber-900/30 text-[11px] text-neutral-500">
                  {triage.failures > 0 && `${triage.failures} student${triage.failures === 1 ? '' : 's'} could not be read. `}
                  {triage.truncated && `Only the first ${MAX_TRIAGE_STUDENTS} students were checked.`}
                </div>
              )}
            </div>

            {/* What the class as a whole is walled on */}
            {classStuckOn.length > 0 && (
              <SectionCard
                title="The class is walled on"
                note="Reteach these; the count is students out of hints"
                icon={AlertTriangle}
                accent="text-red-400"
              >
                <div className="p-4 flex flex-wrap gap-2">
                  {classStuckOn.map(c => (
                    <button
                      key={c.id}
                      onClick={() => showAnswerFor(c)}
                      className="px-3 py-2 rounded-lg bg-term-black border border-red-900/60 hover:border-red-500 text-left cursor-pointer transition-colors"
                    >
                      <div className="text-xs font-bold text-white">{c.title}</div>
                      <div className="text-[10px] text-neutral-500 mt-0.5">
                        Act {c.act} — <span className="text-red-400 font-bold">{c.stuckCount} stuck</span>, {c.solveCount} solved
                      </div>
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-xl bg-term-black border border-term-border">
                <div className="text-xs text-neutral-400 font-bold flex items-center gap-1.5">
                  <Users size={14} className="text-term-green" /> Students registered
                </div>
                <div className="text-3xl font-bold text-white mt-2">{totalPlayers}</div>
                <div className="text-[11px] text-neutral-500 mt-1">Unique handles on this server</div>
              </div>
              <div className="p-5 rounded-xl bg-term-black border border-term-border">
                <div className="text-xs text-neutral-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-cyan-400" /> Challenges in this module
                </div>
                <div className="text-3xl font-bold text-cyan-400 mt-2">{challengeStats.length}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{packName}</div>
              </div>
              <div className="p-5 rounded-xl bg-term-black border border-term-border">
                <div className="text-xs text-neutral-400 font-bold flex items-center gap-1.5">
                  <Activity size={14} className="text-term-amber" /> Solves recorded
                </div>
                <div className="text-3xl font-bold text-term-amber mt-2">{totalSolves}</div>
                <div className="text-[11px] text-neutral-500 mt-1">Across this module</div>
              </div>
            </div>

            {/* Roster */}
            <SectionCard
              title="The roster"
              note="Click a student for their detail"
              icon={Users}
              accent="text-purple-400"
            >
              {playerSummaries.length === 0 ? (
                <EmptyNote>No students have registered yet.</EmptyNote>
              ) : (
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-term-gray border-b border-term-border text-neutral-400 text-[10px] sticky top-0">
                      <tr>
                        <th className="p-3">Student</th>
                        <th className="p-3 text-center">Score</th>
                        <th className="p-3 text-center">Solved</th>
                        <th className="p-3 text-right">Last active</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-term-border/50">
                      {playerSummaries.map(ps => {
                        const stuckHere = stuckStudents.find(s => s.handle === ps.handle);
                        return (
                          <tr
                            key={ps.handle}
                            onClick={() => openStudentDetail(ps.handle)}
                            className="hover:bg-term-gray/60 transition-colors cursor-pointer"
                          >
                            <td className="p-3 font-bold text-white">
                              @{ps.handle}
                              {stuckHere && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 text-[10px] border border-amber-700">
                                  Needs help
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center text-term-green font-bold">{ps.totalScore} XP</td>
                            <td className="p-3 text-center text-neutral-300">
                              {ps.solvesCount} / {challengeStats.length}
                            </td>
                            <td className="p-3 text-right text-neutral-400 text-[11px]">{formatWhen(ps.lastActive)}</td>
                            <td className="p-3 text-right text-neutral-600"><ChevronRight size={13} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Per-challenge stats */}
            <SectionCard
              title="Challenge by challenge"
              note="A low solve rate with a high stuck count is a lecture topic"
              icon={Activity}
              accent="text-green-400"
            >
              {challengeStats.length === 0 ? (
                <EmptyNote>This module has no challenges yet.</EmptyNote>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-term-gray border-b border-term-border text-neutral-400 text-[10px] sticky top-0">
                      <tr>
                        <th className="p-3">Act</th>
                        <th className="p-3">Challenge</th>
                        <th className="p-3 text-center">Points</th>
                        <th className="p-3 text-center">Solved</th>
                        <th className="p-3 text-center">Solve rate</th>
                        <th className="p-3 text-center">Stuck</th>
                        <th className="p-3 text-center">Solved with hints</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-term-border/50">
                      {challengeStats.map(c => {
                        const rate = totalPlayers > 0 ? Math.round((c.solveCount / totalPlayers) * 100) : 0;
                        return (
                          <tr
                            key={c.id}
                            onClick={() => showAnswerFor(c)}
                            className="hover:bg-term-gray/60 transition-colors cursor-pointer"
                            title="Open this challenge in the answer key"
                          >
                            <td className="p-3 font-bold text-neutral-500">Act {c.act}</td>
                            <td className="p-3 font-medium text-white">{c.title}</td>
                            <td className="p-3 text-center text-term-green font-bold">+{c.points}</td>
                            <td className="p-3 text-center font-bold text-white">{c.solveCount}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                                  <div className="h-full bg-term-green" style={{ width: `${rate}%` }} />
                                </div>
                                <span className="text-[11px]">{rate}%</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {c.stuckCount > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-400 text-[10px] border border-red-800 font-bold">
                                  {c.stuckCount}
                                </span>
                              ) : (
                                <span className="text-neutral-600">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center text-amber-400">{c.totalHintsUsed || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Activity feed */}
            <SectionCard title="Recent solves" note="Newest first" icon={CheckCircle2} accent="text-green-400">
              {recentSolves.length === 0 ? (
                <EmptyNote>No solves in this module yet.</EmptyNote>
              ) : (
                <div className="divide-y divide-term-border/50 max-h-56 overflow-y-auto">
                  {recentSolves.map((s, idx) => (
                    <div key={`${s.handle}-${s.challengeId}-${idx}`} className="px-4 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={13} className="text-term-green shrink-0" />
                        <button
                          onClick={() => openStudentDetail(s.handle)}
                          className="font-bold text-white hover:text-term-green cursor-pointer"
                        >
                          @{s.handle}
                        </button>
                        <span className="text-neutral-500">solved</span>
                        <span className="text-cyan-400 truncate">{s.challengeId}</span>
                      </div>
                      <span className="text-[11px] text-neutral-500 shrink-0">{formatClock(s.solvedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
};
