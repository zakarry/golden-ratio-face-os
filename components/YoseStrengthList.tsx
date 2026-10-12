'use client';

// 「あなたの強み」：寄せ方（黄金比が目標）で範囲内（許容幅の中）に入った指標の一覧。固定文は使わない。

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics } from '@/lib/pilot/targetCard';
import { yoseStrengths } from '@/lib/pilot/yoseStrengths';

/** 設計図から強みを出す。画像サイズの無い古い設計図では null */
export function strengthsFromGuide(guide: DetectedGuide | null | undefined): string[] | null {
  if (!guide?.imageWidth || !guide.imageHeight) return null;
  const list = yoseStrengths(computePilotMetrics(guide, guide.imageWidth, guide.imageHeight));
  // 目尻・目頭の高さが無い古い設計図では目の角度が黄金比の値（7.5°）で埋まるので、強みに数えない
  return guide.leftEyeOuterY == null ? list.filter(s => s !== '目の角度') : list;
}

/**
 * imageSrc：設計図に画像サイズが入っていない古い保存でも、保存してある写真（元画像そのまま）の縦横から計算する
 */
export default function YoseStrengthList({ guide, items, imageSrc }: { guide?: DetectedGuide | null; items?: string[] | null; imageSrc?: string | null }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const needSize = !items && !!guide && !(guide.imageWidth && guide.imageHeight) && !!imageSrc;
  useEffect(() => {
    if (!needSize || !imageSrc) return;
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive && img.naturalWidth) setSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.src = imageSrc;
    return () => { alive = false; };
  }, [needSize, imageSrc]);

  const list = items
    ?? strengthsFromGuide(guide)
    ?? (guide && size ? strengthsFromGuide({ ...guide, imageWidth: size.w, imageHeight: size.h }) : null);
  if (needSize && !size && !list) return <p className="text-xs text-stone-400 px-1">強みを計算しています…</p>;
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
