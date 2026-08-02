'use client';

import React, { useState } from 'react';
import { Scissors, ChevronDown, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { GroomingAdvice as GroomingAdviceType, GroomingCategory } from '@/types/analysis';

interface GroomingAdviceProps {
  advice: GroomingAdviceType[];
}

// ─── Area icon + color config ─────────────────────────────────────────────────

const AREA_CONFIG: Record<GroomingCategory, { bg: string; text: string; border: string }> = {
  'ヘアスタイル':    { bg: 'bg-stone-100',  text: 'text-stone-700',  border: 'border-stone-200' },
  '眉':             { bg: 'bg-sky-50',     text: 'text-sky-700',    border: 'border-sky-200'   },
  '髭・ひげ':       { bg: 'bg-stone-50',   text: 'text-stone-600',  border: 'border-stone-200' },
  'フェイスライン':  { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  '肌質・テクスチャ': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const AREA_ORDER: GroomingCategory[] = ['ヘアスタイル', '眉', '髭・ひげ', 'フェイスライン', '肌質・テクスチャ'];

function AreaBadge({ area }: { area: GroomingCategory }) {
  const cfg = AREA_CONFIG[area] ?? { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-semibold tracking-wide flex-shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {area}
    </span>
  );
}

// ─── Emphasis / suppress rows ─────────────────────────────────────────────────

function TagRow({ items, type }: { items: string[]; type: 'emphasis' | 'suppress' }) {
  if (items.length === 0) return null;
  const isEmphasis = type === 'emphasis';
  return (
    <div className="flex items-start gap-2 mb-1">
      <div className={`flex items-center gap-1 flex-shrink-0 mt-0.5 ${isEmphasis ? 'text-sky-500' : 'text-stone-400'}`}>
        {isEmphasis ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
        <span className="text-[9px] font-semibold w-12">{isEmphasis ? '見せる' : '整える'}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border leading-none ${
            isEmphasis
              ? 'bg-sky-50/60 border-sky-100 text-sky-700'
              : 'bg-stone-50 border-stone-200 text-stone-500'
          }`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Single advice card ───────────────────────────────────────────────────────

function AdviceCard({ item, defaultOpen }: { item: GroomingAdviceType; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  // Sort tips by AREA_ORDER for consistent display
  const sortedTips = [...item.tips].sort((a, b) => {
    const ai = AREA_ORDER.indexOf(a.area);
    const bi = AREA_ORDER.indexOf(b.area);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="rounded-xl border border-stone-100 overflow-hidden bg-white">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50/60 transition-colors"
      >
        <p className="text-xs font-semibold text-stone-700 leading-snug">{item.category}</p>
        <ChevronDown className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-stone-50">
          {/* Emphasis / suppress */}
          <div className="pt-3 mb-3">
            <TagRow items={item.emphasis} type="emphasis" />
            <TagRow items={item.suppress} type="suppress" />
          </div>

          {/* Tips grouped by area */}
          <div className="space-y-3">
            {sortedTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <AreaBadge area={tip.area} />
                <div className="min-w-0">
                  <p className="text-xs text-stone-700 leading-relaxed font-medium">{tip.action}</p>
                  <div className="flex items-start gap-1 mt-1">
                    <Minus className="w-2.5 h-2.5 text-stone-300 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-stone-400 leading-relaxed">{tip.reason}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function AreaLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/40 overflow-hidden mt-3">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px] font-medium text-stone-400">グルーミングエリアの見方</span>
        <ChevronDown className={`w-3 h-3 text-stone-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-stone-100">
          <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {AREA_ORDER.map(area => {
              const cfg = AREA_CONFIG[area];
              return (
                <div key={area} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-sm ${cfg.bg} border ${cfg.border}`} />
                  <span className="text-[10px] text-stone-500">{area}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 pt-2 border-t border-stone-100 flex gap-4">
            <div className="flex items-center gap-1 text-[10px] text-stone-400">
              <ArrowUp className="w-2.5 h-2.5 text-sky-400" />見せる — 強調する要素
            </div>
            <div className="flex items-center gap-1 text-[10px] text-stone-400">
              <ArrowDown className="w-2.5 h-2.5 text-stone-400" />整える — なじませる要素
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function GroomingAdvice({ advice }: GroomingAdviceProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Scissors className="w-4 h-4 text-stone-600" strokeWidth={1.5} />
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
          グルーミング設計
        </p>
      </div>

      <div className="space-y-2">
        {advice.map((item, idx) => (
          <AdviceCard key={idx} item={item} defaultOpen={idx === 0} />
        ))}
      </div>

      <AreaLegend />
    </div>
  );
}
