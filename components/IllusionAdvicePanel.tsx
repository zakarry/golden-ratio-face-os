'use client';

import React, { useState } from 'react';
import { Wand as Wand2, ChevronDown } from 'lucide-react';
import type { IllusionAdviceSection, ScoringModeId } from '@/types/analysis';

// ─── Principle chip ───────────────────────────────────────────────────────────

function PrincipleChip({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200/60 text-[10px] font-medium text-amber-700 leading-none whitespace-nowrap">
      {text}
    </span>
  );
}

// ─── Single section card ──────────────────────────────────────────────────────

function SectionCard({ section }: { section: IllusionAdviceSection }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/40 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50/80 transition-colors"
      >
        <div className="space-y-0.5 min-w-0">
          <p className="text-[10px] text-stone-400 font-medium truncate">{section.trigger}</p>
          <p className="text-xs font-semibold text-stone-700 leading-snug">{section.goal}</p>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-stone-400 flex-shrink-0 mt-1 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Mode strategy — always visible, directly under the header */}
      {section.modeNote && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[11px] text-amber-700/70 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2 leading-relaxed">
            {section.modeNote}
          </p>
        </div>
      )}

      {/* Tips — expanded */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-stone-100">
          {section.tips.map((tip, i) => (
            <div key={i} className="pt-3 space-y-1.5">
              <PrincipleChip text={tip.principle} />
              <p className="text-xs text-stone-600 leading-relaxed pl-0.5">{tip.action}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mode label maps ──────────────────────────────────────────────────────────

const MODE_LABEL: Record<ScoringModeId, string> = {
  natural: '日常',
  stage:   'ステージ',
  photo:   '宣材写真',
};

const MODE_SECTION_LABEL: Record<ScoringModeId, string> = {
  natural: 'ナチュラルメイク提案',
  stage:   'ステージメイク提案',
  photo:   '写真映えメイク提案',
};

const MODE_DESCRIPTION: Record<ScoringModeId, string> = {
  natural: '軽い補正で自然な仕上がりを保ちながら、見え方をやさしく整えます。',
  stage:   'コントラストを強め、遠目・照明下でも錯覚効果が伝わるよう強調します。',
  photo:   '光と構図を使い、カメラ正面で自然に見え方を調整します。',
};

// ─── Panel ────────────────────────────────────────────────────────────────────

interface IllusionAdvicePanelProps {
  sections: IllusionAdviceSection[];
  modeId: ScoringModeId;
}

export default function IllusionAdvicePanel({ sections, modeId }: IllusionAdvicePanelProps) {
  if (sections.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-champagne/30 px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
          <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
            錯覚トリックメイク — {MODE_SECTION_LABEL[modeId]}
          </p>
        </div>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          構造の各比率が参考値に近いため、大きな視覚調整は必要ありません。
          現在のバランスを活かした{MODE_LABEL[modeId]}メイクでご対応いただけます。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/30 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-stone-50">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
            <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase">錯覚トリックメイク提案</p>
          </div>
          <span className="flex-shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200/50 rounded-full px-2 py-0.5">
            {MODE_LABEL[modeId]}向け
          </span>
        </div>
        {/* Mode section title */}
        <p className="text-sm font-semibold text-stone-700 mb-1">{MODE_SECTION_LABEL[modeId]}</p>
        <p className="text-[11px] text-stone-400 leading-relaxed">
          {MODE_DESCRIPTION[modeId]}
        </p>

        {/* Principles legend */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            '明るい＝前進',
            '暗い＝後退',
            '横＝幅が広がる',
            '縦＝長く見える',
          ].map((p) => (
            <span
              key={p}
              className="text-[10px] text-stone-400 bg-stone-50 border border-stone-150 rounded-full px-2 py-0.5"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="px-4 py-4 space-y-3">
        {sections.map((section, i) => (
          <SectionCard key={i} section={section} />
        ))}
      </div>

      {/* Footer note */}
      <div className="px-6 pb-5">
        <p className="text-[10px] text-stone-300 leading-relaxed">
          視覚調整はあくまで見え方のバランスを整えることを目的としています。美醜の評価ではありません。
        </p>
      </div>
    </div>
  );
}
