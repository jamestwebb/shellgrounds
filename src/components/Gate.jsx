// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Gate view: Handle registration, class password verification, and session resume

import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Key, AlertCircle, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { checkSFW } from '../engine/sfw-filter';
import { registerHandle } from '../utils/api';
import { sounds } from '../utils/audio';

// The server writes its own errors. These two are the ones students actually
// hit, and they are worth saying in the product's own voice — plainly, and
// with the next step attached.
const friendlyGateError = (message) => {
  const text = String(message || '');
  if (/class password/i.test(text)) {
    return 'That password did not match. Check with your teacher — it may have changed since it was announced.';
  }
  if (/is taken/i.test(text)) {
    return 'Someone in this class already has that handle. Add a number or an underscore and try again. '
      + 'If the handle is yours, open the site in the browser you registered with and it resumes on its own.';
  }
  return text || 'That did not go through. Check your handle and password, then try again.';
};

// ── Dev-only credential panel ───────────────────────────────────────────────
// Working on the gate meant opening .env to read back the class password and
// the instructor setup code on every reload. This shows them instead, and
// fills the boxes on a click.
//
// It is gated twice, and neither gate is a run-time check that could be
// misconfigured:
//
//   1. `import.meta.env.DEV` is a literal `false` in a production build, so
//      Rollup deletes this whole block. Nothing below ships.
//   2. The endpoint it calls lives in scripts/dev-functions.mjs, which Netlify
//      never deploys. Even a build that somehow kept this code would call a
//      route that does not exist.
//
// tests/dev-credentials.test.js asserts both, against the real built bundle.
const DEV = import.meta.env?.DEV === true;

function useDevCredentials() {
  const [creds, setCreds] = useState(null);
  useEffect(() => {
    if (!DEV) return;
    const base = import.meta.env?.VITE_API_BASE || '/api';
    fetch(`${base}/dev-credentials`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setCreds(d?.dev ? d : null))
      .catch(() => {});   // No local functions server: the panel simply stays hidden.
  }, []);
  return creds;
}

/** Dev only: become an existing account without registering it again. */
async function devSignIn(handle, asInstructor = false) {
  const base = import.meta.env?.VITE_API_BASE || '/api';
  const res = await fetch(`${base}/dev-signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, instructor: asInstructor })
  });
  if (!res.ok) throw new Error('The local dev server did not sign that account in.');
  return res.json();
}

const DevCredentials = ({ creds, onFill, onSignedIn }) => {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  if (!DEV || !creds) return null;

  const become = async (handle, asInstructor) => {
    setBusy(handle);
    setErr(null);
    try {
      const { token, handle: who } = await devSignIn(handle, asInstructor);
      onSignedIn(who, token);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  const instructor = creds.adminHandles?.[0];
  const students = (creds.handles || []).filter(h => h !== instructor);

  const rows = [
    ['Class password', creds.classPassword],
    ['Instructor setup code', creds.setupCode],
    ['Instructor handles', creds.adminHandles?.join(', ')]
  ].filter(([, v]) => v);

  return (
    <div className="mb-5 rounded border border-amber-700/60 bg-amber-950/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] tracking-wider text-amber-300 font-medium">
          Local development only
        </span>
        <button
          type="button"
          onClick={() => setShown(v => !v)}
          className="text-[11px] text-amber-300/80 hover:text-amber-200 underline underline-offset-2"
        >
          {shown ? 'Hide' : 'Show values'}
        </button>
      </div>

      {/* One click to be somebody. The whole point of the panel. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {instructor && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => become(instructor, true)}
            className="px-2 py-1 rounded border border-amber-700/60 bg-amber-900/30 text-amber-200
                       text-[11px] font-bold hover:bg-amber-900/60 cursor-pointer disabled:opacity-50"
          >
            {busy === instructor ? 'signing in…' : `instructor · @${instructor}`}
          </button>
        )}
        {students.map(h => (
          <button
            key={h}
            type="button"
            disabled={busy !== null}
            onClick={() => become(h, false)}
            className="px-2 py-1 rounded border border-term-border bg-term-black text-neutral-300
                       text-[11px] hover:border-term-green/60 hover:text-white cursor-pointer disabled:opacity-50"
          >
            {busy === h ? 'signing in…' : `@${h}`}
          </button>
        ))}
        {students.length === 0 && (
          <span className="text-[11px] text-neutral-500">
            No students yet — run <code className="text-neutral-400">npm run dev:seed</code> for a class.
          </span>
        )}
      </div>

      {err && <p className="mt-1.5 text-[11px] text-red-300">{err}</p>}

      {shown ? (
        <>
          <dl className="mt-2 space-y-1">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-2 text-[11px]">
                <dt className="text-neutral-400 shrink-0 w-40">{label}</dt>
                <dd className="text-amber-200 font-mono break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => onFill(creds)}
            className="mt-2 text-[11px] text-amber-300 hover:text-amber-200 underline underline-offset-2"
          >
            Fill the form as the instructor
          </button>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-neutral-400">
          Your .env credentials, read from the local functions server. This panel is
          removed from a production build.
        </p>
      )}
    </div>
  );
};

export const Gate = ({ onAuthenticated, onResumeSession, existingHandle, packName = 'Shellgrounds' }) => {
  const [handle, setHandle] = useState(existingHandle || '');
  const [password, setPassword] = useState('');
  // Only an instructor needs this. It is what stops a student claiming the
  // handle named in ADMIN_HANDLES before the teacher registers.
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const devCreds = useDevCredentials();

  const fillFromDev = (c) => {
    if (!handle.trim() && c.adminHandles?.[0]) setHandle(c.adminHandles[0]);
    if (c.classPassword) setPassword(c.classPassword);
    if (c.setupCode) setSetupCode(c.setupCode);
    setError(null);
  };

  // Live SFW format preview
  const sfwResult = handle.trim() ? checkSFW(handle.trim()) : null;

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanHandle = handle.trim();
    const cleanPassword = password.trim();

    if (!cleanHandle) {
      setError('Choose a handle first. It is the name the leaderboard shows.');
      sounds.playError();
      return;
    }

    if (!sfwResult?.safe) {
      setError(sfwResult?.reason || 'That handle will not work. Use 3–20 letters, numbers, hyphens, or underscores.');
      sounds.playError();
      return;
    }

    if (!cleanPassword) {
      setError('The class password is missing. Your teacher announces it in class.');
      sounds.playError();
      return;
    }

    setLoading(true);
    try {
      const res = await registerHandle(cleanHandle, cleanPassword, { setupCode: setupCode.trim() || undefined });
      sounds.playSuccess();
      // Await the full session setup: the button must stay disabled until the
      // player is actually inside, and any failure must surface here.
      await onAuthenticated(res.handle, res.token);
    } catch (err) {
      setError(friendlyGateError(err.message));
      sounds.playError();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-term-void text-neutral-200 flex flex-col items-center justify-center p-4 font-mono select-none">
      {/* Background ambient grid/scanline effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-term-green-faint/15 via-transparent to-transparent pointer-events-none" />

      <div className="max-w-md w-full bg-term-black border border-term-border rounded-xl shadow-2xl p-8 relative z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-full bg-term-green-faint border border-term-green/30 mb-4 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <BrandMark size={36} />
          </div>
          <h1 className="text-2xl font-bold text-green-400 tracking-wider">Shellgrounds</h1>
          <p className="text-xs text-neutral-400 mt-1.5">Learn the command line, one find at a time.</p>
          <div className="text-[11px] text-neutral-400 mt-1 tracking-widest">
            {packName}
          </div>
        </div>

        {/* Existing Session Resume Option */}
        {existingHandle && (
          <div className="mb-6 p-4 rounded-lg bg-term-gray border border-term-border flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-400">Welcome back</div>
              <div className="text-sm font-bold text-term-green">@{existingHandle}</div>
            </div>
            <button
              onClick={() => onResumeSession(existingHandle)}
              className="px-3 py-1.5 rounded bg-term-green-faint text-term-green border border-term-green/40 hover:bg-term-green hover:text-term-black text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              Resume <ArrowRight size={12} />
            </button>
          </div>
        )}

        <DevCredentials
          creds={devCreds}
          onFill={fillFromDev}
          onSignedIn={(who, token) => onAuthenticated(who, token)}
        />

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-xs tracking-wider text-neutral-300 mb-1.5 font-medium flex items-center gap-1.5">
              <Terminal size={13} className="text-term-green" /> Handle (your leaderboard name)
            </label>
            <div className="relative">
              <input
                type="text"
                value={handle}
                onChange={(e) => { setHandle(e.target.value); setError(null); }}
                placeholder="e.g. j_smith or ghost42"
                maxLength={20}
                className="w-full bg-term-gray border border-term-border rounded px-3.5 py-2.5 text-sm text-green-300 placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green transition-all"
                autoComplete="off"
                spellCheck="false"
              />
              {sfwResult && (
                <div className="absolute right-3 top-3">
                  {sfwResult.safe ? (
                    <Check size={16} className="text-term-green" />
                  ) : (
                    <AlertCircle size={16} className="text-term-amber" />
                  )}
                </div>
              )}
            </div>
            {handle.trim() && !sfwResult?.safe && (
              <p className="text-[11px] text-term-amber mt-1">{sfwResult?.reason}</p>
            )}
            <p className="text-[11px] text-neutral-400 mt-1">
              3–20 characters. Letters, numbers, hyphens, underscores. Pick something you are happy to see on a projector.
            </p>
          </div>

          <div>
            <label className="block text-xs tracking-wider text-neutral-300 mb-1.5 font-medium flex items-center gap-1.5">
              <Key size={13} className="text-term-green" /> Class password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="••••••••••••"
              className="w-full bg-term-gray border border-term-border rounded px-3.5 py-2.5 text-sm text-green-300 placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green transition-all"
            />
            <p className="text-[11px] text-neutral-400 mt-1">
              Your teacher announces this in class. It is only needed once, to create your handle.
            </p>
          </div>

          {/* Instructors only. Collapsed by default so students never wonder
              about it — but the server requires it before anyone can claim a
              handle listed in ADMIN_HANDLES. */}
          <details className="group">
            <summary className="text-[11px] text-neutral-500 hover:text-neutral-300 cursor-pointer select-none transition-colors">
              I am the instructor
            </summary>
            <div className="mt-2">
              <label className="block text-xs tracking-wider text-neutral-300 mb-1.5 font-medium">
                Instructor setup code
              </label>
              <input
                type="password"
                value={setupCode}
                onChange={(e) => { setSetupCode(e.target.value); setError(null); }}
                placeholder="••••••••"
                autoComplete="off"
                className="w-full bg-term-gray border border-term-border rounded px-3.5 py-2.5 text-sm text-green-300 placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green transition-all"
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                Only the teacher needs this. It is the INSTRUCTOR_SETUP_CODE you set when you deployed
                the site, and it is what claims your instructor handle. Students leave this box empty.
              </p>
            </div>
          </details>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-start gap-2 animate-fadeIn">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded bg-term-green text-term-black font-bold text-sm tracking-wider hover:bg-green-400 active:scale-[0.99] transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                CHECKING...
              </>
            ) : (
              <>
                Enter
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-4 border-t border-neutral-900 text-center text-[11px] text-neutral-400">
          Shellgrounds
        </div>
      </div>
    </div>
  );
};
