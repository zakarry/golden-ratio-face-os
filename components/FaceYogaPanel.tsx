'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Activity, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Info, ChevronDown } from 'lucide-react';
import type { AnalysisResult } from '@/types/analysis';
import type { FaceYogaPlan, FaceYogaExercise } from '@/types/karte';
import { FACE_YOGA_CONDITIONS } from '@/types/karte';
import { generateFaceYogaPlan, FACE_YOGA_SAFETY_WARNING, FACE_YOGA_DISCLAIMER } from '@/lib/faceYoga';

interface FaceYogaPanelProps {
  analysis: AnalysisResult | null;
  plan: FaceYogaPlan | null;
  onPlanChange: (plan: FaceYogaPlan) => void;
  isMale: boolean;
  context?: { purpose?: string; scene?: string };
  onSkip?: () => void;
  onComplete?: () => void;
  showActions?: boolean;
}

export default function FaceYogaPanel({
  analysis, plan, onPlanChange, isMale, context, onSkip, onComplete, showActions = true,
}: FaceYogaPanelProps) {
  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    plan?.selectedConditions ?? [],
  );
  const [completed, setCompleted] = useState<boolean>(plan?.completed ?? false);
  const [userNote, setUserNote] = useState<string>(plan?.userNote ?? '');
  const [showPlan, setShowPlan] = useState<boolean>(plan !== null);

  const generatedPlan = useMemo(
    () => analysis
      ? generateFaceYogaPlan(analysis, selectedConditions, context)
      : null,
    [analysis, selectedConditions, context],
  );

  const handleToggleCondition = useCallback((cond: string) => {
    setSelectedConditions(prev =>
      prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond],
    );
  }, []);

  const handleGenerate = useCallback(() => {
    if (!generatedPlan) return;
    const newPlan: FaceYogaPlan = {
      selectedConditions,
      recommendedExercises: generatedPlan.recommendedExercises,
      completed: false,
    };
    onPlanChange(newPlan);
    setShowPlan(true);
  }, [selectedConditions, generatedPlan, onPlanChange]);

  const handleCompleteToggle = useCallback(() => {
    const next = !completed;
    setCompleted(next);
    if (plan) {
      onPlanChange({ ...plan, completed: next, userNote });
    }
    if (next && onComplete) onComplete();
  }, [completed, plan, userNote, onPlanChange, onComplete]);

  const handleNoteChange = useCallback((note: string) => {
    setUserNote(note);
    if (plan) {
      onPlanChange({ ...plan, userNote: note });
    }
  }, [plan, onPlanChange]);

  const handleSkip = useCallback(() => {
    if (onSkip) onSkip();
  }, [onSkip]);

  const accent = isMale ? 'stone' : 'amber';
  const accentText = isMale ? 'text-stone-700' : 'text-amber-700';
  const accentBg = isMale ? 'bg-stone-100' : 'bg-amber-50';
  const accentBorder = isMale ? 'border-stone-200' : 'border-amber-200/60';
  const accentIcon = isMale ? 'bg-stone-800 text-white' : 'bg-amber-500 text-white';
  const accentBtn = isMale ? 'bg-stone-800 text-white hover:bg-stone-700' : 'bg-amber-500 text-white hover:bg-amber-600';

  return (
    <div className="space-y-4">
      {/* ── Section header ── */}
      <div className={`rounded-2xl border ${accentBorder} ${accentBg} px-5 py-5`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${accentIcon}`}>
            <Activity className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${isMale ? 'text-stone-800' : 'text-amber-900'}`}>
              今日の顔ヨガ・セルフケア
            </p>
            <p className="text-[10px] text-stone-400 mt-0.5">メイクの前に、顔をやさしく整えます</p>
          </div>
        </div>
        <p className="text-[11px] text-stone-500 leading-relaxed">
          顔の構造を変えるためではなく、表情の使い方、左右差への気づき、むくみや緊張を整えるためのセルフケアです。
        </p>
      </div>

      {/* ── Daily condition input ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
        <div className="px-5 pt-5 pb-2">
          <p className="text-xs font-semibold text-stone-500 tracking-wide">今日の顔コンディション</p>
          <p className="text-[10px] text-stone-400 mt-0.5">任意 — 該当するものを選んでください</p>
        </div>
        <div className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {FACE_YOGA_CONDITIONS.map(cond => {
              const active = selectedConditions.includes(cond);
              return (
                <button
                  key={cond}
                  onClick={() => handleToggleCondition(cond)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-[11px] font-medium transition-all duration-200 text-left ${
                    active
                      ? isMale
                        ? 'bg-stone-800 border-stone-800 text-white'
                        : 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-white/20 border-white/40' : 'border-stone-300'
                  }`}>
                    {active && <CheckCircle2 className="w-3 h-3" />}
                  </span>
                  {cond}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleGenerate}
            disabled={!analysis}
            className={`mt-4 w-full py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-50 ${accentBtn}`}
          >
            セルフケアプランを生成
          </button>
        </div>
      </div>

      {/* ── Generated plan ── */}
      {showPlan && generatedPlan && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-semibold text-stone-500 tracking-wide">
              顔ヨガプラン（最大3種目）
            </span>
            <span className="text-[10px] text-stone-300">{generatedPlan.recommendedExercises.length}種目</span>
          </div>

          {generatedPlan.recommendedExercises.map((ex, i) => (
            <ExerciseCard key={ex.id} exercise={ex} index={i} isMale={isMale} />
          ))}

          {/* ── Safety warnings ── */}
          <div className="bg-red-50/50 border border-red-200/50 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-red-600 leading-relaxed">{FACE_YOGA_SAFETY_WARNING}</p>
            </div>
          </div>
          <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-4 py-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-stone-500 leading-relaxed">{FACE_YOGA_DISCLAIMER}</p>
            </div>
          </div>

          {/* ── Daily record ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <p className="text-xs font-semibold text-stone-500 tracking-wide">今日の記録</p>
            </div>
            <div className="px-5 pb-4 space-y-3">
              <button
                onClick={handleCompleteToggle}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border text-[11px] font-medium transition-all duration-200 ${
                  completed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  completed ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300'
                }`}>
                  {completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                </span>
                今日の顔ヨガを実施しました
              </button>
              <div>
                <p className="text-[10px] text-stone-400 mb-1.5">実施後の感覚</p>
                <textarea
                  value={userNote}
                  onChange={e => handleNoteChange(e.target.value)}
                  placeholder="実施後の感覚を自由にメモできます"
                  className="w-full text-[11px] text-stone-600 rounded-xl border border-stone-200 px-3 py-2.5 resize-none focus:outline-none focus:border-stone-400 min-h-[60px]"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Action buttons (used in daily journey) ── */}
      {showActions && (
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleCompleteToggle}
            disabled={completed}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-60 ${accentBtn}`}
          >
            <CheckCircle2 className="w-4 h-4" />
            顔ヨガを実施して次へ
          </button>
          <button
            onClick={handleSkip}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-all duration-200"
          >
            今日はスキップ
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({ exercise, index, isMale }: { exercise: FaceYogaExercise; index: number; isMale: boolean }) {
  const [open, setOpen] = useState(index === 0);
  const accentText = isMale ? 'text-stone-700' : 'text-amber-700';
  const accentBg = isMale ? 'bg-stone-100' : 'bg-amber-50';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left"
      >
        <span className={`w-7 h-7 rounded-full ${accentBg} flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${accentText}`}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-700">{exercise.title}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">
            対象：{exercise.targetArea} · {exercise.durationOrRepetitions}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-stone-100 px-5 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-stone-400 tracking-wide uppercase mb-1">目的</p>
            <p className="text-[11px] text-stone-600 leading-relaxed">{exercise.purpose}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-stone-400 tracking-wide uppercase mb-1">手順</p>
            <ol className="space-y-1.5">
              {exercise.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-stone-100 text-stone-500 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-stone-600 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-stone-400 tracking-wide uppercase mb-1">回数・時間</p>
            <p className="text-[11px] text-stone-600">{exercise.durationOrRepetitions}</p>
          </div>
          <div className="bg-amber-50/40 border border-amber-100/60 rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold text-amber-600 tracking-wide uppercase mb-0.5">注意点</p>
            <p className="text-[10px] text-stone-500 leading-relaxed">{exercise.caution}</p>
          </div>
        </div>
      )}
    </div>
  );
}
