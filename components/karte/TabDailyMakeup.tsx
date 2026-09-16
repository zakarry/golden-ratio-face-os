'use client';

import React, { useState, useCallback } from 'react';
import { ScanFace, X, Camera, CircleCheck as CheckCircle2, ChevronRight, ChevronDown, Layers, Sparkles, ArrowRight, Activity, Calendar } from 'lucide-react';
import FaceIdentityLink from '@/components/FaceIdentityLink';
import ImageUploader from '@/components/ImageUploader';
import FaceCanvas, { type SimulationMode } from '@/components/FaceCanvas';
import IllusionAdvicePanel from '@/components/IllusionAdvicePanel';
import MakeupAdvice from '@/components/MakeupAdvice';
import StrengthsPanel from '@/components/StrengthsPanel';
import FaceYogaPanel from '@/components/FaceYogaPanel';
import SaveKarteButton from './SaveKarteButton';
import { analyzeFaceFromGuide, generateMakeupAdvice, generateIllusionAdvice, computeTargetGuide } from '@/lib/analyzeFaceIdentity';
import { detectFaceLandmarks } from '@/lib/faceLandmarks';
import { buildKarteRecord, saveFaceKarteRecord, getBaselineRecord } from '@/lib/karteStorage';
import { computeBeforeAfterSummary, computeImpressionComparison, generateFaceDesignerComment } from '@/lib/monthlyComparison';
import { PURPOSES, SCENES, SCENE_TO_PURPOSES, PURPOSE_TO_MAKEUP, type PurposeId, type SceneId } from '@/lib/faceDesignChoices';
import { STYLE_CATEGORIES, IDEAL_STYLES, STYLE_TO_PURPOSE, getStylesByCategory, type StyleId, type StyleCategoryId } from '@/lib/idealStyleChoices';
import type { UserLevel } from '@/types/userLevel';
import type { AnalysisResult, ScoringModeId, ImpressionId } from '@/types/analysis';
import type { MakeupPurpose, BeforeAfter, ImpressionComparison, FaceDesignerComment, FaceYogaPlan, FaceDesignerProviderId } from '@/types/karte';
import { MAKEUP_PURPOSE_LABELS, FACE_DESIGNER_ENDING_MESSAGE, FACE_DESIGNER_PROVIDERS } from '@/types/karte';
import type { DetectedGuide } from '@/lib/faceLandmarks';

type DetectionState = 'idle' | 'detecting' | 'done' | 'error';
type Step = 'entry' | 'style' | 'purpose' | 'scene' | 'condition' | 'preparation' | 'scan' | 'design' | 'compare';
type EntryChoice = 'basic' | 'style' | 'scene';

const SCORING_FROM_PURPOSE: Record<MakeupPurpose, ScoringModeId> = {
  natural: 'natural', stage: 'stage', photo: 'photo',
  kirei: 'photo', kawaii: 'natural', cool: 'stage',
};
const IMPRESSION_FROM_PURPOSE: Record<MakeupPurpose, ImpressionId> = {
  natural: 'natural_imp', stage: 'natural_imp', photo: 'kirei',
  kirei: 'kirei', kawaii: 'kawaii', cool: 'kirei',
};

function recommendedEntryForLevel(level: UserLevel): EntryChoice {
  if (level === 'beginner') return 'basic';
  if (level === 'intermediate') return 'style';
  return 'scene';
}

function getStepsForEntry(entry: EntryChoice): Array<{ id: Step; label: string }> {
  const tail: Array<{ id: Step; label: string }> = [
    { id: 'condition',    label: '状態' },
    { id: 'preparation',  label: '準備' },
    { id: 'scan',         label: '撮影' },
    { id: 'design',       label: '設計' },
    { id: 'compare',      label: 'Before/After' },
  ];
  if (entry === 'basic') return tail;
  if (entry === 'style') return [{ id: 'style', label: 'なりたい顔' }, ...tail];
  return [{ id: 'scene', label: '予定' }, { id: 'purpose', label: '印象' }, ...tail];
}

function firstStepForEntry(entry: EntryChoice): Step {
  if (entry === 'basic') return 'condition';
  if (entry === 'style') return 'style';
  return 'scene';
}

export default function TabDailyMakeup({ level = 'advanced', onNavigate }: { level?: UserLevel; onNavigate?: (nav: string) => void }) {
  const [step, setStep]                     = useState<Step>('entry');
  const [entry, setEntry]                   = useState<EntryChoice | null>(null);
  const [styleId, setStyleId]               = useState<StyleId | null>(null);
  const [purposeId, setPurposeId]           = useState<PurposeId | null>(null);
  const [sceneId, setSceneId]               = useState<SceneId | null>(null);
  const [faceYogaPlan, setFaceYogaPlan]     = useState<FaceYogaPlan | null>(null);
  const [faceYogaSkipped, setFaceYogaSkipped] = useState(false);
  const [beforeSrc, setBeforeSrc]           = useState<string | null>(null);
  const [beforeGuide, setBeforeGuide]       = useState<DetectedGuide | null>(null);
  const [beforeResult, setBeforeResult]     = useState<AnalysisResult | null>(null);
  const [afterSrc, setAfterSrc]             = useState<string | null>(null);
  const [afterResult, setAfterResult]       = useState<AnalysisResult | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>('idle');
  const [afterDetState, setAfterDetState]   = useState<DetectionState>('idle');
  const [saved, setSaved]                   = useState(false);
  const [beforeAfter, setBeforeAfter]       = useState<BeforeAfter | null>(null);
  const [impression, setImpression]         = useState<ImpressionComparison | null>(null);
  const [designerComment, setDesignerComment] = useState<FaceDesignerComment | null>(null);
  const [providerId, setProviderId]           = useState<FaceDesignerProviderId>('standard_ai');

  const SELECTABLE_PROVIDERS: FaceDesignerProviderId[] = ['standard_ai', 'avance'];

  const baseline = getBaselineRecord();
  const purpose = purposeId ? PURPOSE_TO_MAKEUP[purposeId] : 'natural';
  const scoringMode = SCORING_FROM_PURPOSE[purpose];
  const impressionId = IMPRESSION_FROM_PURPOSE[purpose];
  const makeupAdvice = beforeResult ? generateMakeupAdvice(beforeResult, scoringMode, impressionId) : [];
  const illusionAdvice = beforeResult ? generateIllusionAdvice(beforeResult, scoringMode) : [];
  const targetGuide = beforeGuide ? computeTargetGuide(beforeGuide) : null;

  const handleBeforeSelected = useCallback(async (url: string) => {
    if (beforeSrc?.startsWith('blob:')) URL.revokeObjectURL(beforeSrc);
    setBeforeSrc(url); setBeforeGuide(null); setBeforeResult(null); setSaved(false);
    setDetectionState('detecting');
    try {
      const detected = await detectFaceLandmarks(url);
      if (!detected) { setDetectionState('error'); return; }
      setBeforeGuide(detected);
      setBeforeResult(analyzeFaceFromGuide(detected));
      setDetectionState('done');
      setStep('design');
    } catch { setDetectionState('error'); }
  }, [beforeSrc]);

  const handleAfterSelected = useCallback(async (url: string) => {
    if (afterSrc?.startsWith('blob:')) URL.revokeObjectURL(afterSrc);
    setAfterSrc(url); setAfterResult(null);
    setAfterDetState('detecting');
    try {
      const detected = await detectFaceLandmarks(url);
      if (!detected) { setAfterDetState('error'); return; }
      const result = analyzeFaceFromGuide(detected);
      setAfterResult(result);
      setAfterDetState('done');
      if (beforeResult) {
        const summary = computeBeforeAfterSummary(beforeResult, result);
        setBeforeAfter({ beforeAnalysis: beforeResult, afterAnalysis: result, changeSummary: summary });
        setImpression(computeImpressionComparison(beforeResult, result, purpose));
        setDesignerComment(generateFaceDesignerComment(beforeResult, result, purpose, providerId));
        setStep('compare');
      }
    } catch { setAfterDetState('error'); }
  }, [afterSrc, beforeResult, purpose, providerId]);

  const handleReset = useCallback(() => {
    if (beforeSrc?.startsWith('blob:')) URL.revokeObjectURL(beforeSrc);
    if (afterSrc?.startsWith('blob:')) URL.revokeObjectURL(afterSrc);
    setBeforeSrc(null); setBeforeGuide(null); setBeforeResult(null);
    setAfterSrc(null); setAfterResult(null);
    setSaved(false); setBeforeAfter(null); setImpression(null); setDesignerComment(null);
    setDetectionState('idle'); setAfterDetState('idle');
    setStep('scan');
  }, [beforeSrc, afterSrc]);

  const handleSave = useCallback(() => {
    if (!beforeResult) return;
    const record = buildKarteRecord('dailyMakeup', beforeResult, {
      beforeAfter: beforeAfter ?? undefined,
      faceYogaPlan: faceYogaPlan ?? undefined,
      faceYogaSkipped: faceYogaSkipped || undefined,
      purpose,
      scene: sceneId ?? undefined,
      level,
      styleId: styleId ?? undefined,
      providerId: providerId !== 'standard_ai' ? providerId : undefined,
    });
    saveFaceKarteRecord(record);
    setSaved(true);
  }, [beforeResult, beforeAfter, faceYogaPlan, faceYogaSkipped, purpose, sceneId, level, styleId, providerId]);

  return (
    <div className="space-y-6">
      {step === 'entry' ? (
        <EntryStep
          recommended={recommendedEntryForLevel(level)}
          onSelect={(choice) => { setEntry(choice); setStep(firstStepForEntry(choice)); }}
        />
      ) : (
        <StepProgress step={step} steps={getStepsForEntry(entry ?? 'scene')} />
      )}

      {step === 'style' && (
        <StyleStep
          selected={styleId}
          onSelect={(id) => {
            setStyleId(id);
            setPurposeId(STYLE_TO_PURPOSE[id]);
            setStep('condition');
          }}
        />
      )}

      {step === 'scene' && (
        <SceneStep
          selected={sceneId}
          onSelect={(id) => { setSceneId(id); setStep('purpose'); }}
        />
      )}

      {step === 'purpose' && (
        <PurposeStep
          selected={purposeId}
          sceneId={sceneId}
          onSelect={(id) => { setPurposeId(id); setStep('condition'); }}
          onBack={() => setStep('scene')}
        />
      )}

      {step === 'condition' && (
        <ConditionStep
          onContinue={() => setStep('preparation')}
          onBack={() => setStep(entry === 'scene' ? 'purpose' : entry === 'style' ? 'style' : 'entry')}
          backLabel={entry === 'scene' ? '← 印象を選び直す' : entry === 'style' ? '← 理想スタイルを選び直す' : '← 入口を選び直す'}
        />
      )}

      {step === 'preparation' && (
        <PreparationStep
          analysis={baseline?.analysis ?? null}
          faceYogaPlan={faceYogaPlan}
          onPlanChange={setFaceYogaPlan}
          onSkip={() => { setFaceYogaSkipped(true); setStep('scan'); }}
          onComplete={() => { setFaceYogaSkipped(false); setStep('scan'); }}
          context={{ purpose: purposeId ?? undefined, scene: sceneId ?? undefined }}
          onBack={() => setStep('condition')}
        />
      )}

      {step === 'scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">メイク前の顔</p>
                <p className="text-[11px] text-stone-400 mt-1">今日の顔コンディションを診断します</p>
              </div>
              <div className="px-4 pb-5">
                {detectionState === 'detecting' ? (
                  <div className="flex items-center justify-center min-h-[200px]">
                    <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <ImageUploader onImageSelected={handleBeforeSelected} />
                )}
              </div>
            </div>
            <div className="bg-stone-50 border border-stone-200/60 rounded-xl px-5 py-4">
              <p className="text-[11px] text-stone-400 leading-relaxed">
                毎日のメイク設計で、その日の顔コンディションに合わせた錯覚トリックメイクを提案します。
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[320px]">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
              <Camera className="w-7 h-7 text-amber-300" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-stone-500">メイク前の顔写真を撮影 / アップロード</p>
              <p className="text-xs text-stone-400 mt-1">今日の目的に合ったメイク設計が生成されます</p>
            </div>
          </div>
        </div>
      )}

      {step === 'design' && beforeResult && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-4 lg:sticky lg:top-[130px]">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">メイク前</p>
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                    {sceneId && `${SCENES.find(s => s.id === sceneId)?.label} · `}
                    {styleId && `${IDEAL_STYLES.find(s => s.id === styleId)?.label} · `}
                    {purposeId ? PURPOSES.find(p => p.id === purposeId)?.label : MAKEUP_PURPOSE_LABELS[purpose]}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEntry(null); setStep('entry'); }} className="text-[10px] text-stone-400 border border-stone-200 rounded-full px-2.5 py-1 hover:border-stone-400 transition-colors">入口を選び直す</button>
                  <button onClick={handleReset} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border border-stone-200 text-stone-400 hover:border-red-200 hover:text-red-400 bg-white transition-all">
                    <X className="w-3 h-3" />やり直す
                  </button>
                </div>
              </div>
              <div className="px-4 pb-5">
                <div className="flex justify-center items-center rounded-xl overflow-hidden bg-stone-50 border border-stone-100">
                  <FaceCanvas imageSrc={beforeSrc!} showGuides showGoldenRatio={entry !== 'basic'} showTriangle={entry !== 'basic'} guide={beforeGuide} targetGuide={targetGuide} triangleAnalysis={beforeResult.triangleAnalysis} detectionState={detectionState} simulationMode={'current' as SimulationMode} />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {baseline && (
              <FaceIdentityLink onClick={() => onNavigate?.('identity')} />
            )}

            <div className="flex items-center gap-2 rounded-xl border border-champagne/30 bg-champagne/5 px-4 py-2.5">
              <ScanFace className="w-3.5 h-3.5 text-gold flex-shrink-0" strokeWidth={1.5} />
              <p className="text-[11px] text-stone-500 leading-relaxed">
                この提案は、あなたのFace Identityをもとに設計されています。
              </p>
            </div>

            <div className="flex items-baseline gap-2 px-1">
              <span className="text-[11px] font-semibold text-stone-500 tracking-wide">今日の錯覚トリックメイク</span>
              <span className="text-[10px] text-stone-300">{MAKEUP_PURPOSE_LABELS[purpose]}</span>
            </div>
            <MakeupAdvice advice={makeupAdvice} maxItems={entry === 'basic' ? 3 : undefined} />

            <div className="flex items-baseline gap-2 px-1">
              <span className="text-[11px] font-semibold text-stone-500 tracking-wide">錯視テクニック</span>
            </div>
            <IllusionAdvicePanel sections={illusionAdvice} modeId={scoringMode} />

            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 px-5 py-4">
              <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase mb-2">Face Designer</p>
              <p className="text-[11px] text-stone-400 mb-3">誰の解釈でレビューを受けるか選べます。</p>
              <div className="flex flex-wrap gap-2">
                {SELECTABLE_PROVIDERS.map((id) => {
                  const active = providerId === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setProviderId(id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all duration-200 ${
                        active ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-stone-200 text-stone-500 hover:border-amber-200'
                      }`}
                    >
                      {FACE_DESIGNER_PROVIDERS[id].name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">メイク後を撮影</p>
                <p className="text-[11px] text-stone-400 mt-1">メイク後の写真でBefore / Afterを確認できます（任意）</p>
              </div>
              <div className="px-4 pb-5">
                {afterDetState === 'detecting' ? (
                  <div className="flex items-center justify-center min-h-[120px]">
                    <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <ImageUploader onImageSelected={handleAfterSelected} />
                )}
              </div>
            </div>

            <div className="pt-2">
              <SaveKarteButton label="今日のメイクカルテを保存" onSave={handleSave} saved={saved} />
            </div>
          </div>
        </div>
      )}

      {step === 'compare' && beforeResult && afterResult && beforeAfter && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
              <p className="px-4 pt-4 pb-2 text-[10px] font-semibold text-stone-400 tracking-widest uppercase">Before</p>
              <div className="px-3 pb-4">
                <div className="rounded-xl overflow-hidden bg-stone-50 border border-stone-100">
                  <FaceCanvas imageSrc={beforeSrc!} showGuides={false} showGoldenRatio={false} showTriangle={false} guide={beforeGuide} targetGuide={null} triangleAnalysis={null} detectionState={detectionState} simulationMode={'current' as SimulationMode} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-amber-200/40 overflow-hidden">
              <p className="px-4 pt-4 pb-2 text-[10px] font-semibold text-amber-500 tracking-widest uppercase">After</p>
              <div className="px-3 pb-4">
                <div className="rounded-xl overflow-hidden bg-amber-50/30 border border-amber-100">
                  <FaceCanvas imageSrc={afterSrc!} showGuides={false} showGoldenRatio={false} showTriangle={false} guide={null} targetGuide={null} triangleAnalysis={null} detectionState={afterDetState} simulationMode={'current' as SimulationMode} />
                </div>
              </div>
            </div>
          </div>

          {impression && (
            <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-gold/60 via-champagne/60 to-gold/60" />
              <div className="px-6 pt-5 pb-5">
                <div className="flex items-center gap-2 mb-3">
                  <ScanFace className="w-4 h-4 text-stone-500" strokeWidth={1.5} />
                  <p className="text-sm font-semibold text-stone-700 tracking-wide">Face Identity</p>
                  <span className="text-[11px] text-stone-400 tracking-wide">あなたらしさの確認</span>
                </div>
                <p className="text-[13px] font-semibold text-stone-700 mb-1.5">あなたらしさは保たれています。</p>
                <p className="text-[11px] text-stone-500 leading-[1.8] tracking-wide mb-4">
                  メイクによって顔の基礎構造は変わりません。<br />
                  今回も、あなたの顔を形づくる基本的な位置関係は安定しています。
                </p>
                <div className="space-y-1.5 mb-4">
                  <IdentityStatusItem label="黄金比参考値" status="安定" />
                  <IdentityStatusItem label="目・口・顔ランドマーク" status="安定" />
                  <IdentityStatusItem label="Face Identity" status="保持" />
                </div>
                <p className="text-[11px] text-stone-400 leading-[1.8] tracking-wide">
                  構造が安定しているからこそ、メイクによる&ldquo;見え方の変化&rdquo;を正しく確認できます。
                </p>
              </div>
            </div>
          )}

          <p className="text-center text-[10px] text-stone-400 tracking-wide leading-relaxed">
            変わらない自分を知り、<br />変えられる見え方を設計する。
          </p>

          {baseline && (
            <div className="flex justify-center">
              <FaceIdentityLink onClick={() => onNavigate?.('identity')} />
            </div>
          )}

          {designerComment && <FaceDesignerReviewCard comment={designerComment} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SaveKarteButton label="今日のメイクカルテを保存" onSave={handleSave} saved={saved} />
            <button onClick={handleReset} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-stone-200 text-stone-600 hover:border-stone-400 transition-colors">
              新しい診断を始める
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepProgress({ step, steps }: { step: Step; steps: Array<{ id: Step; label: string }> }) {
  const current = steps.findIndex(s => s.id === step);
  return (
    <div className="flex items-center gap-0 bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.id} className={`flex-1 flex items-center justify-center py-3 text-[10px] font-semibold transition-colors whitespace-nowrap ${active ? 'bg-amber-500 text-white' : done ? 'bg-stone-100 text-stone-500' : 'text-stone-300'}`}>
            {done && <CheckCircle2 className="w-3 h-3 mr-1 flex-shrink-0" />}
            {s.label}
            {i < steps.length - 1 && !active && <ChevronRight className="w-3 h-3 ml-1 opacity-30 flex-shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

function EntryStep({
  recommended, onSelect,
}: {
  recommended: EntryChoice;
  onSelect: (choice: EntryChoice) => void;
}) {
  const options: Array<{ id: EntryChoice; icon: React.ReactNode; title: string; desc: string }> = [
    { id: 'basic', icon: <Sparkles className="w-5 h-5" />, title: '基本から', desc: 'むずかしく考えなくて大丈夫。ひとつずつ、安心して選べます。' },
    { id: 'style', icon: <Layers className="w-5 h-5" />, title: 'なりたい顔から', desc: '理想のイメージに近づく提案をします。' },
    { id: 'scene', icon: <Calendar className="w-5 h-5" />, title: 'シーン・目的から', desc: '今日の場面や気分に合わせて選べます。' },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      <StepHeader
        badge="今日の入口"
        title="今日はどこから始めますか？"
        subtitle="いつでも好きな入口を選べます。"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
        {options.map(opt => {
          const isRecommended = opt.id === recommended;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className="relative text-left rounded-2xl px-5 py-5 bg-white border border-stone-200 hover:border-amber-300 hover:shadow-md transition-all duration-200"
            >
              {isRecommended && (
                <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold">
                  今日のおすすめ
                </span>
              )}
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 mb-3">
                {opt.icon}
              </div>
              <p className="text-sm font-semibold text-stone-700">{opt.title}</p>
              <p className="text-[11px] text-stone-400 mt-1.5 leading-relaxed">{opt.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StyleStep({
  selected, onSelect,
}: {
  selected: StyleId | null;
  onSelect: (id: StyleId) => void;
}) {
  const [category, setCategory] = useState<StyleCategoryId>(STYLE_CATEGORIES[0].id);
  const styles = getStylesByCategory(category);

  return (
    <div className="max-w-3xl mx-auto">
      <StepHeader
        badge="なりたい顔"
        title="理想スタイルを選ぶ"
        subtitle="今の顔と、理想スタイルとのギャップを埋める提案をします。"
        helper="一番近いイメージをお選びください。"
      />

      <div className="flex flex-wrap justify-center gap-2 mt-6">
        {STYLE_CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 ${
              category === c.id
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-white border-stone-200 text-stone-500 hover:border-amber-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
        {styles.map(s => {
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`text-left rounded-2xl px-4 py-4 transition-all duration-200 border ${active ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-200 hover:border-amber-200 hover:bg-amber-50/40'}`}
            >
              <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-stone-700'}`}>{s.label}</p>
              <p className={`text-[11px] mt-1 leading-relaxed ${active ? 'text-white/80' : 'text-stone-400'}`}>{s.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SceneStep({
  selected, onSelect,
}: {
  selected: SceneId | null;
  onSelect: (id: SceneId) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <StepHeader
        badge="Step 1 — Today's Scene"
        title="今日のメイクの目的（シーン）は？"
        subtitle="今日はどんな予定ですか？"
        helper="一番近いシーンをお選びください。"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
        {SCENES.map(s => {
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`rounded-2xl px-3 py-4 text-center transition-all duration-200 border ${active ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-200 hover:border-amber-200 hover:bg-amber-50/40'}`}
            >
              <p className={`text-xs font-semibold ${active ? 'text-white' : 'text-stone-700'}`}>{s.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PurposeStep({
  selected, sceneId, onSelect, onBack,
}: {
  selected: PurposeId | null;
  sceneId: SceneId | null;
  onSelect: (id: PurposeId) => void;
  onBack: () => void;
}) {
  const availablePurposeIds = sceneId ? SCENE_TO_PURPOSES[sceneId] : PURPOSES.map(p => p.id);
  const availablePurposes = availablePurposeIds
    .map(id => PURPOSES.find(p => p.id === id)!)
    .filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto">
      <StepHeader
        badge="Step 2 — Today's Impression"
        title="今日のメイクの印象は？"
        subtitle="今日はどんな印象を届けたいですか？"
        helper="その場で、どんな印象を届けたいですか？"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
        {availablePurposes.map(p => {
          const active = selected === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`rounded-2xl px-4 py-5 text-center transition-all duration-200 border ${active ? 'bg-amber-500 border-amber-500 shadow-md shadow-amber-500/20' : 'bg-white border-stone-200 hover:border-amber-200 hover:bg-amber-50/40'}`}
            >
              <p className={`text-sm font-semibold ${active ? 'text-white' : 'text-stone-700'}`}>{p.label}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-center">
        <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
          ← シーンを選び直す
        </button>
      </div>
    </div>
  );
}

function ConditionStep({ onContinue, onBack, backLabel = '← 前の画面に戻る' }: { onContinue: () => void; onBack: () => void; backLabel?: string }) {
  return (
    <div className="max-w-2xl mx-auto">
      <StepHeader
        badge="Step 3 — Today's Face Condition"
        title="今日の顔コンディション"
        subtitle="気になることがあれば、次の準備ステップに活かされます"
      />
      <div className="mt-8 bg-white rounded-2xl shadow-sm border border-stone-200/50 p-6">
        <p className="text-[11px] text-stone-400 leading-relaxed text-center">
          このステップは次の「今日の準備」で顔ヨガプランを生成する際に参照されます。<br />
          特に気になることがない場合は、そのまま次へ進んでください。
        </p>
      </div>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-all duration-200"
        >
          次へ
          <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600 transition-colors sm:ml-4">
          {backLabel}
        </button>
      </div>
    </div>
  );
}

function PreparationStep({
  analysis, faceYogaPlan, onPlanChange, onSkip, onComplete, context, onBack,
}: {
  analysis: AnalysisResult | null;
  faceYogaPlan: FaceYogaPlan | null;
  onPlanChange: (plan: FaceYogaPlan) => void;
  onSkip: () => void;
  onComplete: () => void;
  context?: { purpose?: string; scene?: string };
  onBack: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <StepHeader
        badge="Step 4 — Today's Preparation"
        title="今日の準備"
        subtitle="メイクの前に、今日の顔をやさしく整えます。"
      />
      <div className="mt-6">
        <FaceYogaPanel
          analysis={analysis}
          plan={faceYogaPlan}
          onPlanChange={onPlanChange}
          isMale={false}
          context={context}
          onSkip={onSkip}
          onComplete={onComplete}
          showActions={true}
        />
      </div>
      <div className="mt-6 flex justify-center">
        <button onClick={onBack} className="text-xs text-stone-400 hover:text-stone-600 transition-colors">
          ← 状態を選び直す
        </button>
      </div>
    </div>
  );
}

function StepHeader({ badge, title, subtitle, helper }: { badge: string; title: string; subtitle?: string; helper?: string }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-champagne/30 to-amber-50/40 border border-champagne/30 mb-6">
        <Sparkles className="w-3 h-3 text-gold" />
        <span className="text-[10px] font-semibold tracking-[0.2em] text-gold uppercase">{badge}</span>
      </div>
      <h2
        className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 leading-[1.5]"
        style={{ fontFamily: 'var(--font-noto-serif-jp), serif' }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-sm text-stone-500 leading-relaxed">{subtitle}</p>
      )}
      {helper && (
        <p className="mt-1.5 text-[11px] text-stone-400 leading-relaxed">{helper}</p>
      )}
    </div>
  );
}

function IdentityStatusItem({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-stone-50/40 border border-stone-100/60">
      <span className="text-[11px] font-medium text-stone-600 tracking-wide">{label}</span>
      <span className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" strokeWidth={1.5} />
        <span className="text-[11px] font-semibold text-stone-500 tracking-wide">{status}</span>
      </span>
    </div>
  );
}

function FaceDesignerReviewCard({ comment }: { comment: FaceDesignerComment }) {
  const [showOtherDesigners, setShowOtherDesigners] = useState(false);
  const provider = comment.provider;

  return (
    <div className="relative bg-white rounded-2xl shadow-md border border-champagne/40 overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-gold via-champagne to-gold" />

      <div className="px-6 pt-6 pb-5 border-b border-stone-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold to-champagne flex items-center justify-center shadow-sm flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-stone-400 tracking-widest uppercase">Face Designer</p>
            <p className="text-sm font-semibold text-stone-700 tracking-wide mt-0.5">{provider.name}</p>
            <p className="text-[10px] text-stone-400 tracking-wide mt-0.5">{provider.nameEn}</p>
          </div>
        </div>
        {provider.specialties.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {provider.specialties.map((s, i) => (
              <span key={i} className="text-[10px] font-medium text-stone-500 bg-stone-50 border border-stone-200 rounded-full px-2.5 py-1 tracking-wide">{s}</span>
            ))}
          </div>
        )}
      </div>

      {provider.philosophy && (
        <div className="px-6 py-5 border-b border-stone-100">
          <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-2">Design Philosophy</p>
          <div className="flex items-start gap-2">
            <div className="w-0.5 h-full bg-gradient-to-b from-gold/50 to-champagne/50 rounded-full flex-shrink-0 self-stretch" />
            <div className="pl-1">
              {provider.philosophy.split('\n').map((line, i) => (
                <p key={i} className="text-[12px] text-stone-500 leading-[1.85] tracking-wide italic">{line || '\u00A0'}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-6 pt-5 pb-5 space-y-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-px bg-gold/60" />
          <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase">Review</p>
        </div>
        {comment.sections.map((section, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-gold leading-none">{section.number}</span>
              <p className="text-xs font-semibold text-stone-700 tracking-wide">{section.title}</p>
            </div>
            <p className="text-[13px] text-stone-600 leading-[1.85] tracking-wide pl-6">{section.body}</p>
          </div>
        ))}
      </div>

      <div className="px-6 pb-5 space-y-2">
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/30 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-stone-300" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-stone-400">おすすめプロダクト</p>
            <p className="text-[10px] text-stone-300 mt-0.5">このフェイスデザイナーのおすすめ商品が近日公開されます</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/30 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-stone-300" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-stone-400">おすすめテクニック</p>
            <p className="text-[10px] text-stone-300 mt-0.5">このフェイスデザイナーのおすすめ技法が近日公開されます</p>
          </div>
        </div>
      </div>

      <div className="px-6 pb-5">
        <button
          onClick={() => setShowOtherDesigners(v => !v)}
          className="w-full flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/40 px-4 py-2.5 hover:bg-stone-50 transition-colors"
        >
          <span className="text-[11px] font-medium text-stone-400">別のFace Designerのレビューを見る</span>
          <ChevronDown className={`w-3.5 h-3.5 text-stone-300 flex-shrink-0 transition-transform duration-200 ${showOtherDesigners ? 'rotate-180' : ''}`} />
        </button>
        {showOtherDesigners && (
          <div className="mt-2 rounded-xl border border-dashed border-stone-200 bg-stone-50/30 px-4 py-3">
            <p className="text-[10px] text-stone-300 leading-relaxed">
              Miss World Official・AVANCE Official・SHISEIDO Official・POLA Official・Professional Face Designerのレビューが近日公開されます。
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pb-6 pt-2 border-t border-stone-100">
        <div className="text-center">
          {FACE_DESIGNER_ENDING_MESSAGE.split('\n').map((line, i) => (
            <p key={i} className="text-[11px] text-stone-400 leading-[2] tracking-wide">{line || '\u00A0'}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
