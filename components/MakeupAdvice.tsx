'use client';

import React, { useState } from 'react';
import { Sparkles, ChevronDown, Plus, Minus, Scale } from 'lucide-react';
import type { MakeupAdvice as MakeupAdviceType, StyleOperation, ContrastLevel, BlendStyle } from '@/types/analysis';

interface MakeupAdviceProps {
  advice: MakeupAdviceType[];
}

// ─── Style framework badge configs ───────────────────────────────────────────

const OP_CONFIG: Record<StyleOperation, { icon: React.ReactNode; bg: string; text: string; border: string }> = {
  '足し算': {
    icon: <Plus className="w-2.5 h-2.5" />,
    bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200',
  },
  '引き算': {
    icon: <Minus className="w-2.5 h-2.5" />,
    bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200',
  },
  'バランス': {
    icon: <Scale className="w-2.5 h-2.5" />,
    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',
  },
};

const CONTRAST_DOT: Record<ContrastLevel, string> = {
  '高コントラスト': 'bg-stone-800',
  '中コントラスト': 'bg-stone-400',
  '低コントラスト': 'bg-stone-200',
};

const BLEND_COLOR: Record<BlendStyle, string> = {
  'シャープ':       'text-sky-600',
  'グラデーション': 'text-amber-600',
  'ぼかし':         'text-stone-500',
};

// ─── Style strip ─────────────────────────────────────────────────────────────

function StyleStrip({ style }: { style: MakeupAdviceType['style'] }) {
  const op = OP_CONFIG[style.operation];
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${op.bg} ${op.text} ${op.border}`}>
        {op.icon}
        {style.operation}メイク
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-stone-200 bg-white text-[10px] text-stone-500">
        <span className={`w-2 h-2 rounded-full ${CONTRAST_DOT[style.contrast]} inline-block`} />
        {style.contrast}
      </span>
      <span className={`text-[10px] font-medium ${BLEND_COLOR[style.blend]}`}>
        {style.blend}
      </span>
    </div>
  );
}

// ─── Emphasis / suppress tag rows ────────────────────────────────────────────

function TagRow({ items, type }: { items: string[]; type: 'emphasis' | 'suppress' }) {
  if (items.length === 0) return null;
  const isEmphasis = type === 'emphasis';
  return (
    <div className="flex items-start gap-2 mb-1.5">
      <span className={`flex-shrink-0 text-[9px] font-semibold tracking-wide pt-0.5 w-14 ${isEmphasis ? 'text-sky-500' : 'text-stone-400'}`}>
        {isEmphasis ? '見せる' : 'なじませる'}
      </span>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span
            key={i}
            className={`text-[10px] px-1.5 py-0.5 rounded border leading-none ${
              isEmphasis
                ? 'bg-sky-50/60 border-sky-100 text-sky-700'
                : 'bg-stone-50 border-stone-200 text-stone-500'
            }`}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Single advice card ───────────────────────────────────────────────────────

function AdviceCard({ item, defaultOpen }: { item: MakeupAdviceType; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-stone-100 overflow-hidden bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50/60 transition-colors"
      >
        <p className="text-xs font-semibold text-stone-700 leading-snug">{item.category}</p>
        <ChevronDown
          className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-stone-50">
          <div className="pt-3">
            <StyleStrip style={item.style} />
          </div>
          <TagRow items={item.style.emphasis} type="emphasis" />
          <TagRow items={item.style.suppress} type="suppress" />
          <ul className="mt-3 space-y-1.5">
            {item.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-stone-300 mt-1.5 flex-shrink-0" />
                <span className="text-xs text-stone-600 leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible legend ───────────────────────────────────────────────────────

function FrameworkLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/40 overflow-hidden mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px] font-medium text-stone-400">スタイルフレームワークとは</span>
        <ChevronDown className={`w-3 h-3 text-stone-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-stone-100">
          {[
            { op: '足し算' as StyleOperation, icon: <Plus className="w-2.5 h-2.5 text-sky-500" />, desc: 'パーツを見せて強調する' },
            { op: '引き算' as StyleOperation, icon: <Minus className="w-2.5 h-2.5 text-stone-500" />, desc: 'なじませて印象を整える' },
            { op: 'バランス' as StyleOperation, icon: <Scale className="w-2.5 h-2.5 text-emerald-500" />, desc: '見せるとなじませるを組み合わせる' },
          ].map(({ op, icon, desc }) => (
            <div key={op} className="flex items-center gap-2 pt-1.5">
              {icon}
              <span className="text-[10px] font-semibold text-stone-600">{op}メイク</span>
              <span className="text-[10px] text-stone-400">— {desc}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-3">
            {(['高コントラスト', '中コントラスト', '低コントラスト'] as ContrastLevel[]).map((c) => (
              <div key={c} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${CONTRAST_DOT[c]}`} />
                <span className="text-[10px] text-stone-400">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function MakeupAdvice({ advice }: MakeupAdviceProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-gold" strokeWidth={1.5} />
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
          メイクアップアドバイス
        </p>
      </div>

      <div className="space-y-2">
        {advice.map((item, idx) => (
          <AdviceCard key={idx} item={item} defaultOpen={idx === 0} />
        ))}
      </div>

      <FrameworkLegend />
    </div>
  );
}
