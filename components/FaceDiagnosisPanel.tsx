'use client';

import React, { useState } from 'react';
import { ChevronDown, ScanFace } from 'lucide-react';
import type { FaceDiagnosis, DiagnosisItem } from '@/types/analysis';

// ─── Badge style per tone ─────────────────────────────────────────────────────

const TONE_STYLES: Record<DiagnosisItem['tone'], { badge: string; dot: string }> = {
  neutral: { badge: 'bg-stone-100 text-stone-600 border-stone-200', dot: 'bg-stone-300' },
  info:    { badge: 'bg-sky-50 text-sky-700 border-sky-200',        dot: 'bg-sky-400'   },
  caution: { badge: 'bg-amber-50 text-amber-700 border-amber-200',  dot: 'bg-amber-400' },
};

// ─── Single diagnosis row ─────────────────────────────────────────────────────

function DiagRow({ item }: { item: DiagnosisItem }) {
  const [open, setOpen] = useState(false);
  const { badge, dot } = TONE_STYLES[item.tone];
  return (
    <div className="py-2.5 border-b border-stone-100 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
          <span className="text-xs text-stone-600 font-medium">{item.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}>
            {item.display}
          </span>
          {item.tone !== 'neutral' && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-stone-300 hover:text-stone-500 transition-colors"
              aria-label="詳細を表示"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {open && (
        <p className="mt-1.5 ml-4 text-[11px] text-stone-400 leading-relaxed">
          {item.note}
        </p>
      )}
    </div>
  );
}

// ─── Section group ────────────────────────────────────────────────────────────

interface GroupProps {
  title: string;
  items: DiagnosisItem[];
}
function DiagGroup({ title, items }: GroupProps) {
  return (
    <div className="bg-stone-50/60 rounded-xl border border-stone-100 px-4 py-1">
      <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase pt-3 pb-1">{title}</p>
      {items.map((item) => (
        <DiagRow key={item.label} item={item} />
      ))}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface FaceDiagnosisPanelProps {
  diagnosis: FaceDiagnosis;
}

export default function FaceDiagnosisPanel({ diagnosis: d }: FaceDiagnosisPanelProps) {
  const verticalItems  = [d.forehead, d.midFace, d.philtrum, d.chin];
  const horizontalItems = [d.eyeDistance, d.eyeLevel, d.eyeWidth, d.jawline];

  const issueCount = [...verticalItems, ...horizontalItems].filter(
    (i) => i.tone !== 'neutral'
  ).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScanFace className="w-4 h-4 text-gold" strokeWidth={1.5} />
          <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
            顔バランス診断
          </p>
        </div>
        {issueCount > 0 ? (
          <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
            {issueCount}件の調整ポイント
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            バランス良好
          </span>
        )}
      </div>

      <p className="text-[11px] text-stone-400 leading-relaxed mb-4">
        各パーツの傾向を診断しています。青いバッジは印象設計・メイク最適化の参考ポイントです。
        美醜の評価ではありません。
      </p>

      <div className="space-y-3">
        <DiagGroup title="縦バランス" items={verticalItems} />
        <DiagGroup title="横バランス・目元" items={horizontalItems} />
      </div>
    </div>
  );
}
