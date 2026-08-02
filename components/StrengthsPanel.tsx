'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { FaceStrength } from '@/types/analysis';

interface StrengthsPanelProps {
  strengths: FaceStrength[];
}

export default function StrengthsPanel({ strengths }: StrengthsPanelProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-emerald-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
          <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
            あなたの強み
          </p>
        </div>
        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
          {strengths.length}項目
        </span>
      </div>

      {/* Strength cards */}
      <div className="px-4 py-4 space-y-2.5">
        {strengths.map((s, i) => (
          <StrengthCard key={i} strength={s} index={i} />
        ))}
      </div>

      <div className="px-6 pb-4">
        <p className="text-[10px] text-stone-300 leading-relaxed">
          顔の構造的な特徴から導いた設計上の強みです。美醜の評価や他者との比較ではありません。
        </p>
      </div>
    </div>
  );
}

function StrengthCard({ strength, index }: { strength: FaceStrength; index: number }) {
  const letters = ['A', 'B', 'C'];

  return (
    <div className="flex items-start gap-3 bg-emerald-50/40 rounded-xl border border-emerald-100/60 px-4 py-3">
      {/* Index badge */}
      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {letters[index] ?? index + 1}
      </div>

      <div className="min-w-0 space-y-1">
        {/* Feature */}
        <p className="text-xs font-semibold text-stone-700 leading-snug">
          {strength.feature}
        </p>

        {/* Impression + usage as a single flowing line */}
        <p className="text-[11px] text-stone-500 leading-relaxed">
          <span className="text-emerald-600 font-medium">{strength.impression}</span>
          <span className="text-stone-300 mx-1">·</span>
          {strength.usage}
        </p>
      </div>
    </div>
  );
}
