// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Desktop Keyboard Guard for small touchscreens

import { useState, useEffect } from 'react';
import { Keyboard } from 'lucide-react';

// ── Width alone caught the wrong user (fails 1.4.10 Reflow) ────────────────
//
// Browser zoom shrinks the *effective* CSS viewport: a 1280px monitor at 400%
// reports 320px, same as a phone. Gating on `window.innerWidth < 768` alone
// therefore caught a low-vision student zoomed in on a desktop, with a real
// keyboard attached, and told them to go and find one -- exactly the user
// this screen was never meant to stop, and a bypass button does not undo
// having been told you are on the wrong device first. See A1 in
// docs/ACCESSIBILITY.md.
//
// `(pointer: coarse)` is the thing actually being detected: touch input, no
// hover, no fine positioning -- which a phone or tablet has and a zoomed-in
// desktop with a mouse does not, whatever the reported width says. Requiring
// BOTH the narrow viewport and a coarse pointer means a magnifier user keeps
// their fine pointer and never sees this screen at all; the existing bypass
// stays, for the rare device this heuristic still gets wrong.
export const KeyboardGuard = () => {
  const [blocked, setBlocked] = useState(false);
  const [bypassed, setBypassed] = useState(false);

  useEffect(() => {
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const check = () => {
      setBlocked(window.innerWidth < 768 && coarsePointer.matches);
    };
    check();
    window.addEventListener('resize', check);
    // The pointer type itself does not change with a resize -- a tablet
    // rotated or a window resized keeps the same input hardware -- but it CAN
    // change without one: a Bluetooth mouse paired to a tablet, or unpaired
    // from one, mid-session. `change` is the event for that.
    coarsePointer.addEventListener('change', check);
    return () => {
      window.removeEventListener('resize', check);
      coarsePointer.removeEventListener('change', check);
    };
  }, []);

  if (!blocked || bypassed) return null;

  return (
    <div className="fixed inset-0 z-50 bg-term-void text-neutral-200 flex items-center justify-center p-6 font-mono text-center select-none">
      <div className="max-w-sm w-full bg-term-black border border-term-border rounded-xl p-6 shadow-2xl space-y-5">
        <div className="inline-flex p-3 rounded-full bg-term-green-faint border border-term-green/30 text-term-green">
          <Keyboard size={36} />
        </div>

        <div>
          <h2 className="text-lg font-bold text-green-400">You need a real keyboard</h2>
          <p className="text-xs text-neutral-400 mt-1">Shellgrounds is a working command line</p>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed">
          The challenges use Tab to complete names, the Up and Down arrows to repeat commands, and the pipe
          character. None of those work well on a phone. Open Shellgrounds on a laptop or a desktop instead.
        </p>

        <div className="pt-2">
          <button
            onClick={() => setBypassed(true)}
            className="w-full py-2.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white text-xs font-bold transition-all cursor-pointer"
          >
            I have a real keyboard attached — continue
          </button>
        </div>
      </div>
    </div>
  );
};
