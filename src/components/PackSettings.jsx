// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Instructor screen: which packs this site offers.
//
// The choice lives in a settings record on the server, so a toggle takes
// effect for the next student who loads the page. It is not the deploy-time
// ENABLED_PACKS variable, which only seeds a site nobody has configured.
//
// Two rules the screen has to make visible rather than merely enforce:
//
//   1. Switching a pack off never deletes anything. Scores, solves and hints
//      are kept, and come back exactly as they were if it is switched on
//      again. A teacher will not experiment with a control they suspect of
//      erasing a term's work.
//   2. The last pack cannot be switched off. A site offering nothing shows
//      students an empty page, and the teacher who did it would have no
//      obvious way back. The screen refuses it in place, with the reason,
//      rather than letting the save fail.

import React, { useCallback, useEffect, useState } from 'react';
import {
  Layers, Check, AlertTriangle, RefreshCw, Save, Info, Monitor, Terminal
} from 'lucide-react';
import { fetchSiteConfig, saveSiteConfig } from '../utils/api';

const PlatformMark = ({ platforms = [] }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400">
    {platforms.includes('linux') && (
      <span className="inline-flex items-center gap-1"><Terminal size={11} /> Linux</span>
    )}
    {platforms.includes('windows') && (
      <span className="inline-flex items-center gap-1"><Monitor size={11} /> Windows</span>
    )}
  </span>
);

const Toggle = ({ on, disabled, onClick, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`relative w-14 h-7 rounded-full border transition-all shrink-0 ${
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
    } ${
      on
        ? 'bg-term-green/20 border-term-green shadow-[0_0_10px_rgba(34,197,94,0.25)]'
        : 'bg-term-black border-term-border'
    }`}
  >
    <span
      className={`absolute top-1 w-5 h-5 rounded-full transition-all ${
        on ? 'left-8 bg-term-green' : 'left-1 bg-neutral-600'
      }`}
    />
  </button>
);

export const PackSettings = ({ onSaved }) => {
  const [catalogue, setCatalogue] = useState([]);
  const [enabled, setEnabled] = useState([]);
  const [saved, setSaved] = useState([]);      // what the server last confirmed
  const [configured, setConfigured] = useState(true);
  const [source, setSource] = useState('settings');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSiteConfig();
      if (!data) throw new Error('Could not read the site settings.');
      setCatalogue(data.packs || []);
      setEnabled(data.enabledPacks || []);
      setSaved(data.enabledPacks || []);
      setConfigured(!!data.configured);
      setSource(data.source || 'settings');
    } catch (err) {
      setError(err.message || 'Could not read the site settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isOn = (id) => enabled.includes(id);
  const lastOne = enabled.length === 1;

  const toggle = (id) => {
    setNotice(null);
    setError(null);
    if (isOn(id)) {
      if (lastOne) {
        setNotice('Keep at least one pack switched on. A site with none shows students an empty page.');
        return;
      }
      setEnabled(enabled.filter(x => x !== id));
    } else {
      // Keep catalogue order, so the list does not reshuffle as you click.
      setEnabled(catalogue.map(p => p.id).filter(x => x === id || enabled.includes(x)));
    }
  };

  const dirty =
    enabled.length !== saved.length || enabled.some((id, i) => id !== saved[i]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await saveSiteConfig(enabled);
      setSaved(data.enabledPacks || []);
      setEnabled(data.enabledPacks || []);
      setConfigured(true);
      setSource('settings');
      setNotice('Saved. Students see this the next time they load the page.');
      onSaved?.(data.enabledPacks || []);
    } catch (err) {
      setError(err.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
        <RefreshCw size={13} className="animate-spin" /> Reading the site settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2 text-term-green">
            <Layers size={15} /> PACKS
          </h2>
          <p className="text-[11px] text-neutral-400 mt-1 max-w-xl">
            Each pack switched on is its own course, with its own leaderboard. Students pick
            between them from the header.
          </p>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
            dirty && !busy
              ? 'bg-term-green text-term-black border-term-green cursor-pointer hover:brightness-110'
              : 'bg-term-gray text-neutral-500 border-term-border cursor-not-allowed'
          }`}
        >
          {busy
            ? <><RefreshCw size={12} className="animate-spin" /> SAVING</>
            : <><Save size={12} /> {dirty ? 'SAVE CHANGES' : 'SAVED'}</>}
        </button>
      </div>

      {!configured && (
        <div className="p-3 rounded-lg bg-term-black border border-term-border text-[11px] text-neutral-300 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0 text-term-green" />
          <span>
            Nobody has chosen yet, so the site is showing{' '}
            {source === 'environment' ? 'whatever ENABLED_PACKS was set to at deploy time' : 'every pack'}.
            Save once and this screen takes over — no redeploy needed after that.
          </span>
        </div>
      )}

      {notice && (
        <div className="p-3 rounded-lg bg-term-black border border-term-border text-[11px] text-neutral-200 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0 text-term-green" /> <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        {catalogue.map(pack => {
          const on = isOn(pack.id);
          return (
            <div
              key={pack.id}
              className={`p-4 rounded-lg border flex items-start gap-4 transition-all ${
                on ? 'bg-term-gray border-term-green/40' : 'bg-term-black border-term-border'
              }`}
            >
              <Toggle
                on={on}
                disabled={busy || (on && lastOne)}
                onClick={() => toggle(pack.id)}
                label={`${on ? 'Switch off' : 'Switch on'} ${pack.name}`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={`text-sm font-bold ${on ? 'text-green-200' : 'text-neutral-400'}`}>
                    {pack.name}
                  </span>
                  <code className="text-[11px] text-neutral-500">{pack.id}</code>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="text-[11px] text-neutral-400">
                    {pack.challenges} challenges
                    {pack.acts > 0 && ` · ${pack.acts} acts`}
                  </span>
                  <PlatformMark platforms={pack.platforms} />
                </div>
                {on && lastOne && (
                  <p className="text-[11px] text-neutral-500 mt-1.5">
                    The only pack switched on. Switch another on before switching this off.
                  </p>
                )}
              </div>

              <span
                className={`text-[11px] font-bold shrink-0 mt-1 flex items-center gap-1 ${
                  on ? 'text-term-green' : 'text-neutral-600'
                }`}
              >
                {on ? <><Check size={12} /> ON</> : 'OFF'}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Switching a pack off hides it and stops the site grading its challenges, even for a
        student who saved the link. <span className="text-neutral-400">Nothing is deleted.</span>{' '}
        Every score, solve and hint is kept, and returns exactly as it was if you switch the
        pack back on.
      </p>
    </div>
  );
};
