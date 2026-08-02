'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { ScanFace, Eye, EyeOff, X, ChevronRight, ArrowRight, Sparkles, CircleCheck as CheckCircle2, RefreshCw, Calendar } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';

import TriangleTypeCard from '@/components/TriangleTypeCard';
import GoldenRatioPanel from '@/components/GoldenRatioPanel';
import StrengthsPanel from '@/components/StrengthsPanel';
import SaveKarteButton from './SaveKarteButton';
import BlueprintCanvas from '@/components/BlueprintCanvas';
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
import {
  analyzeFaceFromGuide,
} from '@/lib/analyzeFaceMock';
import { detectFaceLandmarks } from '@/lib/faceLandmarks';
import { buildKarteRecord, saveFaceKarteRecord, getBaselineRecord } from '@/lib/karteStorage';
import type { AnalysisResult } from '@/types/analysis';
import type { FaceKarteRecord } from '@/types/karte';
import type { DetectedGuide } from '@/lib/faceLandmarks';

type DetectionState = 'idle' | 'detecting' | 'done' | 'error';
type Gender = 'female' | 'male';

interface TabDiagnosisProps {
  gender: Gender;
  onBeginDesign: () => void;
  onDoneForToday: () => void;
}

// Face Identity — the user's permanent facial blueprint.
// If a baseline record exists, show the saved result immediately.
// Only show the camera/upload screen for first-time creation or explicit update.
export default function TabDiagnosis({ gender, onBeginDesign, onDoneForToday }: TabDiagnosisProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [baseline, setBaseline] = useState<FaceKarteRecord | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const check = () => setBaseline(getBaselineRecord());
    check();
    window.addEventListener('face-karte-updated', check);
    window.addEventListener('storage', check);
    return () => {
      window.removeEventListener('face-karte-updated', check);
      window.removeEventListener('storage', check);
    };
  }, []);

  // Avoid hydration mismatch — render nothing until mounted
  if (!isMounted) {
    return <div className="min-h-[500px]" aria-hidden="true" />;
  }

  // IF FACE IDENTITY ALREADY EXISTS → show saved result immediately
  if (baseline) {
    return (
      <FaceIdentitySaved
        baseline={baseline}
        gender={gender}
        onBeginDesign={onBeginDesign}
        onDoneForToday={onDoneForToday}
        onBaselineChange={setBaseline}
      />
    );
  }

  // IF NO FACE IDENTITY EXISTS → show creation screen
  return (
    <FaceIdentityCreate
      gender={gender}
      onBeginDesign={onBeginDesign}
      onDoneForToday={onDoneForToday}
    />
  );
}

// ─── Saved Face Identity view ─────────────────────────────────────────────────

function FaceIdentitySaved({
  baseline,
  gender,
  onBeginDesign,
  onDoneForToday,
  onBaselineChange,
}: {
  baseline: FaceKarteRecord;
  gender: Gender;
  onBeginDesign: () => void;
  onDoneForToday: () => void;
  onBaselineChange: (r: FaceKarteRecord | null) => void;
}) {
  const isMale = gender === 'male';
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [updateMode, setUpdateMode] = useState(false);
  const [showBlueprint, setShowBlueprint] = useState(true);

  const analysis = baseline.analysis;
  const createdDate = new Date(baseline.date);
  const updatedDate = new Date(baseline.date); // same as created unless versioned

  const formatDate = (d: Date) =>
    `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  // ── Update flow ──
  if (updateMode) {
    return (
      <FaceIdentityUpdate
        gender={gender}
        existingBaseline={baseline}
        onUpdateComplete={() => {
          onBaselineChange(getBaselineRecord());
          setUpdateMode(false);
        }}
        onCancel={() => setUpdateMode(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Identity header ── */}
      <div className="rounded-2xl border border-champagne/30 bg-gradient-to-r from-champagne/10 to-amber-50/30 px-6 py-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold to-champagne flex items-center justify-center flex-shrink-0 shadow-sm">
            <ScanFace className="w-6 h-6 text-white" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-xl font-bold tracking-tight text-stone-900"
              style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
            >
              Face Identity
            </h2>
            <p className="text-sm text-stone-500 mt-1">あなた専用の顔の設計図</p>

            {/* Metadata */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-stone-400" />
                <span className="text-[11px] text-stone-500">作成日：{formatDate(createdDate)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 text-stone-400" />
                <span className="text-[11px] text-stone-500">最終更新：{formatDate(updatedDate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Explanation */}
        <p
          className="mt-4 text-xs text-stone-500 leading-relaxed"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          Face Identityは、<br />
          Face Designerがあなたを理解し、<br />
          その日の目的に合った提案を行うための土台です。
        </p>
      </div>

      {/* ── Saved analysis results ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: saved face image / preview */}
        <div className="space-y-4 lg:sticky lg:top-[130px]">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">顔画像</p>
              <BlueprintToggle active={showBlueprint} onClick={() => setShowBlueprint(v => !v)} isMale={isMale} />
            </div>
            <div className="px-4 pb-5">
              <SavedFacePreview baseline={baseline} isMale={isMale} showBlueprint={showBlueprint} onUpdate={() => setShowUpdateConfirm(true)} />
            </div>
          </div>
        </div>

        {/* RIGHT: saved analysis panels */}
        <div className="space-y-4">
          <IdentityPanelHeader />

          <SectionLabel label="① あなたの強み" sub="構造的な設計資源" />
          <StrengthsPanel strengths={analysis.strengths} />

          <SectionLabel label="② 顔印象タイプ" />
          <TriangleTypeCard ta={analysis.triangleAnalysis} />

          <SectionLabel label="③ 黄金比参考値" sub="構造参考" />
          <GoldenRatioPanel gr={analysis.goldenRatio} />

          {/* Update action — secondary, not primary */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <button
              onClick={onBeginDesign}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-semibold shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
            >
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
              Face Designを始める
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowUpdateConfirm(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-stone-200 text-stone-500 text-sm font-semibold hover:border-stone-400 hover:text-stone-700 transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              Face Identityを更新する
            </button>
          </div>

          <button
            onClick={onDoneForToday}
            className="text-sm text-stone-400 hover:text-stone-600 underline underline-offset-4 decoration-stone-300 transition-colors duration-200 mt-1 mx-auto block"
          >
            今日はここまで
          </button>
        </div>
      </div>

      {/* ── Update confirmation dialog ── */}
      <AlertDialog open={showUpdateConfirm} onOpenChange={setShowUpdateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Face Identityを更新しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              新しい写真で顔の基礎構造を再測定します。<br />
              現在のFace Identityは、更新が完了するまで保持されます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => setUpdateMode(true)}>
              更新を始める
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Saved face blueprint (real image + structural overlay, or fallback) ──────

function SavedFacePreview({
  baseline,
  isMale,
  showBlueprint,
  onUpdate,
}: {
  baseline: FaceKarteRecord;
  isMale: boolean;
  showBlueprint: boolean;
  onUpdate: () => void;
}) {
  const hasImage = !!baseline.imageSrc && !!baseline.guide;

  // ── Case A: saved image + guide exist → render real blueprint ──
  if (hasImage) {
    const ta = baseline.analysis.triangleAnalysis;
    const gr = baseline.analysis.goldenRatio;
    return (
      <div className="space-y-3">
        <div className={`rounded-xl overflow-hidden border ${isMale ? 'bg-stone-100 border-stone-200' : 'bg-stone-50 border-stone-100'}`}>
          {showBlueprint ? (
            <BlueprintCanvas
              imageSrc={baseline.imageSrc!}
              guide={baseline.guide!}
              triangleAnalysis={ta}
            />
          ) : (
            <img src={baseline.imageSrc!} alt="顔画像" className="block rounded-xl" style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} />
          )}
        </div>
        {/* Small annotation stats below the image */}
        <div className="grid grid-cols-3 gap-2">
          <BlueprintStat label="黄金比" value={gr.faceRatio.measured.toFixed(2)} />
          <BlueprintStat label="目の位置" value={gr.eyePositionRatio.measured.toFixed(2)} />
          <BlueprintStat label="口の位置" value={gr.mouthPositionRatio.measured.toFixed(2)} />
        </div>
      </div>
    );
  }

  // ── Case B: legacy record without image → fallback ──
  const ta = baseline.analysis.triangleAnalysis;
  return (
    <div className="relative rounded-xl border border-champagne/25 bg-gradient-to-b from-stone-50/30 to-white p-8 flex flex-col items-center gap-5 min-h-[280px] overflow-hidden">
      {/* Blueprint grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #C4A26A 1px, transparent 1px),
            linear-gradient(to bottom, #C4A26A 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />
      {/* Corner marks */}
      <div className="absolute top-3 left-3 w-4 h-4 border-l border-t border-champagne/30" />
      <div className="absolute top-3 right-3 w-4 h-4 border-r border-t border-champagne/30" />
      <div className="absolute bottom-3 left-3 w-4 h-4 border-l border-b border-champagne/30" />
      <div className="absolute bottom-3 right-3 w-4 h-4 border-r border-b border-champagne/30" />

      <div className="relative z-10 mt-2">
        <div className="w-14 h-14 rounded-full border border-champagne/30 flex items-center justify-center bg-white/40">
          <ScanFace className="w-7 h-7 text-champagne" strokeWidth={1} />
        </div>
      </div>

      <div className="relative z-10 text-center space-y-1">
        <p className="text-sm font-medium text-stone-500">保存済みの顔画像がありません</p>
        <p className="text-[11px] text-stone-400">縦横比 {ta.ratio.toFixed(2)} · {ta.label}</p>
      </div>

      <button
        onClick={onUpdate}
        className="relative z-10 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-champagne/40 text-champagne text-xs font-semibold hover:bg-champagne/5 hover:border-champagne/60 transition-all duration-200"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Face Identityを更新する
      </button>
    </div>
  );
}

function BlueprintStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="relative bg-white/50 rounded-lg px-2 py-2.5 text-center border border-champagne/15">
      <p className="text-[9px] text-champagne/60 tracking-[0.1em] uppercase">{label}</p>
      <p className="text-sm font-semibold text-stone-600 mt-1" style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}>{value}</p>
    </div>
  );
}

// ─── Helper: convert blob URL to data URL for persistence ─────────────────────

async function blobUrlToDataURL(blobUrl: string): Promise<string> {
  if (!blobUrl.startsWith('blob:')) return blobUrl;
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Update flow (camera/upload → new analysis → save) ────────────────────────

function FaceIdentityUpdate({
  gender,
  existingBaseline,
  onUpdateComplete,
  onCancel,
}: {
  gender: Gender;
  existingBaseline: FaceKarteRecord;
  onUpdateComplete: () => void;
  onCancel: () => void;
}) {
  const isMale = gender === 'male';
  const [imageSrc, setImageSrc]             = useState<string | null>(null);
  const [guide, setGuide]                   = useState<DetectedGuide | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showBlueprint, setShowBlueprint]   = useState(true);
  const [saved, setSaved]                   = useState(false);

  const handleImageSelected = useCallback(async (url: string) => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(url); setGuide(null); setAnalysisResult(null); setSaved(false);
    setDetectionState('detecting');
    try {
      const detected = await detectFaceLandmarks(url);
      if (!detected) { setDetectionState('error'); return; }
      setGuide(detected);
      setAnalysisResult(analyzeFaceFromGuide(detected));
      setDetectionState('done');
    } catch { setDetectionState('error'); }
  }, [imageSrc]);

  const handleClear = useCallback(() => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(null); setGuide(null); setAnalysisResult(null);
    setSaved(false); setDetectionState('idle');
  }, [imageSrc]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!analysisResult || !guide || !imageSrc || isSaving) return;
    setIsSaving(true);
    try {
      const dataUrl = await blobUrlToDataURL(imageSrc);
      const record = buildKarteRecord('baseline', analysisResult, { imageSrc: dataUrl, guide });
      saveFaceKarteRecord(record);
      setSaved(true);
      setTimeout(() => onUpdateComplete(), 600);
    } catch {
      setIsSaving(false);
    }
  }, [analysisResult, guide, imageSrc, isSaving, onUpdateComplete]);

  const analysisReady  = detectionState === 'done' && !!analysisResult;
  const isDetecting    = detectionState === 'detecting';

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-stone-700">Face Identityを更新しました</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Update header */}
      <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 px-5 py-4 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Face Identityの更新</p>
          <p className="text-[11px] text-amber-600 mt-0.5">新しい写真で顔の基礎構造を再測定します</p>
        </div>
        <button
          onClick={onCancel}
          className="ml-auto text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2"
        >
          キャンセル
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT */}
        <div className="space-y-4 lg:sticky lg:top-[130px]">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">顔画像</p>
              {imageSrc && (
                <div className="flex items-center gap-2 flex-wrap">
                  {analysisReady && (
                    <BlueprintToggle active={showBlueprint} onClick={() => setShowBlueprint(v => !v)} isMale={isMale} />
                  )}
                  <button onClick={handleClear} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border border-stone-200 text-stone-400 hover:border-red-200 hover:text-red-400 bg-white transition-all duration-200">
                    <X className="w-3 h-3" />削除
                  </button>
                </div>
              )}
            </div>
            <div className="px-4 pb-5">
              {!imageSrc ? (
                <ImageUploader onImageSelected={handleImageSelected} />
              ) : (
                <div className={`flex justify-center items-center rounded-xl overflow-hidden border ${isMale ? 'bg-stone-100 border-stone-200' : 'bg-stone-50 border-stone-100'}`}>
                  {showBlueprint && guide ? (
                    <BlueprintCanvas imageSrc={imageSrc} guide={guide} triangleAnalysis={analysisResult?.triangleAnalysis ?? null} />
                  ) : (
                    <img src={imageSrc} alt="顔画像" className="block rounded-xl" style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-5 py-4">
            <p className="text-[11px] text-stone-400 leading-relaxed">
              評価ではなく、顔構造を知るためのカルテです。黄金比は美しさの点数ではなく、構造を理解するための参考値です。
            </p>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          {!imageSrc && (
            <EmptyState isMale={isMale} />
          )}
          {imageSrc && isDetecting && (
            <LoadingState isMale={isMale} />
          )}
          {detectionState === 'error' && (
            <ErrorState onClear={handleClear} />
          )}
          {analysisReady && (
            <>
              <IdentityPanelHeader />

              <SectionLabel label="① あなたの強み" sub="構造的な設計資源" />
              <StrengthsPanel strengths={analysisResult!.strengths} />

              <SectionLabel label="② 顔印象タイプ" />
              <TriangleTypeCard ta={analysisResult!.triangleAnalysis} />

              <SectionLabel label="③ 黄金比参考値" sub="構造参考" />
              <GoldenRatioPanel gr={analysisResult!.goldenRatio} />

              <div className="pt-2">
                <SaveKarteButton label="Face Identityを更新" onSave={handleSave} saved={saved} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── First-time creation flow ──────────────────────────────────────────────────

function FaceIdentityCreate({
  gender,
  onBeginDesign,
  onDoneForToday,
}: {
  gender: Gender;
  onBeginDesign: () => void;
  onDoneForToday: () => void;
}) {
  const isMale = gender === 'male';
  const [imageSrc, setImageSrc]             = useState<string | null>(null);
  const [guide, setGuide]                   = useState<DetectedGuide | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showBlueprint, setShowBlueprint]   = useState(true);
  const [saved, setSaved]                   = useState(false);

  const handleImageSelected = useCallback(async (url: string) => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(url); setGuide(null); setAnalysisResult(null); setSaved(false);
    setDetectionState('detecting');
    try {
      const detected = await detectFaceLandmarks(url);
      if (!detected) { setDetectionState('error'); return; }
      setGuide(detected);
      setAnalysisResult(analyzeFaceFromGuide(detected));
      setDetectionState('done');
    } catch { setDetectionState('error'); }
  }, [imageSrc]);

  const handleClear = useCallback(() => {
    if (imageSrc?.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    setImageSrc(null); setGuide(null); setAnalysisResult(null);
    setSaved(false); setDetectionState('idle');
  }, [imageSrc]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!analysisResult || !guide || !imageSrc || isSaving) return;
    setIsSaving(true);
    try {
      const dataUrl = await blobUrlToDataURL(imageSrc);
      const record = buildKarteRecord('baseline', analysisResult, { imageSrc: dataUrl, guide });
      saveFaceKarteRecord(record);
      setSaved(true);
    } catch {
      setIsSaving(false);
    }
  }, [analysisResult, guide, imageSrc, isSaving]);

  const analysisReady  = detectionState === 'done' && !!analysisResult;
  const isDetecting    = detectionState === 'detecting';

  // ── Face Identity completion screen ──
  if (saved) {
    return <FaceIdentityComplete isMale={isMale} onBeginDesign={onBeginDesign} onDoneForToday={onDoneForToday} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* LEFT */}
      <div className="space-y-4 lg:sticky lg:top-[130px]">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">顔画像</p>
            {imageSrc && (
              <div className="flex items-center gap-2 flex-wrap">
                {analysisReady && (
                  <BlueprintToggle active={showBlueprint} onClick={() => setShowBlueprint(v => !v)} isMale={isMale} />
                )}
                <button onClick={handleClear} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border border-stone-200 text-stone-400 hover:border-red-200 hover:text-red-400 bg-white transition-all duration-200">
                  <X className="w-3 h-3" />削除
                </button>
              </div>
            )}
          </div>
          <div className="px-4 pb-5">
            {!imageSrc ? (
              <ImageUploader onImageSelected={handleImageSelected} />
            ) : (
              <div className={`flex justify-center items-center rounded-xl overflow-hidden border ${isMale ? 'bg-stone-100 border-stone-200' : 'bg-stone-50 border-stone-100'}`}>
                {showBlueprint && guide ? (
                  <BlueprintCanvas imageSrc={imageSrc} guide={guide} triangleAnalysis={analysisResult?.triangleAnalysis ?? null} />
                ) : (
                  <img src={imageSrc} alt="顔画像" className="block rounded-xl" style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-5 py-4">
          <p className="text-[11px] text-stone-400 leading-relaxed">
            評価ではなく、顔構造を知るためのカルテです。黄金比は美しさの点数ではなく、構造を理解するための参考値です。
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div className="space-y-4">
        {!imageSrc && (
          <EmptyState isMale={isMale} />
        )}
        {imageSrc && isDetecting && (
          <LoadingState isMale={isMale} />
        )}
        {detectionState === 'error' && (
          <ErrorState onClear={handleClear} />
        )}
        {analysisReady && (
          <>
            <IdentityPanelHeader />

            <SectionLabel label="① あなたの強み" sub="構造的な設計資源" />
            <StrengthsPanel strengths={analysisResult!.strengths} />

            <SectionLabel label="② 顔印象タイプ" />
            <TriangleTypeCard ta={analysisResult!.triangleAnalysis} />

            <SectionLabel label="③ 黄金比参考値" sub="構造参考" />
            <GoldenRatioPanel gr={analysisResult!.goldenRatio} />

            <div className="pt-2">
              <SaveKarteButton label="Face Identity を保存" onSave={handleSave} saved={saved} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Face Identity completion screen ───────────────────────────────────────────

function FaceIdentityComplete({
  isMale,
  onBeginDesign,
  onDoneForToday,
}: {
  isMale: boolean;
  onBeginDesign: () => void;
  onDoneForToday: () => void;
}) {
  return (
    <div className="flex flex-col min-h-[calc(100vh-220px)]">
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 pt-8 pb-8">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-champagne/30 to-amber-50/40 border border-champagne/30 mb-8">
          <CheckCircle2 className="w-3 h-3 text-gold" />
          <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">Face Identity 完成</span>
        </div>

        {/* Headline */}
        <h2
          className="text-2xl sm:text-4xl font-bold tracking-tight text-stone-900 leading-[1.5]"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          あなた専用のFace Identityが完成しました。
        </h2>

        {/* Body */}
        <p
          className="mt-8 text-sm sm:text-base text-stone-500 leading-[2.2] tracking-wide max-w-lg"
          style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
        >
          このFace Identityは、<br />
          Face Designerがあなたを理解し、<br />
          目的に合った提案を行うための土台になります。<br />
          これからは、<br />
          このFace Identityを土台として、<br />
          その日の目的に合わせた<br />
          Face Designを提案していきます。
        </p>

        {/* Actions */}
        <div className="mt-12 flex flex-col items-center gap-3">
          <button
            onClick={onBeginDesign}
            className="group inline-flex items-center gap-3 px-8 sm:px-10 py-4 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-base sm:text-lg font-semibold shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" strokeWidth={1.8} />
            最初のFace Designを始める
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>

          <button
            onClick={onDoneForToday}
            className="text-sm text-stone-400 hover:text-stone-600 underline underline-offset-4 decoration-stone-300 transition-colors duration-200 mt-2"
          >
            今日はここまで
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function EmptyState({ isMale }: { isMale: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isMale ? 'bg-stone-100' : 'bg-champagne/20'}`}>
        <ScanFace className={`w-7 h-7 ${isMale ? 'text-stone-400' : 'text-champagne'}`} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-stone-500">
          正面顔の写真を撮影すると、<br />
          Face Identityの作成が始まります。
        </p>
      </div>
    </div>
  );
}

function LoadingState({ isMale }: { isMale: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center gap-4 min-h-[320px]">
      <div className={`w-10 h-10 border-2 border-t-transparent rounded-full animate-spin ${isMale ? 'border-stone-700' : 'border-gold'}`} />
      <p className="text-sm text-stone-400">顔構造を解析中…</p>
    </div>
  );
}

function ErrorState({ onClear }: { onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-200/60 p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[200px]">
      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
        <ScanFace className="w-5 h-5 text-amber-400" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-stone-600">顔を検出できませんでした</p>
      <p className="text-xs text-stone-400 leading-relaxed">正面を向いた明るい写真を使用してください。</p>
      <button onClick={onClear} className="text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600 transition-colors">別の写真を選ぶ</button>
    </div>
  );
}

function IdentityPanelHeader() {
  return (
    <div className="rounded-2xl border border-champagne/30 bg-gradient-to-r from-champagne/10 to-amber-50/30 px-5 py-4 flex items-center gap-4">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold to-champagne flex items-center justify-center flex-shrink-0 shadow-sm">
        <ScanFace className="w-4 h-4 text-white" strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ChevronRight className="w-3 h-3 text-stone-300" />
          <span className="text-[10px] tracking-wide text-stone-400">Face Designerがあなたを理解するための土台</span>
        </div>
        <p className="text-sm font-semibold mt-0.5 text-stone-700">Face Identity</p>
      </div>
    </div>
  );
}

function SectionLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 pt-1 px-1">
      <span className="text-[11px] font-semibold text-stone-500 tracking-wide">{label}</span>
      {sub && <span className="text-[10px] text-stone-300">{sub}</span>}
    </div>
  );
}

interface BlueprintToggleProps { active: boolean; onClick: () => void; isMale: boolean; }
function BlueprintToggle({ active, onClick, isMale }: BlueprintToggleProps) {
  const onCls  = isMale ? 'bg-stone-800 text-white border-stone-800' : 'bg-amber-500 text-white border-amber-500';
  const offCls = 'bg-white text-stone-400 border-stone-200 hover:border-stone-300';
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border transition-all duration-200 ${active ? onCls : offCls}`}
    >
      {active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      Blueprint
      <span className="ml-0.5 px-1.5 py-px rounded-full text-[8px] font-bold tracking-wide ${active ? 'bg-white/20' : 'bg-stone-100'}">
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
