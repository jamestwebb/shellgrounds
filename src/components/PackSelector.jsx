// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Curriculum Content Pack Selector Modal
//
// This used to be a positioned <div> with role="dialog" and aria-modal="true"
// and nothing behind either promise: no focus trap, no Escape, no focus
// restoration. A keyboard user tabbed straight out of it into the header and
// the terminal behind, while a screen reader was told the rest of the page
// was inert -- which was false, and worse than saying nothing. See A6b in
// docs/ACCESSIBILITY.md and the header comment of ConfirmDialog.jsx, which
// names this file as one of the two that got it wrong.
//
// So this is now the platform's own modal primitive, the same as
// ConfirmDialog: <dialog> with showModal(), which supplies focus containment,
// Escape-to-cancel, correct dialog semantics, focus restoration and the top
// layer for free. It also drops the raw slate palette and the emoji icons --
// every other screen in this product reads its colours from the term-*
// tokens (contrast-tested, see tailwind.config.js) and its icons from lucide;
// this was the last screen that had not caught up.
//
// Each pack row is a real <button> rather than an onClick div wrapping
// another <button> -- nested interactive controls are invalid HTML and a
// screen reader announces the inner one only, so the outer click target was
// never actually reachable by keyboard at all. One button per row, the whole
// card as its hit target, keeps the same big click area and makes it tabbable.

import { useEffect, useRef } from 'react';
import { Package, X, CircleCheck } from 'lucide-react';
import { listPacks } from '../../packs/index.js';

export default function PackSelector({ isOpen, onClose, currentPackId, onSelectPack, enabledPackIds = null }) {
  const ref = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) {
      el.showModal();
      closeRef.current?.focus();
    } else if (!isOpen && el.open) {
      el.close();
    }
  }, [isOpen]);

  // Escape fires `cancel` rather than a click, so the caller has to be told
  // about it here or the dialog closes with the parent still believing it
  // open -- the same wiring ConfirmDialog needs, for the same reason.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e) => { e.preventDefault(); onClose?.(); };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, [onClose]);

  // enabledPackIds comes from the server, where an instructor can change it
  // without a redeploy. Null means the answer has not arrived (or did not
  // arrive at all), and the bundled list stands — a student mid-course must
  // not lose the switcher because one request was slow.
  //
  // The pack they are currently in always stays listed. Being unable to see
  // the name of the course you are looking at reads as a broken page, and the
  // server is the thing that actually refuses a switched-off pack anyway.
  const packs = Array.isArray(enabledPackIds)
    ? listPacks().filter(p => enabledPackIds.includes(p.id) || p.id === currentPackId)
    : listPacks();

  return (
    <dialog
      ref={ref}
      aria-labelledby="pack-select-title"
      className="sg-dialog bg-term-gray border border-term-border rounded-xl shadow-2xl
                 p-0 w-[min(42rem,calc(100vw-2rem))] max-h-[85vh] text-neutral-200 font-mono"
      // A click on the backdrop lands on the dialog element itself, never on
      // its contents -- see ConfirmDialog for the same trick.
      onClick={(e) => { if (e.target === ref.current) onClose?.(); }}
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-term-border flex items-center justify-between bg-term-sidebar-deep flex-none">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-lg bg-term-green-faint border border-term-green/40 text-term-green shrink-0">
              <Package size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="pack-select-title" className="text-sm font-bold text-neutral-100">
                Challenge packs
              </h2>
              <p className="text-xs text-neutral-400">
                Each pack is a full course: its own filesystem, its own acts, its own challenges. Pick one to load it.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-term-sidebar-raised
                       shrink-0 cursor-pointer transition-colors
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-term-green"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pack Grid */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {packs.map(pack => {
            const isSelected = pack.id === currentPackId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => { onSelectPack(pack.id); onClose(); }}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full text-left p-4 rounded-xl border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3
                            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-term-green ${
                  isSelected
                    ? 'bg-term-green-faint border-term-green/80 shadow-lg'
                    : 'bg-term-sidebar-deep border-term-sidebar-border hover:border-neutral-500 hover:bg-term-sidebar-raised'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-neutral-100 text-sm">{pack.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-term-black text-neutral-300 border border-term-border">
                      v{pack.version}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-semibold text-term-green flex items-center gap-1">
                        <CircleCheck size={12} /> Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-400">
                    {pack.acts.length} acts • {pack.badges.length} badges • {pack.platforms.join(', ')}
                  </p>
                </div>

                <span
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold self-start sm:self-center shrink-0 ${
                    isSelected
                      ? 'bg-term-green text-term-black'
                      : 'bg-term-black text-neutral-300 border border-term-border'
                  }`}
                >
                  {isSelected ? 'Loaded' : 'Load this pack'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-term-border bg-term-sidebar-deep flex justify-end flex-none">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-term-sidebar-raised hover:bg-neutral-800 text-neutral-200 text-xs font-semibold
                       rounded-lg transition cursor-pointer
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-term-green"
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
