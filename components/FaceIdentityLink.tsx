'use client';

import React from 'react';
import { ScanFace, ArrowRight } from 'lucide-react';

interface FaceIdentityLinkProps {
  onClick: () => void;
  variant?: 'compact' | 'card';
}

// Persistent action: 「あなたの顔の設計図を見る」
// Available from Home, Face Design, Face Designer Review, and Face Karte.
// Face Identity is the permanent facial blueprint — always accessible.
export default function FaceIdentityLink({ onClick, variant = 'compact' }: FaceIdentityLinkProps) {
  if (variant === 'card') {
    return (
      <button
        onClick={onClick}
        className="group w-full flex items-center gap-3 rounded-2xl border border-champagne/40 bg-gradient-to-r from-champagne/10 to-amber-50/30 px-5 py-4 hover:from-champagne/20 hover:to-amber-50/50 transition-all duration-200"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold to-champagne flex items-center justify-center flex-shrink-0 shadow-sm">
          <ScanFace className="w-4 h-4 text-white" strokeWidth={1.5} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-semibold text-stone-700 tracking-wide">あなたの顔の設計図を見る</p>
          <p className="text-[10px] text-stone-400 mt-0.5">黄金比・Face Identity</p>
        </div>
        <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-champagne/40 bg-white/80 backdrop-blur-sm text-xs font-semibold text-stone-600 hover:border-gold/50 hover:bg-champagne/10 transition-all duration-200"
    >
      <ScanFace className="w-3.5 h-3.5 text-gold" strokeWidth={1.5} />
      あなたの顔の設計図を見る
      <ArrowRight className="w-3 h-3 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}
