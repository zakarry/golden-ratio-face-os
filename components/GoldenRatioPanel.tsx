'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { GoldenRatioAnalysis, GoldenRatioItem } from '@/types/analysis';

// ─── Deviation bar ────────────────────────────────────────────────────────────

function DeviationBar({ pct }: { pct: number }) {
  const clamped = Math.max(-40, Math.min(40, pct));
  const isNeg   = clamped < 0;
  const w       = Math.abs(clamped) / 40 * 50; // max 50% of half-bar
  return (
    <div className="relative flex items-center h-1.5 w-full">
      {/* Track */}
      <div className="absolute inset-0 bg-stone-100 rounded-full" />
      {/* Center tick */}
      <div className="absolute left-1/2 -translate-x-px w-px h-3 bg-stone-300 top-1/2 -translate-y-1/2 z-10" />
      {/* Fill */}
      <div
        className={`absolute h-full rounded-full transition-all duration-500 ${
          Math.abs(pct) < 3 ? 'bg-emerald-400' : 'bg-amber-400'
        }`}
        style={{
          left:  isNeg ? `${50 - w}%` : '50%',
          width: `${w}%`,
        }}
      />
    </div>
  );
}

// ─── Single ratio row ─────────────────────────────────────────────────────────

function RatioRow({ item }: { item: GoldenRatioItem }) {
  const sign   = item.deviationPct >= 0 ? '+' : '';
  const isZero = Math.abs(item.deviationPct) < 2;
  const devColor = isZero ? 'text-emerald-600' : 'text-amber-600';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-stone-600 font-medium">{item.label}</span>
        <div className="flex items-baseline gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-stone-800 font-mono tabular-nums">
            {item.measured.toFixed(2)}
          </span>
          <span className="text-[10px] text-stone-400 font-mono tabular-nums">
            参考 {item.reference.toFixed(2)}
          </span>
          <span className={`text-[10px] font-semibold font-mono tabular-nums ${devColor}`}>
            {sign}{item.deviationPct}%
          </span>
        </div>
      </div>
      <DeviationBar pct={item.deviationPct} />
      <p className="text-[11px] text-stone-400 leading-relaxed">{item.note}</p>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

interface GoldenRatioPanelProps {
  gr: GoldenRatioAnalysis;
}

export default function GoldenRatioPanel({ gr }: GoldenRatioPanelProps) {
  const [open, setOpen] = useState(false);

  const items: GoldenRatioItem[] = [
    gr.faceRatio,
    gr.eyePositionRatio,
    gr.mouthPositionRatio,
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/30 overflow-hidden">
      {/* Header — always visible */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-1">
              構造参考
            </p>
            <h3 className="text-sm font-semibold text-stone-700 leading-snug">
              黄金比バランス（構造参考）
            </h3>
          </div>
          {/* φ badge */}
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-50 border border-amber-200/60 flex items-center justify-center">
            <span className="text-sm font-semibold text-amber-600" style={{ fontFamily: 'Georgia, serif' }}>φ</span>
          </div>
        </div>

        {/* Summary line */}
        <p className="text-[11px] text-stone-400 leading-relaxed mb-4">
          顔の構造バランスを黄金比の参考値と比較しています。{gr.summary}
        </p>

        {/* Compact summary chips */}
        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => {
            const sign    = item.deviationPct >= 0 ? '+' : '';
            const isClose = Math.abs(item.deviationPct) < 3;
            return (
              <div
                key={item.label}
                className={`rounded-xl border px-3 py-2.5 text-center transition-colors ${
                  isClose
                    ? 'border-emerald-200/60 bg-emerald-50/50'
                    : 'border-amber-200/40 bg-amber-50/30'
                }`}
              >
                <p className="text-[10px] text-stone-400 mb-1">{item.label}</p>
                <p className="text-sm font-bold text-stone-700 font-mono tabular-nums leading-none">
                  {item.measured.toFixed(2)}
                </p>
                <p className={`text-[10px] font-semibold font-mono tabular-nums mt-0.5 ${
                  isClose ? 'text-emerald-500' : 'text-amber-500'
                }`}>
                  {sign}{item.deviationPct}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable detail */}
      <div className="border-t border-stone-100">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-3 text-[11px] font-medium text-stone-400 hover:text-stone-600 hover:bg-stone-50/60 transition-colors"
        >
          <span>詳細な比率データ</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="px-6 pb-5 space-y-5">
            {items.map((item) => (
              <RatioRow key={item.label} item={item} />
            ))}

            {/* Reference note */}
            <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
              <p className="text-[10px] text-stone-400 leading-relaxed">
                黄金比（φ ≈ 1.618）は古くから建築・芸術の構造参考として用いられてきた比率です。
                本分析はその数値との構造的な比較を行っており、美醜の評価や優劣の判断を目的とするものではありません。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
