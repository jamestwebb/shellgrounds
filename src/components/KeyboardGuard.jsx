// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Desktop Keyboard Guard for screens under 768px width

import React, { useState, useEffect } from 'react';
import { Keyboard, Laptop, AlertCircle } from 'lucide-react';
import { BrandMark } from './BrandMark';

export const KeyboardGuard = () => {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [bypassed, setBypassed] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  if (!isSmallScreen || bypassed) return null;

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
