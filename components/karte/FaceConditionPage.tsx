'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ScanFace, TrendingUp, TrendingDown, Minus, X, Calendar, CircleAlert as AlertCircle, Activity, ChevronRight, ChartBar as BarChart3 } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';
import FaceCanvas, { type SimulationMode } from '@/components/FaceCanvas';
import StrengthsPanel from '@/components/StrengthsPanel';
import SaveKarteButton from './SaveKarteButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { analyzeFaceFromGuide, computeTargetGuide } from '@/lib/analyzeFaceMock';
import { detectFaceLandmarks } from '@/lib/faceLandmarks';
import { buildKarteRecord, saveFaceKarteRecord, getBaselineRecord, hasTodayRecord } from '@/lib/karteStorage';
import { computeMonthlyCondition } from '@/lib/monthlyComparison';
import type { AnalysisResult } from '@/types/analysis';
import type { MonthlyCondition, FaceKarteRecord, FaceYogaPlan } from '@/types/karte';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import TabMonthly from './TabMonthly';
import TabHistory from './TabHistory';
import FaceYogaPanel from '@/components/FaceYogaPanel';

type DetectionState = 'idle' | 'detecting' | 'done' | 'error';

export default function FaceConditionPage({ onNavigate }: { onNavigate?: (nav: string) => void }) {
  return (
    <Tabs defaultValue="daily" className="w-full">
      <TabsList className="mb-4 bg-stone-100/60 rounded-full p-1">
        <TabsTrigger value="daily" className="rounded-full px-5 py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-800 data-[state=active]:shadow-sm text-stone-500">
          ① 今日の顔
        </TabsTrigger>
        <TabsTrigger value="preparation" className="rounded-full px-5 py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-800 data-[state=active]:shadow-sm text-stone-500">
          ② 今日の準備
        </TabsTrigger>
        <TabsTrigger value="selfcare" className="rounded-full px-5 py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-stone-800 data-[state=active]:shadow-sm text-stone-500">
          ③ セルフケア
        </TabsTrigger>
      </TabsList>
      <TabsContent value="daily">
        <DailyConditionTab onNavigate={onNavigate} />
      </TabsContent>
      <TabsContent value="preparation">
        <PreparationTab />
      </TabsContent>
      <TabsContent value="selfcare">
        <SelfCareTab />
      </TabsContent>
    </Tabs>
  );
}

// ─── ① 今日の顔 ──────────────────────────────────────────────────────────────
// Purpose: 今日の顔を撮影し、Face Identityとの差分を確認する。

function DailyConditionTab({ onNavigate }: { onNavigate?: (nav: string) => void }) {
  const [imageSrc, setImageSrc]             = useState<string | null>(null);
  const [guide, setGuide]                   = useState<DetectedGuide | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [simulationMode]                    = useState<SimulationMode>('current');
  const [saved, setSaved]                   = useState(false);
  const [baseline, setBaseline]             = useState<FaceKarteRecord | null>(null);
  const [condition, setCondition]           = useState<MonthlyCondition | null>(null);
  const [alreadyToday, setAlreadyToday]     = useState(false);
  const [showChanges, setShowChanges]       = useState(false);

  useEffect(() => {
    setBaseline(getBaselineRecord());
    setAlreadyToday(hasTodayRecord('dailyCondition'));
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
    saveFaceKarteRecord(buildKarteRecord('dailyCondition', analysisResult));
    setSaved(true);
    setAlreadyToday(true);
  }, [analysisResult]);

  const targetGuide   = guide ? computeTargetGuide(guide) : null;
  const analysisReady = detectionState === 'done' && !!analysisResult;
  const isDetecting   = detectionState === 'detecting';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT */}
        <div className="space-y-4 lg:sticky lg:top-[130px]">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">今日の顔写真</p>
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
                  {baseline ? 'Face Identityあり — 今日の変化を確認します' : 'Face Identityが未登録です'}
                </p>
                {baseline && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">
                    基準日: {new Date(baseline.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                )}
                {!baseline && (
                  <p className="text-[10px] text-amber-600 mt-0.5">「顔の基礎構造」でFace Identityを作成すると比較が表示されます</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-5 py-4">
            <p className="text-[11px] text-stone-400 leading-relaxed">
              今日の顔を記録して、Face Identityとの差分を確認します。むくみ・左右差・表情の変化を毎日記録できます。
            </p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {alreadyToday && !imageSrc && (
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-2xl px-5 py-4 flex items-center gap-3">
              <Activity className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-emerald-700 font-medium">今日の顔は記録済みです。もう一度記録することもできます。</p>
            </div>
          )}

          {!imageSrc && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
              <div className="w-14 h-14 rounded-full bg-sky-50 flex items-center justify-center">
                <Activity className="w-7 h-7 text-sky-300" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-500">今日の顔写真をアップロードすると</p>
                <p className="text-xs text-stone-400 mt-1">Face Identityとの差分が表示されます</p>
              </div>
            </div>
          )}

          {imageSrc && isDetecting && (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center gap-4 min-h-[320px]">
              <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-stone-400">今日のコンディションを解析中…</p>
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
                  <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">今日の顔コンディション</p>
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
                <span className="text-[11px] font-semibold text-stone-500 tracking-wide">今日の強み</span>
                <span className="text-[10px] text-stone-300">現在の構造</span>
              </div>
              <StrengthsPanel strengths={analysisResult!.strengths} />

              <div className="pt-2">
                <SaveKarteButton label="今日のカルテを保存" onSave={handleSave} saved={saved} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Secondary action: 変化を見る ── */}
      <div className="pt-2">
        <button
          onClick={() => setShowChanges(true)}
          className="w-full flex items-center gap-3 rounded-2xl border border-stone-200/60 bg-white px-5 py-4 hover:border-stone-300 hover:bg-stone-50/50 transition-all duration-200"
        >
          <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-4 h-4 text-stone-500" strokeWidth={1.5} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-stone-700">変化を見る</p>
            <p className="text-[10px] text-stone-400 mt-0.5">今月の比較・履歴を確認できます</p>
          </div>
          <ChevronRight className="w-4 h-4 text-stone-400 flex-shrink-0" />
        </button>
      </div>

      {/* ── 変化を見る dialog ── */}
      <ChangesDialog
        open={showChanges}
        onOpenChange={setShowChanges}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ─── 変化を見る dialog (monthly + history) ─────────────────────────────────────

function ChangesDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onNavigate?: (nav: string) => void;
}) {
  const [subTab, setSubTab] = useState<'monthly' | 'history'>('monthly');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>変化を見る</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Sub-tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setSubTab('monthly')}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${subTab === 'monthly' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                >
                  今月
                </button>
                <button
                  onClick={() => setSubTab('history')}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${subTab === 'history' ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                >
                  履歴
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {subTab === 'monthly' && <TabMonthly />}
                {subTab === 'history' && <TabHistory onNavigate={(nav) => { onOpenChange(false); onNavigate?.(nav); }} />}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>閉じる</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── ② 今日の準備 ────────────────────────────────────────────────────────────
// Purpose: Face Designの前に、今日の顔を整える。
// Contains: 今日の顔コンディション + Today's Preparation (Face Yoga + self-care)

function PreparationTab() {
  const [faceYogaPlan, setFaceYogaPlan] = useState<FaceYogaPlan | null>(null);
  const baseline = getBaselineRecord();
  const analysis: AnalysisResult | null = baseline?.analysis ?? null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-champagne/30 to-amber-50/40 border border-champagne/30 mb-4">
          <Activity className="w-3 h-3 text-gold" />
          <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">Today's Preparation</span>
        </div>
        <h2
          className="text-2xl font-bold tracking-tight text-stone-900 leading-[1.5]"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          今日の準備
        </h2>
        <p className="mt-3 text-sm text-stone-500 leading-relaxed">
          Face Designの前に、今日の顔をやさしく整えます。<br />
          むくみ・目元・口元・顎・首・肩など、気になる部位をセルフケアで整えましょう。
        </p>
      </div>

      {/* Face Yoga — reused single implementation, Role 1: Today's Preparation */}
      <FaceYogaPanel
        analysis={analysis}
        plan={faceYogaPlan}
        onPlanChange={setFaceYogaPlan}
        isMale={false}
        showActions={false}
      />
    </div>
  );
}

// ─── ③ セルフケア ────────────────────────────────────────────────────────────
// Purpose: Face Designを行わない日でも、顔ヨガやセルフケアを自由に利用する。
// Contains: むくみ・目元・口元・顎・首・肩・フェイスライン

function SelfCareTab() {
  const [faceYogaPlan, setFaceYogaPlan] = useState<FaceYogaPlan | null>(null);
  const baseline = getBaselineRecord();
  const analysis: AnalysisResult | null = baseline?.analysis ?? null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-stone-50 border border-emerald-200/40 mb-4">
          <Activity className="w-3 h-3 text-emerald-500" />
          <span className="text-[10px] font-semibold tracking-[0.2em] text-emerald-600 uppercase">Self-care Library</span>
        </div>
        <h2
          className="text-2xl font-bold tracking-tight text-stone-900 leading-[1.5]"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          顔ヨガ・セルフケア
        </h2>
        <p className="mt-3 text-sm text-stone-500 leading-relaxed">
          今日の状態に合わせて、<br />
          顔の緊張やむくみをやさしく整えます。
        </p>
      </div>

      {/* Face Yoga — reused single implementation, Role 2: Self-care Library */}
      <FaceYogaPanel
        analysis={analysis}
        plan={faceYogaPlan}
        onPlanChange={setFaceYogaPlan}
        isMale={false}
        showActions={false}
      />
    </div>
  );
}

// ─── Shared components ───────────────────────────────────────────────────────

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
