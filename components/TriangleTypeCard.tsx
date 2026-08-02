'use client';

import React from 'react';
import type { TriangleAnalysis } from '@/types/analysis';

// ─── Per-type visual config ────────────────────────────────────────────────────

const TYPE_CONFIG = {
  balanced: {
    accent: 'from-amber-50 to-stone-50',
    border: 'border-amber-200/60',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    dotColor: 'bg-amber-400',
    icon: <BalancedIcon />,
    tagline: '正統派・汎用印象',
  },
  vertical: {
    accent: 'from-sky-50 to-stone-50',
    border: 'border-sky-200/60',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-800',
    dotColor: 'bg-sky-400',
    icon: <VerticalIcon />,
    tagline: '上品・大人っぽい印象',
  },
  horizontal: {
    accent: 'from-rose-50 to-stone-50',
    border: 'border-rose-200/60',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    dotColor: 'bg-rose-400',
    icon: <HorizontalIcon />,
    tagline: '親しみやすい・フレッシュな印象',
  },
} as const;

// ─── SVG mini-icons (stylised triangles) ─────────────────────────────────────

function BalancedIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <polygon points="6,32 20,8 34,32" fill="rgba(201,169,110,0.18)" stroke="rgba(201,169,110,0.85)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="6"  cy="32" r="2.5" fill="rgba(201,169,110,0.9)" />
      <circle cx="20" cy="8"  r="2.5" fill="rgba(201,169,110,0.9)" />
      <circle cx="34" cy="32" r="2.5" fill="rgba(201,169,110,0.9)" />
    </svg>
  );
}

function VerticalIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <polygon points="8,36 20,4 32,36" fill="rgba(125,190,230,0.18)" stroke="rgba(100,160,210,0.85)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="8"  cy="36" r="2.5" fill="rgba(100,160,210,0.9)" />
      <circle cx="20" cy="4"  r="2.5" fill="rgba(100,160,210,0.9)" />
      <circle cx="32" cy="36" r="2.5" fill="rgba(100,160,210,0.9)" />
    </svg>
  );
}

function HorizontalIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <polygon points="2,32 20,12 38,32" fill="rgba(230,140,150,0.18)" stroke="rgba(210,100,110,0.75)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="2"  cy="32" r="2.5" fill="rgba(210,100,110,0.85)" />
      <circle cx="20" cy="12" r="2.5" fill="rgba(210,100,110,0.85)" />
      <circle cx="38" cy="32" r="2.5" fill="rgba(210,100,110,0.85)" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TriangleTypeCardProps {
  ta: TriangleAnalysis;
}

export default function TriangleTypeCard({ ta }: TriangleTypeCardProps) {
  const cfg = TYPE_CONFIG[ta.type];

  return (
    <div className={`bg-gradient-to-br ${cfg.accent} rounded-2xl shadow-sm border ${cfg.border} overflow-hidden`}>
      {/* Top bar label */}
      <div className="px-6 pt-5 pb-0 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase">
          顔印象タイプ
        </p>
        <span className="text-[10px] text-stone-400 font-mono">
          三角形比率 {ta.ratio.toFixed(2)}
        </span>
      </div>

      {/* Main type display */}
      <div className="px-6 pt-3 pb-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/70 border border-white/80 shadow-sm flex items-center justify-center mt-0.5">
            {cfg.icon}
          </div>

          <div className="flex-1 min-w-0">
            {/* Badge + label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} inline-block`} />
                {ta.label}
              </span>
            </div>
            {/* Tagline */}
            <p className="text-[11px] text-stone-500 font-medium mb-2">{cfg.tagline}</p>
            {/* Description */}
            <p className="text-xs text-stone-600 leading-relaxed">{ta.description}</p>
          </div>
        </div>
      </div>

      {/* Divider + makeup tips */}
      <div className="border-t border-white/60 bg-white/40 px-6 py-4">
        {ta.makeupAdvice.length > 0 ? (
          <>
            <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-2.5">
              印象設計のポイント
            </p>
            <ul className="space-y-1.5">
              {ta.makeupAdvice.map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
                  <span className="text-xs text-stone-600 leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-stone-400 italic">
            バランスの取れた配置です。自然なメイクで十分な印象設計が可能です。
          </p>
        )}
      </div>
    </div>
  );
}
