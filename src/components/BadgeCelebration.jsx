// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Badge unlock celebration overlay with confetti burst

import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Star, ChevronRight } from 'lucide-react';
import { sounds } from '../utils/audio';

export const BadgeCelebration = ({ badge, onClose }) => {
  useEffect(() => {
    if (badge) {
      sounds.playSuccess();
      try {
        // Fire celebration confetti burst
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981']
        });
      } catch {
        // Fallback gracefully if canvas is blocked
      }
    }
  }, [badge]);

  if (!badge) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 font-mono select-none animate-fadeIn">
      <div className="max-w-md w-full bg-term-black border border-term-border rounded-2xl shadow-2xl overflow-hidden text-center relative">
        {/* Glowing Header Banner */}
        <div className="bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 p-6 text-term-black relative overflow-hidden">
          <div className="flex items-center justify-center gap-2 mb-1 text-xs font-bold tracking-wider">
            <Trophy size={16} /> Badge earned <Trophy size={16} />
          </div>
          <h2 className="text-2xl font-black tracking-wide">Nice work</h2>
        </div>

        {/* Badge Icon & Description Body */}
        <div className="p-8 space-y-6">
          <div className="relative inline-block">
            <div className={`w-28 h-28 bg-gradient-to-br ${badge.color || 'from-emerald-500 to-green-600'} rounded-full flex items-center justify-center mx-auto shadow-2xl text-5xl border-4 border-yellow-400/80 animate-bounce`}>
              {badge.icon || '🏆'}
            </div>
            <Star className="text-yellow-400 absolute -top-1 -right-1 animate-pulse" size={24} />
          </div>

          <div>
            <h3 className="text-xl font-bold text-yellow-400 mb-2">{badge.name}</h3>
            <p className="text-xs text-neutral-300 leading-relaxed font-mono px-4">
              {badge.description}
            </p>
          </div>

          <p className="text-[11px] text-neutral-500">
            This badge now sits next to your handle on the leaderboard.
          </p>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-term-green hover:bg-green-400 text-term-black font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.4)] cursor-pointer"
          >
            Keep going <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
