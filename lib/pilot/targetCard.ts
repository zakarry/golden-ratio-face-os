// 目標カード（4. 修正案）
// 顔の設計図（DetectedGuide）から指標を計算し、理想値との差・許容幅・方向を出す。
// 指標の定義は analyzeFaceMock と同じ理想値に揃えている。

import type { DetectedGuide } from '@/lib/faceLandmarks';

export type MetricId =
  | 'eyeDist' | 'eyeWidth' | 'eyeAngle' | 'eyeLevel' | 'pupilPos'
  | 'faceRatio' | 'zone2' | 'zone3' | 'eyeY' | 'noseY' | 'lipY' | 'philtrum';

export interface MetricDef {
  id: MetricId;
  label: string;
  ideal: number;
  /** 許容幅（この範囲内は「範囲内・触らない」）。校正の結果で更新する前提の初期値 */
  tolerance: number;
  unit: '' | '°';
  /** 顔幅に対する割合として mm 換算できるか */
  mmBase?: 'faceWidth' | 'faceHeight';
  /** 額（生え際）の推定値に依存する指標か */
  dependsOnForehead?: boolean;
  /** 値が理想より小さいときの方向ラベル / 大きいときの方向ラベル */
  dirLow: string;
  dirHigh: string;
}

export const METRIC_DEFS: MetricDef[] = [
  { id: 'eyeDist',  label: '目間距離（顔幅比）',     ideal: 0.46,  tolerance: 0.015, unit: '', mmBase: 'faceWidth',  dirLow: '外へ', dirHigh: '内へ' },
  { id: 'eyeWidth', label: '目幅（顔幅比）',         ideal: 0.25,  tolerance: 0.015, unit: '', mmBase: 'faceWidth',  dirLow: '大きく', dirHigh: '小さく' },
  { id: 'eyeAngle', label: '目の角度',               ideal: 7.5,   tolerance: 3,     unit: '°',                       dirLow: '上げる', dirHigh: '下げる' },
  { id: 'eyeLevel', label: '目の高さ左右差（顔高比）', ideal: 0,   tolerance: 0.01,  unit: '', mmBase: 'faceHeight', dirLow: '揃える', dirHigh: '揃える' },
  { id: 'pupilPos', label: '黒目の位置（目頭0〜目尻1）', ideal: 0.5, tolerance: 0.05, unit: '',                     dirLow: '外へ', dirHigh: '内へ' },
  { id: 'faceRatio', label: '顔の縦横比',            ideal: 1.618, tolerance: 0.10,  unit: '',                        dirLow: '縦長に見せる', dirHigh: '横に広げる', dependsOnForehead: true },
  { id: 'zone2',    label: '縦三分割 中（眉〜鼻底）', ideal: 1/3,   tolerance: 0.03,  unit: '', mmBase: 'faceHeight', dirLow: '長く見せる', dirHigh: '短く見せる', dependsOnForehead: true },
  { id: 'zone3',    label: '縦三分割 下（鼻底〜顎）', ideal: 1/3,   tolerance: 0.03,  unit: '', mmBase: 'faceHeight', dirLow: '長く見せる', dirHigh: '短く見せる', dependsOnForehead: true },
  { id: 'eyeY',     label: '目の高さ',               ideal: 0.50,  tolerance: 0.02,  unit: '', mmBase: 'faceHeight', dirLow: '下げる', dirHigh: '上げる', dependsOnForehead: true },
  { id: 'noseY',    label: '鼻底の位置',             ideal: 0.66,  tolerance: 0.02,  unit: '', mmBase: 'faceHeight', dirLow: '下げる', dirHigh: '上げる', dependsOnForehead: true },
  { id: 'lipY',     label: '口の位置',               ideal: 0.75,  tolerance: 0.02,  unit: '', mmBase: 'faceHeight', dirLow: '下げる', dirHigh: '上げる', dependsOnForehead: true },
  { id: 'philtrum', label: '人中比（鼻〜口／鼻〜顎）', ideal: 1/3,  tolerance: 0.04,  unit: '',                        dirLow: '長く見せる', dirHigh: '短く見せる' },
];

export interface TargetItem {
  id: MetricId;
  label: string;
  current: number;
  ideal: number;
  /** ideal − current（符号つき） */
  gap: number;
  tolerance: number;
  unit: '' | '°';
  /** 修正対象か（許容幅の外） */
  actionable: boolean;
  /** 方向の言葉（外へ・内へ など）。範囲内なら '範囲内' */
  direction: string;
  /** mm換算（虹彩径から縮尺が取れた場合のみ） */
  gapMm: number | null;
  dependsOnForehead: boolean;
}

export interface TargetCard {
  items: TargetItem[];
  /** 修正対象の数 */
  actionableCount: number;
  /** 顔幅mm（虹彩径11.7mm換算）。取れなければ null */
  faceWidthMm: number | null;
  faceHeightMm: number | null;
  /** 校正で決めた許容幅を使っているか（今は初期値） */
  toleranceSource: 'default' | 'calibrated';
}

export interface PilotMetrics extends Record<MetricId, number> {}

const IRIS_MM = 11.7;

function deg(rad: number) { return rad * 180 / Math.PI; }

/** 画像の縦横比を考慮して指標を計算する（guide は 0–1 正規化なので w,h が必要） */
export function computePilotMetrics(g: DetectedGuide, imageW: number, imageH: number): PilotMetrics {
  const X = (v: number) => v * imageW;
  const Y = (v: number) => v * imageH;
  const W = X(g.faceRightX) - X(g.faceLeftX);
  const H = Y(g.chinLineY) - Y(g.foreheadY);
  const lW = X(g.leftEyeInnerX) - X(g.leftEyeOuterX);
  const rW = X(g.rightEyeOuterX) - X(g.rightEyeInnerX);
  const eyeY = (Y(g.leftEyeY) + Y(g.rightEyeY)) / 2;

  // 目の角度：目尻が目頭より上なら正（画像座標は下向きが正なので inner − outer）
  // 目尻・目頭の y は faceLandmarks の拡張フィールド。無い古い guide では理想値扱い
  let eyeAngle = 7.5;
  if (g.leftEyeOuterY != null && g.leftEyeInnerY != null && g.rightEyeInnerY != null && g.rightEyeOuterY != null) {
    const a1 = deg(Math.atan2(Y(g.leftEyeInnerY) - Y(g.leftEyeOuterY), lW));
    const a2 = deg(Math.atan2(Y(g.rightEyeInnerY) - Y(g.rightEyeOuterY), rW));
    eyeAngle = (a1 + a2) / 2;
  }

  const pupilPos = ((X(g.leftPupilX) - X(g.leftEyeInnerX)) / (X(g.leftEyeOuterX) - X(g.leftEyeInnerX))
                 + (X(g.rightPupilX) - X(g.rightEyeInnerX)) / (X(g.rightEyeOuterX) - X(g.rightEyeInnerX))) / 2;

  return {
    eyeDist:  (X(g.rightEyeX) - X(g.leftEyeX)) / W,
    eyeWidth: ((lW + rW) / 2) / W,
    eyeAngle,
    eyeLevel: Math.abs(Y(g.leftEyeY) - Y(g.rightEyeY)) / H,
    pupilPos,
    faceRatio: H / W,
    zone2: (Y(g.noseBaseLineY) - Y(g.eyebrowLineY)) / H,
    zone3: (Y(g.chinLineY) - Y(g.noseBaseLineY)) / H,
    eyeY:  (eyeY - Y(g.foreheadY)) / H,
    noseY: (Y(g.noseBaseLineY) - Y(g.foreheadY)) / H,
    lipY:  (Y(g.lipLineY) - Y(g.foreheadY)) / H,
    philtrum: (Y(g.lipLineY) - Y(g.noseBaseLineY)) / (Y(g.chinLineY) - Y(g.noseBaseLineY)),
  };
}

export function buildTargetCard(
  metrics: PilotMetrics,
  g: DetectedGuide,
  imageW: number,
  imageH: number,
  opts: { tolerances?: Partial<Record<MetricId, number>>; irisDiameterPx?: number | null; includeForeheadDependent?: boolean } = {},
): TargetCard {
  const W = (g.faceRightX - g.faceLeftX) * imageW;
  const H = (g.chinLineY - g.foreheadY) * imageH;
  const scale = opts.irisDiameterPx ? IRIS_MM / opts.irisDiameterPx : null; // mm per px
  const faceWidthMm  = scale ? W * scale : null;
  const faceHeightMm = scale ? H * scale : null;

  const items: TargetItem[] = METRIC_DEFS.map(def => {
    const current = metrics[def.id];
    const tolerance = opts.tolerances?.[def.id] ?? def.tolerance;
    const gap = def.ideal - current;
    // 額（生え際）は検出ではなく推定値なので、額に依存する指標は既定では「参考」扱い（修正対象にしない）
    const measurable = !def.dependsOnForehead || !!opts.includeForeheadDependent;
    const actionable = measurable && Math.abs(gap) > tolerance;
    let direction = measurable ? '範囲内' : '参考（額は推定）';
    if (actionable) direction = gap > 0 ? def.dirLow : def.dirHigh;
    let gapMm: number | null = null;
    if (scale && def.mmBase) gapMm = gap * (def.mmBase === 'faceWidth' ? W : H) * scale;
    return { id: def.id, label: def.label, current, ideal: def.ideal, gap, tolerance, unit: def.unit, actionable, direction, gapMm, dependsOnForehead: !!def.dependsOnForehead };
  });

  return {
    items,
    actionableCount: items.filter(i => i.actionable).length,
    faceWidthMm, faceHeightMm,
    toleranceSource: opts.tolerances ? 'calibrated' : 'default',
  };
}

export function formatMetric(v: number, unit: '' | '°') {
  return unit === '°' ? `${v.toFixed(1)}°` : v.toFixed(3);
}
