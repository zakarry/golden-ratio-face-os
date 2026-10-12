'use client';

// 「あなたの強み」：寄せ方（黄金比が目標）で範囲内（許容幅の中）に入った指標の一覧。固定文は使わない。

import React from 'react';
import { Sparkles } from 'lucide-react';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics } from '@/lib/pilot/targetCard';
import { yoseStrengths } from '@/lib/pilot/yoseStrengths';

/** 設計図から強みを出す。画像サイズの無い古い設計図では null */
export function strengthsFromGuide(guide: DetectedGuide | null | undefined): string[] | null {
  if (!guide?.imageWidth || !guide.imageHeight) return null;
  return yoseStrengths(computePilotMetrics(guide, guide.imageWidth, guide.imageHeight));
}

export default function YoseStrengthList({ guide, items }: { guide?: DetectedGuide | null; items?: string[] | null }) {
  const list = items ?? strengthsFromGuide(guide);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-emerald-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
          <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">あなたの強み</p>
        </div>
        {list && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">{list.length}項目</span>}
      </div>
      <div className="px-5 py-4 space-y-2">
        <p className="text-[11px] text-stone-400">黄金比の範囲内に入っているところ</p>
        {list === null
          ? <p className="text-xs text-stone-500">この設計図からは計算できません。撮り直すと表示されます。</p>
          : list.length === 0
            ? <p className="text-xs text-stone-500">黄金比の範囲内に入っている項目はありません。</p>
            : <ul className="flex flex-wrap gap-1.5">{list.map(s => <li key={s} className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1">{s}</li>)}</ul>}
      </div>
    </div>
  );
}
