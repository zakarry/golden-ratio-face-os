'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnalysisResult, TriangleType, ScoreBreakdown, ScoringModeId } from '@/types/analysis';
import { SCORING_MODES } from '@/types/analysis';

// ─── Primitives ───────────────────────────────────────────────────────────────

function fmt(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1);
}

interface MiniBarProps { value: number; color?: string }
function MiniBar({ value, color = 'bg-amber-400' }: MiniBarProps) {
  return (
    <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
    </div>
  );
}

interface SubScoreRowProps { label: string; value: number; color?: string }
function SubScoreRow({ label, value, color }: SubScoreRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-stone-500">{label}</span>
        <span className="text-[11px] font-semibold text-stone-700 tabular-nums">{value}%</span>
      </div>
      <MiniBar value={value} color={color} />
    </div>
  );
}

interface MetricChipProps { label: string; value: string }
function MetricChip({ label, value }: MetricChipProps) {
  return (
    <div className="flex flex-col items-center bg-stone-50 border border-stone-100 rounded-lg px-3 py-2">
      <span className="text-[10px] text-stone-400 mb-0.5">{label}</span>
      <span className="text-xs font-semibold text-stone-700 font-mono">{value}</span>
    </div>
  );
}

// ─── Collapsible wrapper ──────────────────────────────────────────────────────

interface CollapseProps {
  label: string;
  children: React.ReactNode;
}
function Collapse({ label, children }: CollapseProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400 hover:text-stone-600 transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        {label}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Category card ────────────────────────────────────────────────────────────

interface CategoryCardProps {
  title: string;
  weighted: number;
  max: number;
  percentage: number;
  barColor: string;
  children: React.ReactNode;
}
function CategoryCard({ title, weighted, max, percentage, barColor, children }: CategoryCardProps) {
  const pct = (weighted / max) * 100;
  return (
    <div className="bg-white rounded-xl border border-stone-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-stone-600">{title}</span>
        <span className="text-xs font-semibold text-stone-700 tabular-nums">
          {fmt(weighted)}{' '}
          <span className="text-stone-400 font-normal">/ {max}</span>
          <span className="ml-1.5 text-[10px] text-stone-400 font-normal">（{percentage}%）</span>
        </span>
      </div>
      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden mb-0">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      {children}
    </div>
  );
}

// ─── Triangle accent colours ──────────────────────────────────────────────────

const TRIANGLE_ACCENT: Record<TriangleType, { bg: string; border: string; badge: string; dot: string }> = {
  balanced:   { bg: 'bg-emerald-50',  border: 'border-emerald-200/70', badge: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500' },
  vertical:   { bg: 'bg-sky-50',      border: 'border-sky-200/70',     badge: 'bg-sky-100 text-sky-700',          dot: 'bg-sky-500' },
  horizontal: { bg: 'bg-rose-50',     border: 'border-rose-200/70',    badge: 'bg-rose-100 text-rose-600',        dot: 'bg-rose-400' },
};

// ─── Scoring mode selector ────────────────────────────────────────────────────

const WEIGHT_LABELS = [
  { key: 'faceBalance'   as const, label: '顔バランス' },
  { key: 'eyePlacement'  as const, label: '目の配置'   },
  { key: 'noseMouthChin' as const, label: '鼻・口・顎' },
  { key: 'symmetry'      as const, label: '左右対称'   },
];

interface ModeSelectorProps {
  active: ScoringModeId;
  onChange: (id: ScoringModeId) => void;
  scoreByMode: Record<ScoringModeId, number>;
}
function ModeSelector({ active, onChange, scoreByMode }: ModeSelectorProps) {
  const [showRationale, setShowRationale] = useState(false);
  const activeMode = SCORING_MODES.find((m) => m.id === active)!;

  return (
    <div className="space-y-3">
      {/* Header hint */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase">評価モード</p>
        <p className="text-[10px] text-stone-400">用途に合わせて評価基準を切り替えられます</p>
      </div>

      {/* Mode cards */}
      <div className="flex flex-col gap-2">
        {SCORING_MODES.map((mode) => {
          const isActive = active === mode.id;
          const score = scoreByMode[mode.id];
          return (
            <button
              key={mode.id}
              onClick={() => onChange(mode.id)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-all duration-200 ${
                isActive
                  ? 'border-amber-400/70 bg-amber-50/60 shadow-sm ring-1 ring-amber-300/40'
                  : 'border-stone-150 bg-white hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-200 ${isActive ? 'bg-amber-400' : 'bg-stone-200'}`} />
                  <span className={`text-[12px] font-semibold ${isActive ? 'text-stone-900' : 'text-stone-500'}`}>
                    {mode.label}
                  </span>
                </div>
                <span className={`text-sm font-bold tabular-nums transition-colors duration-200 ${isActive ? 'text-amber-600' : 'text-stone-300'}`}>
                  {score}%
                </span>
              </div>
              <p className={`text-[11px] mt-1 ml-4.5 leading-snug transition-colors duration-200 ${isActive ? 'text-stone-500' : 'text-stone-400'}`}
                 style={{ paddingLeft: '1.625rem' }}>
                {mode.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Active mode weight chips */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {WEIGHT_LABELS.map(({ key, label }) => (
          <span key={key} className="text-[10px] text-stone-400 tabular-nums">
            {label}&thinsp;<span className="font-semibold text-amber-600">{Math.round(activeMode.weights[key] * 100)}%</span>
          </span>
        ))}
      </div>

      {/* Rationale toggle */}
      <div className="border-t border-stone-100 pt-2.5">
        <button
          onClick={() => setShowRationale((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-stone-400 hover:text-stone-600 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showRationale ? 'rotate-180' : ''}`} />
          配分の考え方
        </button>

        {showRationale && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-stone-400 leading-relaxed">
              各モードの配分は、美しさの優劣ではなく、宣材写真・ステージ・日常の見え方において、どの要素が印象に影響しやすいかを基準にしています。
            </p>

            <div className="space-y-2">
              {SCORING_MODES.map((mode) => (
                <div
                  key={mode.id}
                  className={`rounded-lg border px-3 py-2.5 transition-colors duration-200 ${
                    active === mode.id
                      ? 'border-amber-300/60 bg-amber-50/50'
                      : 'border-stone-100 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold ${active === mode.id ? 'text-stone-800' : 'text-stone-500'}`}>
                      {mode.label}
                    </span>
                    <span className="text-[10px] text-stone-400 tabular-nums">
                      {WEIGHT_LABELS.map(({ key, label }) =>
                        `${label} ${Math.round(mode.weights[key] * 100)}%`
                      ).join(' / ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-relaxed">{mode.detail}</p>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-stone-300 leading-relaxed italic">
              本ツールは印象設計・メイク最適化・宣材写真での見え方を目的とした参考指標です。医学的・科学的診断ではありません。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface AnalysisPanelProps {
  result: AnalysisResult;
  modeId: ScoringModeId;
  onModeChange: (id: ScoringModeId) => void;
}

function calcScore(bd: ScoreBreakdown, weights: { faceBalance: number; eyePlacement: number; noseMouthChin: number; symmetry: number }) {
  return Math.round(
    bd.faceBalance.percentage   * weights.faceBalance  +
    bd.eyePlacement.percentage  * weights.eyePlacement +
    bd.noseMouthChin.percentage * weights.noseMouthChin +
    bd.symmetry.percentage      * weights.symmetry
  );
}

export default function AnalysisPanel({ result, modeId, onModeChange }: AnalysisPanelProps) {
  const prevModeId = useRef<ScoringModeId>(modeId);
  const [delta, setDelta] = useState<number | null>(null);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { scoreBreakdown: bd, triangleAnalysis: ta } = result;
  const accent = TRIANGLE_ACCENT[ta.type];

  const scoreByMode = useMemo(
    () => Object.fromEntries(SCORING_MODES.map((m) => [m.id, calcScore(bd, m.weights)])) as Record<ScoringModeId, number>,
    [bd],
  );

  const modeOverall = scoreByMode[modeId];

  const handleModeChange = (id: ScoringModeId) => {
    if (id === modeId) return;
    const diff = scoreByMode[id] - scoreByMode[modeId];
    onModeChange(id);
    prevModeId.current = modeId;
    setDelta(diff);
    if (deltaTimer.current) clearTimeout(deltaTimer.current);
    deltaTimer.current = setTimeout(() => setDelta(null), 2200);
  };

  useEffect(() => () => { if (deltaTimer.current) clearTimeout(deltaTimer.current); }, []);

  const overallColor =
    modeOverall >= 85 ? 'text-emerald-600'
    : modeOverall >= 70 ? 'text-amber-600'
    : 'text-stone-600';

  return (
    <div className="space-y-5">

      {/* ── Overall Score ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 p-6">
        <ModeSelector active={modeId} onChange={handleModeChange} scoreByMode={scoreByMode} />

        <div className="mt-5 mb-1">
          <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-1">参考バランス</p>
          <div className="flex items-end gap-3 mb-5">
            <span className={`text-4xl font-bold tracking-tight tabular-nums transition-all duration-300 ${overallColor}`}>
              {modeOverall}
            </span>
            <span className="text-base text-stone-400 mb-1">%</span>
            {delta !== null && delta !== 0 && (
              <span
                className={`mb-2 text-sm font-semibold tabular-nums px-2 py-0.5 rounded-full transition-opacity duration-300 ${
                  delta > 0
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-rose-50 text-rose-500 border border-rose-200'
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <CategoryCard
            title="顔バランス" weighted={bd.faceBalance.weighted} max={30}
            percentage={bd.faceBalance.percentage} barColor="bg-amber-400"
          >
            <Collapse label="内訳を見る">
              <SubScoreRow label="縦三分割バランス" value={bd.faceBalance.subscores.verticalThirds} color="bg-amber-300" />
              <div className="grid grid-cols-2 gap-2 mt-1">
                <MetricChip
                  label="実測比率"
                  value={`${bd.faceBalance.measuredRatio[0]} : ${bd.faceBalance.measuredRatio[1]} : ${bd.faceBalance.measuredRatio[2]}`}
                />
                <MetricChip label="理想比率" value="1 : 1 : 1" />
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed italic">{bd.faceBalance.explanation}</p>
            </Collapse>
          </CategoryCard>

          <CategoryCard
            title="目の配置" weighted={bd.eyePlacement.weighted} max={30}
            percentage={bd.eyePlacement.percentage} barColor="bg-amber-500"
          >
            <Collapse label="内訳を見る">
              <div className="space-y-2">
                <SubScoreRow label="目の高さ"   value={bd.eyePlacement.subscores.eyeHeight}   color="bg-amber-400" />
                <SubScoreRow label="目間距離"   value={bd.eyePlacement.subscores.eyeDistance} color="bg-amber-400" />
                <SubScoreRow label="目の角度"   value={bd.eyePlacement.subscores.eyeAngle}    color="bg-amber-400" />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <MetricChip label="目間比率"  value={bd.eyePlacement.measured.eyeDistanceRatio.toFixed(2)} />
                <MetricChip label="目の角度"  value={`${bd.eyePlacement.measured.eyeAngle}°`} />
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed italic">{bd.eyePlacement.explanation}</p>
            </Collapse>
          </CategoryCard>

          <CategoryCard
            title="鼻・口・顎" weighted={bd.noseMouthChin.weighted} max={20}
            percentage={bd.noseMouthChin.percentage} barColor="bg-amber-600"
          >
            <Collapse label="内訳を見る">
              <SubScoreRow label="下顔面比率" value={bd.noseMouthChin.subscores.lowerFaceRatio} color="bg-amber-500" />
              <div className="grid grid-cols-2 gap-2 mt-1">
                <MetricChip
                  label="実測比率"
                  value={`1 : ${bd.noseMouthChin.measuredRatio[1].toFixed(2)}`}
                />
                <MetricChip label="理想比率" value="1 : 2" />
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed italic">{bd.noseMouthChin.explanation}</p>
            </Collapse>
          </CategoryCard>

          <CategoryCard
            title="左右対称" weighted={bd.symmetry.weighted} max={20}
            percentage={bd.symmetry.percentage} barColor="bg-amber-700"
          >
            <Collapse label="内訳を見る">
              <div className="space-y-2">
                <SubScoreRow label="目の高さ差"   value={bd.symmetry.subscores.eyeLevel}    color="bg-amber-600" />
                <SubScoreRow label="口角の高さ差" value={bd.symmetry.subscores.mouthCorner} color="bg-amber-600" />
                <SubScoreRow label="中心軸ズレ"   value={bd.symmetry.subscores.centerLine}  color="bg-amber-600" />
              </div>
              <p className="text-[11px] text-stone-400 leading-relaxed italic">{bd.symmetry.explanation}</p>
            </Collapse>
          </CategoryCard>
        </div>
      </div>

      {/* ── Triangle Analysis ─────────────────────────────────────────────── */}
      <div className={`rounded-2xl shadow-sm border ${accent.border} ${accent.bg} p-6`}>
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase mb-3">
          黒目・口元トライアングル分析
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${accent.badge}`}>
            {ta.label}
          </span>
          <span className="text-xs text-stone-400 font-mono">三角形比率：{ta.ratio.toFixed(2)}</span>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed mb-4">{ta.description}</p>
        {ta.makeupAdvice.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-2">メイク提案</p>
            <ul className="space-y-1.5">
              {ta.makeupAdvice.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-stone-600">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${accent.dot}`} />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ta.makeupAdvice.length === 0 && (
          <p className="text-xs text-stone-400 italic">バランスの取れた配置です。自然なメイクを心がけましょう。</p>
        )}
        <div className="mt-4 pt-4 border-t border-stone-200/60 grid grid-cols-3 gap-3">
          {[
            { label: '幅',  value: ta.width.toFixed(3) },
            { label: '高さ', value: ta.height.toFixed(3) },
            { label: '比率', value: ta.ratio.toFixed(3) },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-stone-400 mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-stone-700 font-mono">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Numerical Data ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 p-6">
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase mb-3">計測データ</p>
        <div>
          {[
            { label: '縦比率（上：中：下）', value: `${result.metrics.verticalRatio[0]} : ${result.metrics.verticalRatio[1]} : ${result.metrics.verticalRatio[2]}` },
            { label: '横比率（左：中：右）', value: `${result.metrics.horizontalRatio[0]} : ${result.metrics.horizontalRatio[1]} : ${result.metrics.horizontalRatio[2]}` },
            { label: '黄金比スコア',         value: `${result.metrics.goldenRatioScore}%` },
            { label: '目間距離比',           value: result.metrics.eyeDistanceRatio.toString() },
            { label: '目の角度',             value: `${result.metrics.eyeAngle}°` },
            { label: '左右対称性',           value: `${result.metrics.symmetryScore}%` },
            { label: '鼻下・唇・顎比率',     value: `${result.metrics.noseLipChinRatio[0]} : ${result.metrics.noseLipChinRatio[1]}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-stone-100 last:border-0">
              <span className="text-xs text-stone-500">{label}</span>
              <span className="text-xs font-semibold text-stone-800 font-mono tracking-wide">{value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
