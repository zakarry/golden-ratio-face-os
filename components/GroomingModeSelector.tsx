'use client';

import React from 'react';
import type { GroomingModeId, GroomingStyleId } from '@/types/analysis';
import { GROOMING_MODES, GROOMING_STYLES } from '@/types/analysis';

interface GroomingModeSelectorProps {
  modeId: GroomingModeId;
  styleId: GroomingStyleId;
  onModeChange: (id: GroomingModeId) => void;
  onStyleChange: (id: GroomingStyleId) => void;
}

export default function GroomingModeSelector({
  modeId, styleId, onModeChange, onStyleChange,
}: GroomingModeSelectorProps) {
  const selectedMode  = GROOMING_MODES.find(m => m.id === modeId)!;
  const selectedStyle = GROOMING_STYLES.find(s => s.id === styleId)!;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 overflow-hidden">

      {/* ── Step 1: Purpose (用途) ── */}
      <div className="px-5 pt-5 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-stone-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            1
          </span>
          <span className="text-[11px] font-semibold text-stone-600 tracking-wide">用途を選択</span>
          <span className="text-[9px] text-stone-300 ml-1">シーン・目的</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {GROOMING_MODES.map(mode => {
            const active = modeId === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onModeChange(mode.id)}
                className={`relative rounded-xl px-3 py-3 text-center transition-all duration-200 border ${
                  active
                    ? 'bg-stone-800 border-stone-800 shadow-sm'
                    : 'bg-stone-50 border-stone-100 hover:border-stone-300 hover:bg-stone-100/60'
                }`}
              >
                <p className={`text-[11px] font-semibold leading-none ${active ? 'text-white' : 'text-stone-700'}`}>
                  {mode.label}
                </p>
                <p className={`text-[9px] mt-1 leading-snug ${active ? 'text-stone-300' : 'text-stone-400'}`}>
                  {mode.labelSub}
                </p>
                {active && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/50" />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 text-[10px] text-stone-400 leading-relaxed px-0.5">
          {selectedMode.detail}
        </p>
      </div>

      {/* ── Step 2: Style type (印象系統) ── */}
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            2
          </span>
          <span className="text-[11px] font-semibold text-stone-600 tracking-wide">印象を選択</span>
          <span className="text-[9px] text-stone-300 ml-1">目指すスタイル系統</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {GROOMING_STYLES.map(style => {
            const active = styleId === style.id;
            return (
              <button
                key={style.id}
                onClick={() => onStyleChange(style.id)}
                className={`relative rounded-xl px-3 py-3 text-left transition-all duration-200 border ${
                  active
                    ? 'bg-sky-600 border-sky-600 shadow-sm'
                    : 'bg-stone-50 border-stone-100 hover:border-sky-200 hover:bg-sky-50/40'
                }`}
              >
                <p className={`text-[11px] font-semibold leading-none ${active ? 'text-white' : 'text-stone-700'}`}>
                  {style.label}
                </p>
                <p className={`text-[9px] mt-1 leading-snug ${active ? 'text-sky-100' : 'text-stone-400'}`}>
                  {style.description}
                </p>
                {active && (
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/50" />
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-2.5 text-[10px] text-stone-400 leading-relaxed px-0.5">
          {selectedStyle.detail}
        </p>
      </div>
    </div>
  );
}
