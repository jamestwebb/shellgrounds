// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Asking before something costs the student points.
//
// This replaced `window.confirm`, which is ugly, unstyleable, says "localhost
// says", and drops the student out of the world the rest of the screen is
// building. All true, and none of it is why this file needed care.
//
// `window.confirm` is genuinely accessible. It traps focus, Escape cancels it,
// a screen reader announces it, and focus returns where it started when it
// closes. The hand-rolled overlays already in this codebase (PackSelector, and
// SimulationBoundary until it became a tab) do none of those things: they set
// role="dialog" and aria-modal and stop there, so a keyboard user can Tab
// straight out of them into the page behind. Swapping a native confirm for a
// third copy of that would have been a downgrade wearing better styling.
//
// So this uses the platform's own modal primitive. `<dialog>` with
// showModal() gives focus containment, Escape-to-cancel, correct dialog
// semantics, focus restoration, and rendering in the top layer -- no z-index,
// no scroll lock, no focus-trap library, and nothing to get subtly wrong.
//
// The one deliberate difference from window.confirm: the SAFE choice holds
// focus when the dialog opens. A confirm defaults to OK, and this dialog
// spends something the student cannot get back.

import { useEffect, useRef } from 'react';

/**
 * A modal yes/no question.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title        the question, as a heading
 * @param {React.ReactNode} props.children  the detail: what it costs, what is left
 * @param {string} props.confirmLabel
 * @param {string} props.cancelLabel
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel  also called on Escape and on backdrop click
 */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel
}) => {
  const ref = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // The safe option, not the expensive one.
      cancelRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Escape fires `cancel` rather than a click, so the caller has to be told
  // about it here or the dialog closes with the parent still believing it open.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancelEvent = (e) => { e.preventDefault(); onCancel?.(); };
    el.addEventListener('cancel', onCancelEvent);
    return () => el.removeEventListener('cancel', onCancelEvent);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      className="sg-dialog bg-term-gray border border-term-border rounded-xl shadow-2xl
                 p-0 w-[min(28rem,calc(100vw-2rem))] text-neutral-200"
      // A click on the backdrop lands on the dialog element itself, never on
      // its contents, which is how the two are told apart without a wrapper.
      onClick={(e) => { if (e.target === ref.current) onCancel?.(); }}
    >
      <form method="dialog" className="p-5 space-y-4">
        <h2 id="confirm-dialog-title" className="text-sm font-bold text-green-200">
          {title}
        </h2>

        <div className="text-xs text-neutral-300 leading-relaxed space-y-2">
          {children}
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-3 py-2 rounded-lg bg-term-sidebar-raised border border-term-border
                       text-xs font-bold text-neutral-300 hover:text-white cursor-pointer
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-term-green transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-2 rounded-lg bg-term-amber/20 border border-term-amber/60
                       text-xs font-bold text-amber-200 hover:bg-term-amber/30 cursor-pointer
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-term-amber transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
};
