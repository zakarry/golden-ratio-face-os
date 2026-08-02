'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ScanFace, TrendingUp, TrendingDown, Minus, X, Calendar, CircleAlert as AlertCircle } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';
import FaceCanvas, { type SimulationMode } from '@/components/FaceCanvas';
import StrengthsPanel from '@/components/StrengthsPanel';
import SaveKarteButton from './SaveKarteButton';
import { analyzeFaceFromGuide, computeTargetGuide } from '@/lib/analyzeFaceMock';
import { detectFaceLandmarks } from '@/lib/faceLandmarks';
import { buildKarteRecord, saveFaceKarteRecord, getBaselineRecord } from '@/lib/karteStorage';
import { computeMonthlyCondition } from '@/lib/monthlyComparison';
import type { AnalysisResult } from '@/types/analysis';
import type { MonthlyCondition, FaceKarteRecord } from '@/types/karte';
import type { DetectedGuide } from '@/lib/faceLandmarks';

type DetectionState = 'idle' | 'detecting' | 'done' | 'error';

export default function TabMonthly() {
  const [imageSrc, setImageSrc]             = useState<string | null>(null);
  const [guide, setGuide]                   = useState<DetectedGuide | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [simulationMode]                    = useState<SimulationMode>('current');
  const [saved, setSaved]                   = useState(false);
  const [baseline, setBaseline]             = useState<FaceKarteRecord | null>(null);
  const [condition, setCondition]           = useState<MonthlyCondition | null>(null);

  useEffect(() => {
    setBaseline(getBaselineRecord());
  }, []);

  const handleImageSelected = useCallback(async (url: string) => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(url); setGuide(null); setAnalysisResult(null); setSaved(false); setCondition(null);
    setDetectionState('detecting');
    try {
      const detected = await detectFaceLandmarks(url);
      if (!detected) { setDetectionState('error'); return; }
      setGuide(detected);
      const result = analyzeFaceFromGuide(detected);
      setAnalysisResult(result);
      setCondition(computeMonthlyCondition(result, baseline?.analysis ?? null));
      setDetectionState('done');
    } catch { setDetectionState('error'); }
  }, [imageSrc, baseline]);

  const handleClear = useCallback(() => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(null); setGuide(null); setAnalysisResult(null);
    setSaved(false); setCondition(null); setDetectionState('idle');
  }, [imageSrc]);

  const handleSave = useCallback(() => {
    if (!analysisResult) return;
    saveFaceKarteRecord(buildKarteRecord('monthly', analysisResult));
    setSaved(true);
  }, [analysisResult]);

  const targetGuide   = guide ? computeTargetGuide(guide) : null;
  const analysisReady = detectionState === 'done' && !!analysisResult;
  const isDetecting   = detectionState === 'detecting';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* LEFT */}
      <div className="space-y-4 lg:sticky lg:top-[130px]">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">今月の顔写真</p>
            {imageSrc && (
              <button onClick={handleClear} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border border-stone-200 text-stone-400 hover:border-red-200 hover:text-red-400 bg-white transition-all">
                <X className="w-3 h-3" />削除
              </button>
            )}
          </div>
          <div className="px-4 pb-5">
            {!imageSrc ? (
              <ImageUploader onImageSelected={handleImageSelected} />
            ) : (
              <div className="flex justify-center items-center rounded-xl overflow-hidden bg-stone-50 border border-stone-100">
                <FaceCanvas imageSrc={imageSrc} showGuides guide={null} targetGuide={targetGuide} triangleAnalysis={analysisResult?.triangleAnalysis ?? null} detectionState={detectionState} simulationMode={simulationMode} showGoldenRatio showTriangle />
              </div>
            )}
          </div>
        </div>

        {/* Baseline info */}
        <div className={`rounded-xl border px-5 py-4 ${baseline ? 'bg-emerald-50/40 border-emerald-100' : 'bg-amber-50/40 border-amber-100'}`}>
          <div className="flex items-start gap-2">
            {baseline ? (
              <Calendar className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className={`text-[11px] font-semibold ${baseline ? 'text-emerald-700' : 'text-amber-700'}`}>
                {baseline ? '初回カルテあり — 差分を比較します' : '初回カルテが未登録です'}
              </p>
              {baseline && (
                <p className="text-[10px] text-emerald-600 mt-0.5">
                  基準日: {new Date(baseline.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              {!baseline && (
                <p className="text-[10px] text-amber-600 mt-0.5">「初回診断」タブで初回カルテを保存すると比較が表示されます</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-5 py-4">
          <p className="text-[11px] text-stone-400 leading-relaxed">
            毎月の顔チェックで変化を記録できます。むくみ・左右差・目元の変化などを数値で確認できます。
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="space-y-4">
        {!imageSrc && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
            <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center">
              <Calendar className="w-7 h-7 text-sky-300" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">今月の顔写真をアップロードすると</p>
              <p className="text-xs text-stone-400 mt-1">初回カルテとの差分が表示されます</p>
            </div>
          </div>
        )}

        {imageSrc && isDetecting && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center gap-4 min-h-[320px]">
            <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-stone-400">今月のコンディションを解析中…</p>
          </div>
        )}

        {detectionState === 'error' && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200/60 p-8 text-center space-y-3">
            <p className="text-sm font-medium text-stone-600">顔を検出できませんでした</p>
            <button onClick={handleClear} className="text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600">別の写真を選ぶ</button>
          </div>
        )}

        {analysisReady && condition && (
          <>
            {/* Condition header */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-6">
              <div className="flex items-center gap-2 mb-3">
                <ScanFace className="w-4 h-4 text-sky-500" strokeWidth={1.5} />
                <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">今月の顔コンディション</p>
                <PuffinessBadge trend={condition.puffinessTrend} />
              </div>
              <p className="text-sm text-stone-700 font-medium leading-relaxed mb-4">{condition.summary}</p>

              {/* Diff rows */}
              <div className="space-y-2">
                {condition.diffs.map((diff, i) => (
                  <DiffRow key={i} diff={diff} />
                ))}
              </div>
            </div>

            {/* Strengths (current) */}
            <div className="flex items-baseline gap-2 pt-1 px-1">
              <span className="text-[11px] font-semibold text-stone-500 tracking-wide">今月の強み</span>
              <span className="text-[10px] text-stone-300">現在の構造</span>
            </div>
            <StrengthsPanel strengths={analysisResult!.strengths} />

            <div className="pt-2">
              <SaveKarteButton label="今月のカルテを保存" onSave={handleSave} saved={saved} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Diff row ─────────────────────────────────────────────────────────────────

import type { MonthlyDiff } from '@/types/karte';

function DiffRow({ diff }: { diff: MonthlyDiff }) {
  const isPos = diff.delta > 0.5 || diff.delta > 0.005;
  const isNeg = diff.delta < -0.5 || diff.delta < -0.005;
  return (
    <div className="flex items-start gap-3 bg-stone-50/60 rounded-xl border border-stone-100 px-4 py-3">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isPos ? 'bg-emerald-100' : isNeg ? 'bg-amber-100' : 'bg-stone-100'}`}>
        {isPos ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : isNeg ? <TrendingDown className="w-3 h-3 text-amber-600" /> : <Minus className="w-3 h-3 text-stone-400" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-700">{diff.label}</p>
        <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed">{diff.note}</p>
      </div>
    </div>
  );
}

function PuffinessBadge({ trend }: { trend: MonthlyCondition['puffinessTrend'] }) {
  if (trend === 'none') return null;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${trend === 'moderate' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-sky-50 border-sky-200 text-sky-700'}`}>
      {trend === 'moderate' ? 'むくみ傾向あり' : 'むくみ軽度'}
    </span>
  );
}
