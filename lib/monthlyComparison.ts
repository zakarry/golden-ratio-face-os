import type { AnalysisResult } from '@/types/analysis';
import type { MonthlyCondition, MonthlyDiff } from '@/types/karte';

// ─── Compute month-on-month diff ──────────────────────────────────────────────
//
// Compares current analysis against a baseline record.
// When no real baseline exists, falls back to a neutral mock.

export function computeMonthlyCondition(
  current: AnalysisResult,
  baseline: AnalysisResult | null,
): MonthlyCondition {
  const base = baseline ?? current; // no diff when no baseline

  const sym   = current.metrics.symmetryScore;
  const baseSym = base.metrics.symmetryScore;

  const vert    = current.scores.faceBalance;
  const baseVert = base.scores.faceBalance;

  const eyeDist = current.metrics.eyeDistanceRatio;
  const baseEyeDist = base.metrics.eyeDistanceRatio;

  const overall      = current.scores.overall;
  const baseOverall  = base.scores.overall;

  const symDelta    = sym    - baseSym;
  const vertDelta   = vert   - baseVert;
  const eyeDelta    = eyeDist - baseEyeDist;
  const overallDelta = overall - baseOverall;

  // Puffiness heuristic: if eye distance ratio increased and symmetry dropped
  const puffinessTrend: MonthlyCondition['puffinessTrend'] =
    eyeDelta > 0.015 && symDelta < -3 ? 'moderate' :
    eyeDelta > 0.008 || symDelta < -2 ? 'mild' :
    'none';

  const diffs: MonthlyDiff[] = [
    {
      label: '左右バランス',
      baseline: baseSym,
      current: sym,
      delta: symDelta,
      note: symDelta > 3  ? '先月より左右バランスが整っています'
          : symDelta < -3 ? '先月より左右差が若干増えています'
          :                  '先月と概ね同じ左右バランスです',
    },
    {
      label: '縦バランス',
      baseline: Math.round(baseVert * 10) / 10,
      current:  Math.round(vert * 10) / 10,
      delta:    Math.round(vertDelta * 10) / 10,
      note: vertDelta > 1  ? '縦のゾーンバランスがやや整ってきています'
          : vertDelta < -1 ? '縦バランスにわずかな変化が見られます'
          :                   '縦バランスは安定しています',
    },
    {
      label: '目間バランス',
      baseline: Math.round(baseEyeDist * 1000) / 1000,
      current:  Math.round(eyeDist * 1000) / 1000,
      delta:    Math.round(eyeDelta * 1000) / 1000,
      note: eyeDelta > 0.01  ? '目元がやや広がって見えています（むくみの可能性）'
          : eyeDelta < -0.01 ? '目間距離がやや引き締まっています'
          :                     '目間バランスは安定しています',
    },
    {
      label: '総合バランス',
      baseline: baseOverall,
      current:  overall,
      delta:    overallDelta,
      note: overallDelta > 3  ? '全体的なバランスが先月より整っています'
          : overallDelta < -3 ? '先月より若干の変化が見られます'
          :                      '先月と概ね同じバランスです',
    },
  ];

  const changedCount = diffs.filter(d => Math.abs(d.delta) > 2 || Math.abs(d.delta) > 0.008).length;
  const summary =
    !baseline
      ? '初回計測です。次回から変化の比較が表示されます。'
      : changedCount === 0
      ? '先月と比べて大きな変化は見られません。顔のコンディションは安定しています。'
      : changedCount === 1
      ? '一部に変化が見られますが、全体としては安定した状態です。'
      : '複数の計測値に変化が見られます。生活習慣・睡眠・むくみ等を参考に確認してみてください。';

  return {
    overallDelta,
    symmetryDelta: symDelta,
    verticalDelta:   Math.round(vertDelta * 10) / 10,
    eyeDistanceDelta: Math.round(eyeDelta * 1000) / 1000,
    puffinessTrend,
    diffs,
    summary,
  };
}

// ─── Before/after impression comparison ───────────────────────────────────────
//
// Compares the visual *impression* change between a Before (bare face) and
// After (makeup applied) photo.  This is intentionally qualitative — we map
// measurable analysis deltas to five-level descriptors without inventing
// numeric percentages.  Structural metrics (golden ratio, placement) are
// reported as unchanged because makeup does not alter bone structure.

import type {
  FaceDesignerComment,
  FaceDesignerProviderId,
  FaceDesignerReviewSection,
  ImpressionComparison,
  ImpressionItem,
  ImpressionLevel,
  MakeupPurpose,
  StructureComparison,
} from '@/types/karte';
import { FACE_DESIGNER_PROVIDERS, MAKEUP_PURPOSE_LABELS } from '@/types/karte';

const PURPOSE_IMPRESSION_LABEL: Partial<Record<MakeupPurpose, string>> = {
  kirei:   '綺麗',
  kawaii:  '可愛い',
  natural: 'ナチュラル',
  stage:   'ナチュラル',
  photo:   '綺麗',
  cool:    'クール',
};

function levelFromDelta(delta: number, strong = 2, slight = 0.5): ImpressionLevel {
  if (delta > strong) return 'much_stronger';
  if (delta > slight) return 'slightly_stronger';
  if (delta < -strong) return 'slightly_weaker';
  if (delta < -slight) return 'slightly_weaker';
  return 'about_same';
}

const LEVEL_LABEL: Record<ImpressionLevel, string> = {
  much_stronger:     'はい',
  slightly_stronger: 'ややそう',
  about_same:        'ほぼ同じ',
  slightly_weaker:  '穏やかへ',
};

export function computeImpressionComparison(
  before: AnalysisResult,
  after: AnalysisResult,
  purpose?: MakeupPurpose,
): ImpressionComparison {
  // ── Structure comparison (always unchanged) ──
  const structure: StructureComparison = {
    goldenRatio:   'ほぼ同じ',
    placement:      'ほぼ同じ',
    baseStructure: '変化なし',
    message:       'メイクによって顔の基礎構造は変わりません。',
  };

  // ── Impression items (derived from real analysis deltas) ──
  const eyeDelta      = after.scores.eye - before.scores.eye;
  const lowerDelta     = after.scores.lowerFace - before.scores.lowerFace;
  const overallDelta   = after.scores.overall - before.scores.overall;
  const symDelta       = after.metrics.symmetryScore - before.metrics.symmetryScore;
  const balanceDelta   = after.scores.faceBalance - before.scores.faceBalance;

  // 目元の存在感 — eye-area contrast emphasis
  const eyePresence: ImpressionItem = {
    label: '目元の存在感',
    level: levelFromDelta(eyeDelta, 2, 0.5),
    note:
      eyeDelta > 2  ? 'アイメイクによって黒目周辺のコントラストが自然に高まり、視線が集まりやすい印象になっています。'
    : eyeDelta > 0.5 ? '目元の輪郭が自然になじみ、視線の印象が穏やかに引き立っています。'
    : eyeDelta < -0.5 ? '目元の印象が穏やかに落ち着き、柔らかな視線を保っています。'
    :                   '目元の存在感は自然なまま保たれており、印象の変化はほぼありません。',
  };

  // 顔に立体感が生まれた？ — facial light and shadow / cheek brightness
  const solidity: ImpressionItem = {
    label: '顔に立体感が生まれた？',
    level: levelFromDelta(lowerDelta, 2, 0.5),
    note:
      lowerDelta > 2  ? '陰影のコントロールにより光と影の奥行きが生まれ、立体的な印象が自然に引き立っています。'
    : lowerDelta > 0.5 ? '光の入り方が穏やかに整い、顔の奥行きが自然に感じられる印象になっています。'
    : lowerDelta < -0.5 ? '陰影が穏やかに落ち着き、柔らかな平面的な印象へと変化しています。'
    :                   '光と影のバランスは自然に保たれており、穏やかな印象を保っています。',
  };

  // 視線が目元へ集まりやすくなった？ — overall visual emphasis / lip contrast
  const glamour: ImpressionItem = {
    label: '視線が目元へ集まりやすくなった？',
    level: levelFromDelta(overallDelta, 3, 1),
    note:
      overallDelta > 3  ? '色彩とコントラストが調和し、視線が自然に目元へ集まりやすい印象になっています。'
    : overallDelta > 1  ? '控えめな色彩の追加により、視線が穏やかに目元へ集まる印象になっています。'
    : overallDelta < -1 ? '色彩が落ち着き、視線が穏やかに分散する上品な印象へと変化しています。'
    :                    '視線の集まり方は自然に保たれており、穏やかな印象を保っています。',
  };

  // 優しい印象になった？ — perceived softness (inverse of sharpness)
  const softness: ImpressionItem = {
    label: '優しい印象になった？',
    level: levelFromDelta(-symDelta, 2, 0.5),
    note:
      symDelta < -2  ? 'ラインが自然になじみ、優しく親しみやすい印象へ近づいています。'
    : symDelta < -0.5 ? '輪郭の角が穏やかに丸みを持ち、優しい印象が自然に引き立っています。'
    : symDelta > 2   ? 'ラインが明確になり、引き締まった洗練された印象へと変化しています。'
    :                  '優しい印象は自然に保たれており、穏やかな雰囲気を保っています。',
  };

  // 洗練された印象になった？ — perceived sharpness
  const sharpness: ImpressionItem = {
    label: '洗練された印象になった？',
    level: levelFromDelta(symDelta, 2, 0.5),
    note:
      symDelta > 2  ? 'ラインが明確になり、洗練された印象が自然に引き立っています。'
    : symDelta > 0.5 ? '輪郭の角が穏やかに強調され、洗練された印象が自然に加わっています。'
    : symDelta < -2  ? '輪郭が自然になじみ、穏やかで柔らかな印象へ近づいています。'
    :                  '洗練さは自然に保たれており、穏やかな印象を保っています。',
  };

  // 希望印象への近さ — closeness to desired impression
  let desiredImpression: ImpressionComparison['desiredImpression'];
  if (purpose && PURPOSE_IMPRESSION_LABEL[purpose]) {
    const targetLabel = PURPOSE_IMPRESSION_LABEL[purpose]!;
    const closenessDelta =
      targetLabel === '可愛い'   ? softness.level === 'much_stronger' || softness.level === 'slightly_stronger' ? 2 : 0
    : targetLabel === '綺麗'     ? balanceDelta > 1 ? 2 : balanceDelta > 0 ? 1 : 0
    : targetLabel === 'クール'   ? sharpness.level === 'much_stronger' || sharpness.level === 'slightly_stronger' ? 2 : 0
    : targetLabel === 'ナチュラル' ? overallDelta >= -1 && overallDelta <= 2 ? 2 : overallDelta > 2 ? 1 : 0
    : 0;

    desiredImpression = {
      label: targetLabel,
      note:
        closenessDelta >= 2 ? `選択した「${targetLabel}」の方向性と調和し、選んだイメージに自然に近づいています。`
      : closenessDelta === 1 ? `「${targetLabel}」の要素が穏やかに取り入れられ、選んだイメージへ少しずつ近づいています。`
      :                         `「${targetLabel}」への変化はまだ控えめで、さらにデザインの余地が残されています。`,
    };
  }

  return {
    structure,
    items: [eyePresence, solidity, glamour, softness, sharpness, desiredImpression ? {
      label: '選択したイメージに近づいた？',
      level: desiredImpression.note.includes('近づいて') ? 'much_stronger'
           : desiredImpression.note.includes('やや') ? 'slightly_stronger'
           : desiredImpression.note.includes('控えめ') ? 'slightly_weaker'
           : 'about_same',
      note: desiredImpression.note,
    } : {
      label: '選択したイメージに近づいた？',
      level: 'about_same',
      note: '希望印象が選択されていないため、参考値です',
    }],
    desiredImpression,
    disclaimer: '画像条件の違いにより、参考結果です。',
  };
}

export { LEVEL_LABEL as IMPRESSION_LEVEL_LABEL };

// ─── Face Designer Comment (provider architecture) ──────────────────────────
//
// Generates a premium consultation comment referencing the selected
// impression, selected usage, Face Identity, and Face Condition — without
// mentioning internal calculations.  Structured as a provider so future
// providers (Miss World, Brand Official, Professional) can be swapped in
// without changing the call site.

const SCENE_LABEL: Record<MakeupPurpose, string> = {
  natural: '日常',
  stage:   'ステージ',
  photo:   '撮影・宣材',
  kirei:   '綺麗系',
  kawaii:  '可愛い系',
  cool:    'クール系',
};

export function generateFaceDesignerComment(
  before: AnalysisResult,
  after: AnalysisResult,
  purpose: MakeupPurpose,
  providerId: FaceDesignerProviderId = 'standard_ai',
): FaceDesignerComment {
  const provider = FACE_DESIGNER_PROVIDERS[providerId];
  const targetLabel = PURPOSE_IMPRESSION_LABEL[purpose] ?? 'ナチュラル';
  const sceneLabel = SCENE_LABEL[purpose] ?? '日常';

  const eyeDelta = after.scores.eye - before.scores.eye;
  const lowerDelta = after.scores.lowerFace - before.scores.lowerFace;
  const overallDelta = after.scores.overall - before.scores.overall;
  const symDelta = after.metrics.symmetryScore - before.metrics.symmetryScore;

  // ── ① 今回一番良かったポイント — strongest visual improvement ──
  const bestPoint =
    eyeDelta > 2  ? '目元へ自然に視線が集まりやすくなりました。'
  : eyeDelta > 0.5 ? '目元の印象が穏やかに整い、全体が引き立ちました。'
  : lowerDelta > 2  ? '光と影が調和し、顔に立体感が生まれました。'
  : lowerDelta > 0.5 ? '肌全体が明るく見える印象になっています。'
  : overallDelta > 1 ? '全体の印象がより整いました。'
  :                   '全体の印象が自然に調和しました。';

  // ── ② なぜその印象になったのか — WHY (professional face design language) ──
  const whyExplanation =
    eyeDelta > 2  ? 'アイメイクによって黒目周辺のコントラストが自然に整い、視線誘導が顔の中心へ集まることで、目元の存在感が引き立ちました。'
  : eyeDelta > 0.5 ? '目元の輪郭にコントラストが穏やかに加わり、視線誘導が自然に整ったことで、印象が引き立ちました。'
  : lowerDelta > 2  ? '陰影のコントロールによって光と影の奥行きが生まれ、立体感が自然に調和したことで、顔全体が引き立ちました。'
  : lowerDelta > 0.5 ? '光の入り方が穏やかに整い、肌の明るさと陰影が調和したことで、立体感が自然に感じられる印象になりました。'
  : overallDelta > 1 ? '色彩とコントラストが全体として調和し、視線誘導が自然に整ったことで、印象がまとまりました。'
  :                   'ラインと陰影が自然に調和し、全体の印象が穏やかに整いました。';

  // ── ③ 次回さらに良くするなら — ONE supportive suggestion ──
  const suggestion =
    symDelta > 2
      ? `${sceneLabel}では、頬骨上部へ少し光を加えると、さらに立体感が引き立つでしょう。`
    : symDelta < -2
      ? `${sceneLabel}では、輪郭に沿った陰影を少し添えると、より引き締まった印象が加わるでしょう。`
    : lowerDelta > 2
      ? `${sceneLabel}では、陰影の境界を穏やかにぼかすと、より自然な奥行きが生まれるでしょう。`
    : eyeDelta > 2
      ? `${sceneLabel}では、眉山を1〜2mm高めにすると、より洗練された印象になります。`
    : `${sceneLabel}では、頬骨上部へ少し光を加えると、さらに立体感が引き立つでしょう。`;

  const sections: FaceDesignerReviewSection[] = [
    { number: '①', title: '今回一番良かったポイント', body: bestPoint },
    { number: '②', title: 'なぜその印象になったのか', body: whyExplanation },
    { number: '③', title: '次回さらに良くするなら', body: suggestion },
  ];

  return {
    provider,
    sections,
    recommendations: { products: [], techniques: [] },
  };
}

// ─── Before/after change summary (legacy, used by BeforeAfter record) ─────────

export function computeBeforeAfterSummary(
  before: AnalysisResult,
  after: AnalysisResult,
): string[] {
  const summary: string[] = [];

  const symDelta = after.metrics.symmetryScore - before.metrics.symmetryScore;
  if (symDelta > 3)  summary.push(`左右バランスが${symDelta}pt改善されています`);
  if (symDelta < -3) summary.push(`左右差が若干変化しています（${Math.abs(symDelta)}pt）`);

  const eyeDelta = after.scores.eye - before.scores.eye;
  if (eyeDelta > 1) summary.push('目元の印象スコアが向上しています');

  const lowerDelta = after.scores.lowerFace - before.scores.lowerFace;
  if (lowerDelta > 1) summary.push('下顔面バランスが整って見えています');

  if (summary.length === 0) {
    summary.push('全体的なバランス数値は近似しています');
    summary.push('メイクによる表面的な印象変化は数値に反映されにくい場合があります');
  }

  return summary;
}
