// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Gate view: Handle registration, class password verification, and session resume

import React, { useState } from 'react';
import { Terminal, Shield, Key, AlertCircle, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { checkSFW } from '../engine/sfw-filter';
import { registerHandle } from '../utils/api';
import { sounds } from '../utils/audio';

export const Gate = ({ onAuthenticated, onResumeSession, existingHandle }) => {
  const [handle, setHandle] = useState(existingHandle || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Live SFW format preview
  const sfwResult = handle.trim() ? checkSFW(handle.trim()) : null;

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    const cleanHandle = handle.trim();
    const cleanPassword = password.trim();

    if (!cleanHandle) {
      setError('Please choose a handle for the leaderboard');
      sounds.playError();
      return;
    }

    if (!sfwResult?.safe) {
      setError(sfwResult?.reason || 'Invalid handle format');
      sounds.playError();
      return;
    }

    if (!cleanPassword) {
      setError('Class password is required');
      sounds.playError();
      return;
    }

    setLoading(true);
    try {
      const res = await registerHandle(cleanHandle, cleanPassword);
      sounds.playSuccess();
      // Await the full session setup: the button must stay disabled until the
      // player is actually inside, and any failure must surface here.
      await onAuthenticated(res.handle, res.token);
    } catch (err) {
      setError(err.message || 'Authentication failed');
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
          <h1 className="text-2xl font-bold text-green-400 tracking-wider">THE GAUNTLET</h1>
          <p className="text-xs text-neutral-400 mt-1.5 italic">"Prove it in the terminal."</p>
          <div className="text-[11px] text-neutral-400 mt-1 uppercase tracking-widest">
            CIS 4400 / 5544 · Forensics CLI 101
          </div>
        </div>

        {/* Existing Session Resume Option */}
        {existingHandle && (
          <div className="mb-6 p-4 rounded-lg bg-term-gray border border-term-border flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-400">Previous Station Located</div>
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

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-300 mb-1.5 font-medium flex items-center gap-1.5">
              <Terminal size={13} className="text-term-green" /> Analyst Handle (Leaderboard Name)
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
            <p className="text-[11px] text-neutral-400 mt-1">3–20 chars, letters, numbers, hyphens or underscores.</p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-neutral-300 mb-1.5 font-medium flex items-center gap-1.5">
              <Key size={13} className="text-term-green" /> Class Password (Announced in Lecture)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="••••••••••••"
              className="w-full bg-term-gray border border-term-border rounded px-3.5 py-2.5 text-sm text-green-300 placeholder-neutral-500 focus:outline-none focus:border-term-green focus:ring-1 focus:ring-term-green transition-all"
            />
            <p className="text-[11px] text-neutral-400 mt-1">Gates handle creation only. Ask James if you missed it.</p>
          </div>

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
            className="w-full py-3 rounded bg-term-green text-term-black font-bold text-sm tracking-wider uppercase hover:bg-green-400 active:scale-[0.99] transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                VERIFYING CLEARANCE...
              </>
            ) : (
              <>
                ENTER THE GAUNTLET
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-8 pt-4 border-t border-neutral-900 text-center text-[11px] text-neutral-400">
          CIS 4400 / 5544 · Fall 2026
        </div>
      </div>
    </div>
  );
};
