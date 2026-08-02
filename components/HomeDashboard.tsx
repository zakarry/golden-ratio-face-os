'use client';

import React, { useEffect, useState } from 'react';
import { ScanFace, ArrowRight, Sparkles } from 'lucide-react';
import { getBaselineRecord } from '@/lib/karteStorage';
import FaceIdentityLink from '@/components/FaceIdentityLink';

type Gender = 'female' | 'male';
type NavId = 'home' | 'identity' | 'condition' | 'design' | 'karte' | 'insight';

interface HomeDashboardProps {
  gender: Gender;
  onNavigate: (id: NavId) => void;
}

export default function HomeDashboard({ onNavigate }: HomeDashboardProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [hasFaceId, setHasFaceId] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const check = () => {
      const baseline = getBaselineRecord();
      setHasFaceId(Boolean(baseline));
    };
    check();
    window.addEventListener('storage', check);
    window.addEventListener('face-karte-updated', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('face-karte-updated', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!isMounted) {
    return <div className="min-h-[500px]" aria-hidden="true" />;
  }

  return <HomeExperience hasFaceId={hasFaceId} onNavigate={onNavigate} />;
}

// ─── Home Experience ──────────────────────────────────────────────────────────

function HomeExperience({
  hasFaceId,
  onNavigate,
}: {
  hasFaceId: boolean;
  onNavigate: (id: NavId) => void;
}) {
  const handlePrimary = () => {
    if (!hasFaceId) {
      onNavigate('identity');
      return;
    }
    onNavigate('design');
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-220px)]">
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-12 pb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-champagne/30 to-amber-50/40 border border-champagne/30 mb-8">
          <Sparkles className="w-3 h-3 text-gold" />
          <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">今日のメイクの目的は？</span>
        </div>

        <h2
          className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-stone-900 leading-[1.3]"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          今日のメイクの目的は？
        </h2>

        <p className="mt-6 text-sm sm:text-base text-stone-500 leading-[2] tracking-wide max-w-md">
          今日はどんな印象を届けたいですか？
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            onClick={handlePrimary}
            className="group inline-flex items-center gap-3 px-8 sm:px-10 py-4 sm:py-5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-base sm:text-lg font-semibold shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
          >
            <ScanFace className="w-5 h-5" strokeWidth={1.8} />
            今日のメイクを始める
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {!hasFaceId && (
            <p className="text-[12px] text-stone-400 mt-2 tracking-wide">
              まずはFace IDを作成しましょう。
            </p>
          )}

          {hasFaceId && (
            <div className="mt-6">
              <FaceIdentityLink onClick={() => onNavigate('identity')} variant="card" />
            </div>
          )}
        </div>
      </section>

      <HomeFooter />
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────────────────────

function HomeFooter() {
  return (
    <footer className="pt-8 pb-6 text-center">
      <div className="max-w-lg mx-auto">
        <p
          className="text-base sm:text-lg font-semibold text-stone-800 tracking-tight"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          黄金比 Face OS
        </p>
        <p
          className="mt-3 text-sm sm:text-base text-stone-600 leading-relaxed"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          黄金比から始まる、<br />
          一生の顔カルテ。
        </p>
        <p className="mt-6 text-[11px] sm:text-xs text-stone-400 leading-loose max-w-sm mx-auto">
          黄金比は、<br />
          あなた自身を理解するための<br />
          共通言語です。
        </p>
      </div>
    </footer>
  );
}
