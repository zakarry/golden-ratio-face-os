import type {
  AnalysisResult, MakeupAdvice, TriangleAnalysis, ScoreBreakdown,
  FaceDiagnosis, DiagnosisItem, DiagnosisLevel, ScoringModeId,
  GoldenRatioAnalysis, GoldenRatioItem,
  IllusionTip, IllusionAdviceSection,
  StyleFramework, ImpressionId, StyleExampleId,
  FaceStrength,
} from '@/types/analysis';
import type { DetectedGuide } from '@/lib/faceLandmarks';

// ─── Ideal ratios (relative to faceHeight) ───────────────────────────────────
const IDEAL_EYE_RATIO  = 0.50;  // eyeCenter at midpoint of face height
const IDEAL_NOSE_RATIO = 0.66;  // nose base at lower-third mark
const IDEAL_LIP_RATIO  = 0.75;  // lip center at 3/4 of face height

// ─── Target guide for before/after simulation ────────────────────────────────
// Shifts eyeLineY and lipLineY to the φ reference positions.
// All other fields are kept from the real detected guide so the face box,
// center line, eye circles, etc. stay anchored to the actual face.
export function computeTargetGuide(guide: DetectedGuide): DetectedGuide {
  const faceHeight = guide.chinLineY - guide.foreheadY;

  const targetEyeY  = guide.foreheadY + faceHeight * IDEAL_EYE_RATIO;
  const targetLipY  = guide.foreheadY + faceHeight * IDEAL_LIP_RATIO;
  const targetNoseY = guide.foreheadY + faceHeight * IDEAL_NOSE_RATIO;

  // Eye shift delta — applied to eye circles and eyebrow line together
  const eyeDelta  = targetEyeY  - guide.eyeLineY;
  const lipDelta  = targetLipY  - guide.lipLineY;
  const noseDelta = targetNoseY - guide.noseBaseLineY;

  return {
    ...guide,
    eyeLineY:     targetEyeY,
    eyebrowLineY: guide.eyebrowLineY + eyeDelta,
    leftEyeY:     guide.leftEyeY     + eyeDelta,
    rightEyeY:    guide.rightEyeY    + eyeDelta,
    leftPupilY:   guide.leftPupilY   + eyeDelta,
    rightPupilY:  guide.rightPupilY  + eyeDelta,
    noseBaseLineY: targetNoseY,
    lipLineY:      targetLipY,
    mouthCenterY:  guide.mouthCenterY + lipDelta,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function ratioScore(actual: number, ideal: number): number {
  const diff = Math.abs(actual - ideal);
  return clamp(Math.round(100 - diff * 200), 0, 100);
}

// ─── Triangle analysis ───────────────────────────────────────────────────────

function computeTriangleAnalysis(guide: DetectedGuide): TriangleAnalysis {
  const lp = { x: guide.leftPupilX,  y: guide.leftPupilY };
  const rp = { x: guide.rightPupilX, y: guide.rightPupilY };
  const mc = { x: guide.mouthCenterX, y: guide.mouthCenterY };

  // Euclidean width between pupils (normalised 0–1 space)
  const width = Math.sqrt((rp.x - lp.x) ** 2 + (rp.y - lp.y) ** 2);

  // Mid-point of the two pupils
  const pupilMidY = (lp.y + rp.y) / 2;
  const height = Math.abs(mc.y - pupilMidY);

  const ratio = width > 0 ? parseFloat((height / width).toFixed(3)) : 1.0;

  let type: TriangleAnalysis['type'];
  let label: string;
  let description: string;
  let makeupAdvice: string[];

  if (ratio >= 0.85 && ratio <= 1.15) {
    type = 'balanced';
    label = 'バランス型（理想）';
    description = '目元と口元の距離・幅のバランスが整っており、宣材写真やステージで安定した正統派の印象を作りやすいタイプです。どのメイクスタイルにもなじみやすく、汎用性の高い顔印象です。';
    makeupAdvice = [
      'ベースをナチュラルに整え、バランスの良さを活かす',
      'アイラインは目の形に沿ったシンプルなラインで印象を引き立てる',
      'リップはヌードからレッドまで幅広く対応できる',
      'チークは頬骨に沿ってふんわりと入れ、素肌感を演出する',
    ];
  } else if (ratio > 1.15) {
    type = 'vertical';
    label = '綺麗系';
    description = '目元と口元の縦の距離がやや長く、落ち着いた上品さ・大人っぽさが出やすい顔印象タイプです。ステージ映えや宣材写真で凛とした雰囲気になりやすい特徴があります。';
    makeupAdvice = [
      'チークをやや高め（頬骨の上）に入れ、顔の重心を上げて縦の距離感を緩和する',
      'リップの存在感を少し強め、目元と口元の距離をメイクで視覚的につなぐ',
      '面長感が気になる場合は横方向のチークを意識してふんわりと広げる',
      'アイブロウは平行気味に整えると親しみやすさが加わる',
    ];
  } else {
    type = 'horizontal';
    label = '可愛い系';
    description = '目元の幅に対して口元までの距離が短めで、親しみやすく可愛らしい印象が出やすい顔印象タイプです。目元の印象が強く、写真・ステージともにフレッシュな雰囲気になりやすいです。';
    makeupAdvice = [
      'アイラインは目尻に長く伸ばしすぎず、目の形を活かしたナチュラルラインに整える',
      'リップは丸みのある形を意識し、可愛らしさを活かしたカラーを選ぶ',
      'チークはふんわり丸く入れ、やわらかい印象を強調する',
      '落ち着いた印象を加えたい場合は眉と目元に少し直線感を足す',
    ];
  }

  return { width, height, ratio, type, label, description, makeupAdvice, leftPupil: lp, rightPupil: rp, mouthCenter: mc };
}

// ─── Feature diagnosis ────────────────────────────────────────────────────────

type DiagSpec = [DiagnosisLevel, string, string, DiagnosisItem['tone']];

function classify(
  metric: number,
  hiThreshold: number,
  loThreshold: number,
  hi: DiagSpec,
  lo: DiagSpec,
  standard: DiagSpec,
): DiagSpec {
  if (metric > hiThreshold) return hi;
  if (metric < loThreshold) return lo;
  return standard;
}

function diagItem(label: string, [value, display, note, tone]: DiagSpec): DiagnosisItem {
  return { label, value, display, note, tone };
}

function computeFaceDiagnosis(guide: DetectedGuide): FaceDiagnosis {
  const { foreheadY, chinLineY, eyeLineY, noseBaseLineY, lipLineY,
          leftEyeX, rightEyeX, leftEyeY, rightEyeY,
          leftEyeOuterX, leftEyeInnerX, rightEyeInnerX, rightEyeOuterX,
          faceLeftX, faceRightX } = guide;

  const faceHeight = chinLineY - foreheadY;
  const faceWidth  = faceRightX - faceLeftX;

  const zone1      = faceHeight > 0 ? (eyeLineY      - foreheadY)    / faceHeight : 1 / 3;
  const zone2      = faceHeight > 0 ? (noseBaseLineY - eyeLineY)      / faceHeight : 1 / 3;
  const philtrumF  = faceHeight > 0 ? (lipLineY  - noseBaseLineY)     / faceHeight : 0.11;
  const chinF      = faceHeight > 0 ? (chinLineY - lipLineY)           / faceHeight : 0.16;
  const lowerFaceF = philtrumF + chinF;
  const philFrac   = lowerFaceF > 0 ? philtrumF / lowerFaceF : 0.33;

  const eyeDistRatio = faceWidth > 0 ? (rightEyeX - leftEyeX) / faceWidth : 0.46;
  const eyeLevelDiff = faceHeight > 0 ? Math.abs(leftEyeY - rightEyeY) / faceHeight : 0;
  const faceRatio    = faceWidth > 0 ? faceHeight / faceWidth : 1.4;

  // Per-eye width = outer corner − inner corner; average both eyes for stability
  const leftEyeWidth  = Math.abs(leftEyeOuterX  - leftEyeInnerX);
  const rightEyeWidth = Math.abs(rightEyeOuterX - rightEyeInnerX);
  const eyeWidthRatio = faceWidth > 0 ? ((leftEyeWidth + rightEyeWidth) / 2) / faceWidth : 0.25;

  const IDEAL = 1 / 3;

  return {
    forehead:    diagItem('額',           classify(zone1,        IDEAL + 0.05, IDEAL - 0.05,
      ['wide',      '広め',    '額のスペースが広い傾向。前髪や眉の位置でバランスを調整できます。',           'info'],
      ['narrow',    '狭め',    '額が短め。前髪を上げると顔の縦バランスが整いやすくなります。',               'info'],
      ['standard',  '標準',    '顔の三分割に対して額のバランスが整っています。',                            'neutral'])),
    midFace:     diagItem('中顔面',       classify(zone2,        IDEAL + 0.05, IDEAL - 0.05,
      ['long',      '長め',    '中顔面が長い傾向。チークを高めに入れ、縦の重心を上げると印象が整います。',   'info'],
      ['short',     '短め',    '中顔面がコンパクト。目元のメイクで奥行きを加えるとバランスが取れます。',     'info'],
      ['standard',  '標準',    '中顔面のバランスが整っています。',                                          'neutral'])),
    philtrum:    diagItem('鼻下',         classify(philFrac,     0.40,         0.26,
      ['long',      '長め',    '鼻下がやや長い傾向。リップラインを上唇寄りに設定すると印象が引き締まります。', 'info'],
      ['short',     '短め',    '鼻下がコンパクト。上唇のボリュームを抑えるとバランスが整います。',            'info'],
      ['standard',  '標準',    '鼻下のバランスが整っています。',                                             'neutral'])),
    chin:        diagItem('顎',           classify(chinF,        0.20,         0.12,
      ['long',      '長め',    '顎が長い傾向。フェイスラインにシェーディングを入れると引き締まります。',      'info'],
      ['short',     '短め',    '顎が短め。コントゥアリングで輪郭を整えると印象が変わります。',               'info'],
      ['standard',  '標準',    '顎のバランスが整っています。',                                               'neutral'])),
    eyeDistance: diagItem('目間距離',     classify(eyeDistRatio, 0.50,         0.42,
      ['far',       '離れめ',  '目の間隔がやや広い傾向。眉頭を少し内側に描き、目元の距離感を調整できます。', 'info'],
      ['close',     '近め',    '目の間隔がやや狭い傾向。目尻のアイラインを伸ばし、横幅を強調するとバランスが整います。', 'info'],
      ['standard',  '標準',    '目間距離のバランスが整っています。',                                         'neutral'])),
    eyeLevel:    diagItem('目の高さ',     classify(eyeLevelDiff, 0.02,         -1,
      ['asymmetric','左右差あり','目の高さに左右差が見られます。眉の高さ・アイラインで補正すると印象が整います。', 'caution'],
      ['stable',    '安定',    '目の高さが左右でほぼ揃っています。',                                         'neutral'],
      ['stable',    '安定',    '目の高さが左右でほぼ揃っています。',                                         'neutral'])),
    eyeWidth:    diagItem('目幅',         classify(eyeWidthRatio, 0.28,        0.22,
      ['wide',      '広い',    '目の横幅があり、華やかで印象が強く出やすいタイプです。',                      'info'],
      ['narrow',    '狭い',    '繊細で柔らかい印象が出やすいタイプです。アイラインを横に伸ばすと目幅が広がります。', 'info'],
      ['standard',  '標準',    '目幅のバランスが整っています。',                                             'neutral'])),
    jawline:     diagItem('輪郭（エラ）', classify(faceRatio,   10,            1.3,
      ['normal',    '標準',    'フェイスラインのバランスが整っています。',                                   'neutral'],
      ['prominent', '張りあり','エラが張りやすい輪郭。フェイスラインにシェーディングを入れるとすっきり見えます。', 'info'],
      ['normal',    '標準',    'フェイスラインのバランスが整っています。',                                   'neutral'])),
  };
}

// ─── Golden ratio structural reference ───────────────────────────────────────

const PHI = 1.618;

function grItem(
  label: string,
  measured: number,
  reference: number,
  noteHi: string,
  noteLo: string,
  noteNeutral: string,
  threshold = 0.05,
): GoldenRatioItem {
  const deviation    = parseFloat((measured - reference).toFixed(3));
  const deviationPct = Math.round((deviation / reference) * 100);
  const absD         = Math.abs(deviation);
  const note         = absD < threshold * reference ? noteNeutral
                     : deviation > 0                ? noteHi
                     :                                noteLo;
  return { label, measured: parseFloat(measured.toFixed(3)), reference, deviation, deviationPct, note };
}

function computeGoldenRatio(guide: DetectedGuide): GoldenRatioAnalysis {
  const { foreheadY, chinLineY, faceLeftX, faceRightX,
          eyeLineY, mouthCenterY } = guide;

  const faceHeight = chinLineY  - foreheadY;
  const faceWidth  = faceRightX - faceLeftX;

  const faceRatioVal       = faceWidth  > 0 ? faceHeight / faceWidth  : PHI;
  const eyePositionVal     = faceHeight > 0 ? (eyeLineY     - foreheadY) / faceHeight : 0.50;
  const mouthPositionVal   = faceHeight > 0 ? (mouthCenterY - foreheadY) / faceHeight : 0.75;

  const faceRatio = grItem(
    '顔全体',
    faceRatioVal, PHI,
    '顔の縦長方向が強め（縦長型の構造）です。',
    '顔の横幅方向が強め（横広型の構造）です。',
    '顔の縦横比が黄金比の参考値に近い構造です。',
    0.08,
  );

  const eyePositionRatio = grItem(
    '目位置',
    eyePositionVal, 0.50,
    '目の位置がやや下寄りの傾向があります。',
    '目の位置がやや上寄りの傾向があります。',
    '目の位置が顔の中央付近にある安定した構造です。',
    0.04,
  );

  const mouthPositionRatio = grItem(
    '口位置',
    mouthPositionVal, 0.75,
    '口元がやや下寄りの傾向があります。',
    '口元がやや上寄りの傾向があります。',
    '口の位置が黄金比の参考値に近い構造です。',
    0.04,
  );

  // Summary: list which items are close vs. offset
  const items = [faceRatio, eyePositionRatio, mouthPositionRatio];
  const close  = items.filter((i) => Math.abs(i.deviation / i.reference) < 0.05).length;
  const summary =
    close === 3 ? '全体として参考値に近い安定した構造です。' :
    close === 2 ? '概ね安定した構造ですが、一部に傾向が見られます。' :
                  '顔の構造バランスを黄金比の参考値と比較しています。';

  return { faceRatio, eyePositionRatio, mouthPositionRatio, summary };
}

// ─── Strengths ────────────────────────────────────────────────────────────────
//
// Evaluates the same computed metrics and selects 2–3 genuine positives.
// Each strength states: what the feature is, what impression it creates,
// and how it can be used — without exaggeration or comparisons.

function computeStrengths(
  guide: DetectedGuide,
  symmetryPct: number,
  verticalThirdsPct: number,
  eyeDistPct: number,
  eyeWidthRatio: number,
  eyeDistanceRatio: number,
  faceRatioVal: number,   // faceHeight / faceWidth
  zone1: number,          // forehead fraction
  zone2: number,          // midface fraction
  chinF: number,          // chin fraction
): FaceStrength[] {
  const candidates: Array<{ score: number; strength: FaceStrength }> = [];

  // ── Symmetry ────────────────────────────────────────────────────────────────
  if (symmetryPct >= 85) {
    candidates.push({ score: symmetryPct, strength: {
      feature:    '顔の左右対称性が高い',
      impression: '整った印象が自然に伝わりやすい',
      usage:      '正面からの写真や撮影で安定した印象を見せやすい',
    }});
  } else if (symmetryPct >= 75) {
    candidates.push({ score: symmetryPct - 5, strength: {
      feature:    '顔の左右バランスが安定している',
      impression: '自然で落ち着いた印象を作りやすい',
      usage:      '左右差を意識しすぎずに印象設計に集中できる',
    }});
  }

  // ── Vertical thirds ─────────────────────────────────────────────────────────
  if (verticalThirdsPct >= 85) {
    candidates.push({ score: verticalThirdsPct, strength: {
      feature:    '顔の縦の三分割バランスが整っている',
      impression: '比率のまとまりが構造的な安定感につながりやすい',
      usage:      '特別な補正をしなくても縦バランスを活かした印象設計ができる',
    }});
  } else if (verticalThirdsPct >= 72) {
    candidates.push({ score: verticalThirdsPct - 5, strength: {
      feature:    '顔の縦バランスが参考値に近い',
      impression: '全体のまとまりが出やすい構造',
      usage:      '大きな補正なしで縦の流れを印象設計に活かせる',
    }});
  }

  // ── Eye width ───────────────────────────────────────────────────────────────
  if (eyeWidthRatio >= 0.27) {
    candidates.push({ score: eyeWidthRatio * 200, strength: {
      feature:    '目の横幅が広い',
      impression: '華やかで印象が強く出やすい目元',
      usage:      '目元を活かしたメイク設計で存在感のある印象を作りやすい',
    }});
  }

  // ── Eye distance (standard range: slightly wide reads as open/bright) ───────
  if (eyeDistanceRatio >= 0.44 && eyeDistanceRatio <= 0.50) {
    candidates.push({ score: eyeDistPct, strength: {
      feature:    '目の間隔が参考値に近い',
      impression: '目元の開放感と顔の横幅のバランスが取れている',
      usage:      '目間の調整をほとんど加えずに目元を印象の中心に置きやすい',
    }});
  }

  // ── Face ratio (close to golden ratio 1.618) ────────────────────────────────
  if (Math.abs(faceRatioVal - 1.618) < 0.12) {
    candidates.push({ score: 100 - Math.abs(faceRatioVal - 1.618) * 300, strength: {
      feature:    '顔全体の縦横比が参考値に近い',
      impression: '縦横のバランスが取れた印象が自然に出やすい',
      usage:      '輪郭補正に頼らずにシルエットを印象設計に活かせる',
    }});
  }

  // ── Well-proportioned forehead ───────────────────────────────────────────────
  if (zone1 >= 0.30 && zone1 <= 0.38) {
    candidates.push({ score: 80, strength: {
      feature:    '額のバランスが整っている',
      impression: '顔の上部の広さが開放的で清潔感のある印象を作りやすい',
      usage:      '前髪や眉の位置を工夫することで印象を柔軟に調整できる',
    }});
  }

  // ── Well-proportioned midface ────────────────────────────────────────────────
  if (zone2 >= 0.30 && zone2 <= 0.38) {
    candidates.push({ score: 80, strength: {
      feature:    '中顔面の縦バランスが整っている',
      impression: '目元から鼻にかけての比率が自然なまとまりを作りやすい',
      usage:      '目元のメイク設計で印象を調整しやすいベースがある',
    }});
  }

  // ── Compact chin (reads as refined in Japanese aesthetic context) ────────────
  if (chinF >= 0.13 && chinF <= 0.18) {
    candidates.push({ score: 78, strength: {
      feature:    '顎から顔下部のバランスが整っている',
      impression: '顔の下部がまとまった印象を作りやすい',
      usage:      'フェイスラインを活かした設計でシャープな印象を見せやすい',
    }});
  }

  // Sort by score descending, pick top 3 (minimum 2 guaranteed by fallback below)
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3).map(c => c.strength);

  // Fallback: ensure at least 2 strengths are always returned
  if (top.length < 2) {
    top.push({
      feature:    '顔の各パーツが独自の特徴を持っている',
      impression: '印象設計の出発点として活用できる個性がある',
      usage:      '強みとなる部位を活かしたメイク・グルーミング設計が可能',
    });
  }
  if (top.length < 2) {
    top.push({
      feature:    '顔のバランスが計測できている',
      impression: '数値を参考に印象設計の方向性が明確になる',
      usage:      '各パーツの特性を把握した設計に活用できる',
    });
  }

  return top;
}

// ─── Real analysis from MediaPipe guide ──────────────────────────────────────

export function analyzeFaceFromGuide(guide: DetectedGuide): AnalysisResult {
  const { foreheadY, chinLineY, eyeLineY, eyebrowLineY, noseBaseLineY, lipLineY,
          leftEyeX, rightEyeX, leftEyeY, rightEyeY, centerLineX,
          faceLeftX, faceRightX, mouthCenterX, mouthCenterY } = guide;

  const faceHeight = chinLineY - foreheadY;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const pct = (v: number) => Math.round(v);

  // ── Vertical zones ──────────────────────────────────────────────────────────
  const zone1 = eyeLineY      - foreheadY;      // forehead → eye
  const zone2 = noseBaseLineY - eyeLineY;        // eye → nose base
  const zone3 = chinLineY     - noseBaseLineY;   // nose base → chin
  const zoneSum = zone1 + zone2 + zone3;
  const vRatio: [number, number, number] = zoneSum > 0
    ? [
        parseFloat((zone1 / zoneSum * 3).toFixed(3)),
        parseFloat((zone2 / zoneSum * 3).toFixed(3)),
        parseFloat((zone3 / zoneSum * 3).toFixed(3)),
      ]
    : [1.0, 1.0, 1.0];

  // ── Face width ──────────────────────────────────────────────────────────────
  const faceWidth     = faceRightX - faceLeftX;
  const faceMidX      = faceLeftX + faceWidth / 2;
  const eyeDistance   = rightEyeX - leftEyeX;
  const eyeDistanceRatio = faceWidth > 0 ? eyeDistance / faceWidth : 0.46;

  // ── Vertical ratios (0–1, relative to faceHeight) ───────────────────────────
  const eyeRatio  = faceHeight > 0 ? (eyeLineY      - foreheadY) / faceHeight : IDEAL_EYE_RATIO;
  const noseRatio = faceHeight > 0 ? (noseBaseLineY - foreheadY) / faceHeight : IDEAL_NOSE_RATIO;
  const lipRatio  = faceHeight > 0 ? (lipLineY      - foreheadY) / faceHeight : IDEAL_LIP_RATIO;

  // ── Eye angle ───────────────────────────────────────────────────────────────
  const eyeDx = rightEyeX - leftEyeX;
  const eyeDy = rightEyeY - leftEyeY;
  const eyeAngleDeg = eyeDx > 0 ? Math.abs(Math.atan2(eyeDy, eyeDx) * (180 / Math.PI)) : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. FACE BALANCE sub-scores
  // ─────────────────────────────────────────────────────────────────────────────
  // How close each zone is to the ideal third (1.0 in normalised space)
  const idealThird = 1.0;
  const zone1Score = clamp(Math.round(100 - Math.abs(vRatio[0] - idealThird) * 200), 0, 100);
  const zone2Score = clamp(Math.round(100 - Math.abs(vRatio[1] - idealThird) * 200), 0, 100);
  const zone3Score = clamp(Math.round(100 - Math.abs(vRatio[2] - idealThird) * 200), 0, 100);
  const verticalThirdsPct = clamp(Math.round((zone1Score + zone2Score + zone3Score) / 3), 0, 100);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. EYE PLACEMENT sub-scores
  // ─────────────────────────────────────────────────────────────────────────────
  const eyeHeightPct   = ratioScore(eyeRatio, IDEAL_EYE_RATIO);
  // Ideal eye distance ratio ~0.46 of face width (1:1:1 rule)
  const eyeDistPct     = clamp(Math.round(100 - Math.abs(eyeDistanceRatio - 0.46) * 400), 0, 100);
  // Ideal angle 5–10 deg; penalise deviation
  const IDEAL_ANGLE    = 7.5;
  const eyeAnglePct    = clamp(Math.round(100 - Math.abs(eyeAngleDeg - IDEAL_ANGLE) * 6), 0, 100);
  const eyePct         = clamp(Math.round((eyeHeightPct + eyeDistPct + eyeAnglePct) / 3), 0, 100);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. NOSE / MOUTH / CHIN sub-scores
  // ─────────────────────────────────────────────────────────────────────────────
  const nosePct    = ratioScore(noseRatio, IDEAL_NOSE_RATIO);
  const lipPct     = ratioScore(lipRatio,  IDEAL_LIP_RATIO);
  // Ideal philtrum:chin ratio ≈ 1:2 measured as nose→lip : lip→chin
  const philtrumH  = faceHeight > 0 ? lipLineY      - noseBaseLineY : 0;
  const lipChinH   = faceHeight > 0 ? chinLineY      - lipLineY      : 0;
  const IDEAL_NL_RATIO = 1 / 3; // philtrum should be ~1/3 of lower-face
  const lowerH     = philtrumH + lipChinH;
  const actualNLR  = lowerH > 0 ? philtrumH / lowerH : IDEAL_NL_RATIO;
  const lowerFaceRatioPct = clamp(Math.round(100 - Math.abs(actualNLR - IDEAL_NL_RATIO) * 400), 0, 100);
  const lowerFacePct = clamp(Math.round((nosePct + lipPct + lowerFaceRatioPct) / 3), 0, 100);

  // Measured philtrum:lipChin as "1 : X"
  const nlRatio = philtrumH > 0 ? parseFloat((lipChinH / philtrumH).toFixed(2)) : 2.0;

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SYMMETRY sub-scores
  // ─────────────────────────────────────────────────────────────────────────────
  // Eye level: difference in Y between left and right eye, relative to faceHeight
  const eyeLevelDiff  = faceHeight > 0 ? Math.abs(leftEyeY - rightEyeY) / faceHeight : 0;
  const eyeLevelPct   = clamp(Math.round(100 - eyeLevelDiff * 600), 0, 100);
  // Mouth corner proxy: mouth center X vs face mid X
  const mouthOffsetX  = faceWidth > 0 ? Math.abs(mouthCenterX - faceMidX) / faceWidth : 0;
  const mouthCornerPct = clamp(Math.round(100 - mouthOffsetX * 400), 0, 100);
  // Center axis: how well the facial midline aligns with geometric center
  const centerOffset  = faceWidth > 0 ? Math.abs(centerLineX - faceMidX) / faceWidth : 0;
  const centerLinePct = clamp(Math.round(100 - centerOffset * 300), 0, 100);
  const symmetryPct   = clamp(Math.round((eyeLevelPct + mouthCornerPct + centerLinePct) / 3), 0, 100);

  // ─────────────────────────────────────────────────────────────────────────────
  // Weighted scores
  // ─────────────────────────────────────────────────────────────────────────────
  const faceBalanceScore = round1(clamp((verticalThirdsPct / 100) * 30, 0, 30));
  const eyeScore         = round1(clamp((eyePct         / 100) * 30, 0, 30));
  const lowerFaceScore   = round1(clamp((lowerFacePct   / 100) * 20, 0, 20));
  const symmetryScoreW   = round1(clamp((symmetryPct    / 100) * 20, 0, 20));
  const overall          = Math.round(faceBalanceScore + eyeScore + lowerFaceScore + symmetryScoreW);

  // ─────────────────────────────────────────────────────────────────────────────
  // Metrics (kept for makeup advice and display)
  // ─────────────────────────────────────────────────────────────────────────────
  const goldenDiff       = Math.abs(vRatio[0] - idealThird)
                         + Math.abs(vRatio[1] - idealThird)
                         + Math.abs(vRatio[2] - idealThird);
  const goldenRatioScore = clamp(Math.round(100 - goldenDiff * 40), 0, 100);

  // ─────────────────────────────────────────────────────────────────────────────
  // Score breakdown object
  // ─────────────────────────────────────────────────────────────────────────────
  const scoreBreakdown: ScoreBreakdown = {
    faceBalance: {
      percentage:    pct(verticalThirdsPct),
      weighted:      faceBalanceScore,
      max:           30,
      measuredRatio: vRatio,
      idealRatio:    [1.0, 1.0, 1.0],
      subscores:     { verticalThirds: pct(verticalThirdsPct) },
      explanation:   '額・中顔面・下顔面の縦バランスを見ています。',
    },
    eyePlacement: {
      percentage: pct(eyePct),
      weighted:   eyeScore,
      max:        30,
      subscores:  {
        eyeHeight:   pct(eyeHeightPct),
        eyeDistance: pct(eyeDistPct),
        eyeAngle:    pct(eyeAnglePct),
      },
      measured: {
        eyeDistanceRatio: parseFloat(eyeDistanceRatio.toFixed(3)),
        eyeAngle:         parseFloat(eyeAngleDeg.toFixed(2)),
      },
      explanation: '目の位置・距離・角度が宣材写真で安定して見えるかを見ています。',
    },
    noseMouthChin: {
      percentage:    pct(lowerFacePct),
      weighted:      lowerFaceScore,
      max:           20,
      measuredRatio: [1.0, nlRatio],
      idealRatio:    [1.0, 2.0],
      subscores:     { lowerFaceRatio: pct(lowerFaceRatioPct) },
      explanation:   '鼻下から唇、顎までの下顔面バランスを見ています。',
    },
    symmetry: {
      percentage: pct(symmetryPct),
      weighted:   symmetryScoreW,
      max:        20,
      subscores:  {
        eyeLevel:    pct(eyeLevelPct),
        mouthCorner: pct(mouthCornerPct),
        centerLine:  pct(centerLinePct),
      },
      explanation: '目・口・鼻・顎が中心軸に対してどれだけ整っているかを見ています。',
    },
  };

  return {
    metrics: {
      verticalRatio: vRatio,
      horizontalRatio: [1.0, parseFloat(eyeDistanceRatio.toFixed(3)), 1.0],
      goldenRatioScore,
      eyeDistanceRatio: parseFloat(eyeDistanceRatio.toFixed(3)),
      eyeAngle:         parseFloat(eyeAngleDeg.toFixed(2)),
      symmetryScore:    pct(symmetryPct),
      noseLipChinRatio: [
        parseFloat(noseRatio.toFixed(3)),
        parseFloat(lipRatio.toFixed(3)),
      ],
    },
    scores: {
      overall,
      faceBalance: faceBalanceScore,
      eye:         eyeScore,
      lowerFace:   lowerFaceScore,
      symmetry:    symmetryScoreW,
    },
    scoreBreakdown,
    triangleAnalysis: computeTriangleAnalysis(guide),
    goldenRatio: computeGoldenRatio(guide),
    diagnosis: computeFaceDiagnosis(guide),
    strengths: computeStrengths(
      guide,
      symmetryPct,
      verticalThirdsPct,
      eyeDistPct,
      // eyeWidthRatio — recompute from guide fields directly
      (() => {
        const { leftEyeOuterX, leftEyeInnerX, rightEyeInnerX, rightEyeOuterX, faceLeftX, faceRightX } = guide;
        const lw = Math.abs(leftEyeOuterX - leftEyeInnerX);
        const rw = Math.abs(rightEyeOuterX - rightEyeInnerX);
        const fw = faceRightX - faceLeftX;
        return fw > 0 ? ((lw + rw) / 2) / fw : 0.25;
      })(),
      eyeDistanceRatio,
      faceWidth > 0 ? (chinLineY - foreheadY) / faceWidth : 1.618,
      // zone fractions as share of faceHeight (not as share of zone sum)
      faceHeight > 0 ? zone1 / faceHeight : 1/3,
      faceHeight > 0 ? zone2 / faceHeight : 1/3,
      faceHeight > 0 ? (chinLineY - lipLineY) / faceHeight : 0.16,
    ),
  };
}

// ─── Makeup advice (triangle type + diagnosis + mode aware) ─────────────────

// ─── Style framework helpers ─────────────────────────────────────────────────
//
//  Mode defaults:
//    ナチュラル : 引き算 / 低コントラスト / ぼかし
//    ステージ   : 足し算 / 高コントラスト / シャープ
//    写真映え   : バランス / 中コントラスト / グラデーション

const MODE_BASE: Record<ScoringModeId, Pick<StyleFramework, 'operation' | 'contrast' | 'blend'>> = {
  natural: { operation: '引き算',  contrast: '低コントラスト', blend: 'ぼかし'        },
  stage:   { operation: '足し算',  contrast: '高コントラスト', blend: 'シャープ'      },
  photo:   { operation: 'バランス', contrast: '中コントラスト', blend: 'グラデーション' },
};

function makeStyle(
  mode: ScoringModeId,
  emphasis: string[],
  suppress: string[],
  overrideOp?: StyleFramework['operation'],
): StyleFramework {
  return {
    ...MODE_BASE[mode],
    emphasis,
    suppress,
    ...(overrideOp ? { operation: overrideOp } : {}),
  };
}

// ─── Impression modifiers ─────────────────────────────────────────────────────
// Adds impression-specific tips and a style-example hint to the primary card.

const IMPRESSION_TIPS: Record<ImpressionId, { emphasis: string[]; suppress: string[]; tips: string[] }> = {
  kirei: {
    emphasis: ['シャープなアイライン', '眉のアーチ'],
    suppress: ['過剰な丸み', '強すぎるチーク'],
    tips: [
      'アイラインをシャープに強調して凛とした目元を見せる',
      '眉は角度をつけてなじませ、大人っぽい輪郭を見せる',
    ],
  },
  kawaii: {
    emphasis: ['丸みのあるチーク', 'グロスのツヤ'],
    suppress: ['シャープすぎるライン', '重めのアイシャドウ'],
    tips: [
      'チークを丸くなじませてやわらかさを見せる',
      'リップグロスで唇のツヤを強調し、フレッシュさを見せる',
    ],
  },
  natural_imp: {
    emphasis: ['素肌感', '自然なツヤ'],
    suppress: ['作り込み感', '過剰な発色'],
    tips: [
      'ベースをなじませて素肌感を見せ、肌本来の質感を引き立てる',
      'アイブロウは毛流れにそってなじませ、自然な形を見せる',
    ],
  },
};

const STYLE_EXAMPLE_HINTS: Record<StyleExampleId, string> = {
  kpop:     'K-POP風：目元を足し算でくっきり強調し、グラデーションリップをなじませて合わせる',
  conserva: 'コンサバ：引き算ベースで清潔感をなじませ、細部に上品さを強調して見せる',
  date:     'デート：血色感とツヤを見せ、チークとリップをなじませてやわらかく仕上げる',
};

export function generateMakeupAdvice(
  result: AnalysisResult,
  mode: ScoringModeId = 'natural',
  impressionId?: ImpressionId,
  styleExampleId?: StyleExampleId,
): MakeupAdvice[] {
  const advice: MakeupAdvice[] = [];
  const { metrics, diagnosis: d, triangleAnalysis: ta } = result;

  // ── 1. Triangle-type primary advice ──────────────────────────────────────
  type TriMap = Record<ScoringModeId, MakeupAdvice>;
  const triangleAdvice: Record<TriangleAnalysis['type'], TriMap> = {
    balanced: {
      natural: {
        category: 'バランス型：引き算で整える日常メイク',
        tips: [
          'ベースはスキンケア感をなじませ、素肌の質感を見せる',
          'アイラインは目の輪郭にそってなじませ、形そのものを引き立てる',
          'リップは唇の形にそってなじませ、幅広いカラーが映えるベースを作る',
        ],
        style: makeStyle(mode, ['顔全体のバランス感'], ['余計な描き足し'], '引き算'),
      },
      stage: {
        category: 'バランス型：足し算で存在感を強調するステージメイク',
        tips: [
          '目元と眉の輪郭を足し算でくっきり強調し、遠目でも整った印象を見せる',
          'ハイライトを鼻筋・Tゾーンに足し算でのせ、照明下の立体感を見せる',
          'リップはシャープな輪郭を強調して見せ、照明に映える発色を引き立てる',
        ],
        style: makeStyle(mode, ['目元の輪郭', 'Tゾーンの立体感', 'リップの発色'], ['肌のムラ感']),
      },
      photo: {
        category: 'バランス型：グラデーションで整える宣材写真メイク',
        tips: [
          '眉・アイラインをグラデーションでなじませ、カメラ正面のバランスを見せる',
          'ハイライトはなじませる程度に抑え、ツヤで光の立体感を見せる',
          'リップはクリアな発色を見せ、グラデーションでなじませて仕上げる',
        ],
        style: makeStyle(mode, ['左右対称の印象', '口元の発色'], ['ハイライトの過剰反射']),
      },
    },
    vertical: {
      natural: {
        category: '綺麗系：引き算で上品さを見せる日常メイク',
        tips: [
          'チークを頬骨の上でなじませ、顔の縦重心を自然に見せる',
          'リップの輪郭をなじませて見せ、目元と口元の距離感をつなぐ',
          '眉は平行気味になじませ、親しみやすさと上品さを両立させて見せる',
        ],
        style: makeStyle(mode, ['顔の上部の明るさ', 'リップの存在感'], ['顔の縦長感'], '引き算'),
      },
      stage: {
        category: '綺麗系：足し算で凛とした印象を強調するステージメイク',
        tips: [
          '目元に奥行きのあるラインを足し算で強調し、上品さを見せる',
          '横方向のチークを足し算で強調し、遠目でも顔の横幅感を見せる',
          'リップをシャープに強調して見せ、目元との距離感バランスを整える',
        ],
        style: makeStyle(mode, ['目元の奥行き', 'チークの横幅感', 'リップの輪郭'], ['顔の縦の間延び感']),
      },
      photo: {
        category: '綺麗系：光で縦比率を整える宣材写真メイク',
        tips: [
          'シャープなアイラインで凛とした印象を見せ、写真映えを強調する',
          '目の下にハイライトをなじませ、光で縦の比率を整えて見せる',
          '撮影は顎を引いた構図で上品さをさらに強調して見せる',
        ],
        style: makeStyle(mode, ['目元のシャープさ', '目の下の光'], ['顔の縦長感']),
      },
    },
    horizontal: {
      natural: {
        category: '可愛い系：引き算でやわらかさを見せる日常メイク',
        tips: [
          'アイラインは目の形にそってなじませ、目尻への過剰な伸ばしを引き算で整える',
          'リップは丸みをなじませて見せ、可愛らしさを活かしたカラーを引き立てる',
          'チークはふんわりなじませてやわらかい印象を強調して見せる',
        ],
        style: makeStyle(mode, ['チークのやわらかさ', '丸みのあるリップ'], ['目尻の過剰な横幅']),
      },
      stage: {
        category: '可愛い系：足し算でフレッシュさを強調するステージメイク',
        tips: [
          'アイラインを目尻方向に足し算で伸ばし、目元の横幅を強調して見せる',
          'チークを頬骨の高い位置で足し算して見せ、元気なステージ映えを強調する',
          'リップは鮮やかな発色を見せ、フレッシュな印象を強調する',
        ],
        style: makeStyle(mode, ['目尻のラインの長さ', 'チークの高い位置', 'リップの鮮やかさ'], ['平面的な印象']),
      },
      photo: {
        category: '可愛い系：グラデーションで映えを整える宣材写真メイク',
        tips: [
          'フレッシュな印象をなじませ、自然な笑顔に合うベースを見せる',
          'アイラインの形をグラデーションでなじませ、カメラ映えを整えて見せる',
          'チークは丸くなじませて、写真でもやわらかい印象を見せる',
        ],
        style: makeStyle(mode, ['フレッシュな印象', 'チークのやわらかさ'], ['過剰な主張感']),
      },
    },
  };

  // Merge impression modifiers into the primary triangle card
  const baseCard = triangleAdvice[ta.type][mode];
  if (impressionId) {
    const imp = IMPRESSION_TIPS[impressionId];
    const merged: MakeupAdvice = {
      ...baseCard,
      tips: [...baseCard.tips, ...imp.tips],
      style: {
        ...baseCard.style,
        emphasis: Array.from(new Set([...baseCard.style.emphasis, ...imp.emphasis])),
        suppress: Array.from(new Set([...baseCard.style.suppress, ...imp.suppress])),
      },
    };
    if (styleExampleId) {
      merged.tips = [...merged.tips, STYLE_EXAMPLE_HINTS[styleExampleId]];
    }
    advice.push(merged);
  } else {
    advice.push(baseCard);
  }

  // ── 2. Diagnosis-based correction advice ─────────────────────────────────

  if (d.eyeDistance.value === 'close') {
    const tips = [
      '眉頭をなじませながら外側に設定し、目間距離を視覚的に広げて見せる',
      '目尻側のアイラインを強調して見せ、目を横に広く見せる',
    ];
    if (mode === 'stage') tips.push('目尻ラインを足し算で長く引き、遠目でも横幅を強調して見せる');
    if (mode === 'photo') tips.push('目頭ハイライトをなじませて抑え、目尻に重心を見せる');
    advice.push({
      category: '目間距離の見え方を整える',
      tips,
      style: makeStyle(mode, ['目尻の幅感'], ['目頭への視線集中']),
    });
  } else if (d.eyeDistance.value === 'far') {
    const tips = [
      '眉頭をなじませながら内側に設定し、目元の距離感を整えて見せる',
      'ノーズシャドウを鼻筋にそってなじませ、目の間を引き締めて見せる',
    ];
    if (mode === 'stage') tips.push('目頭側を足し算で強調し、目元の印象を中央に集めて見せる');
    advice.push({
      category: '目間距離の見え方を整える',
      tips,
      style: makeStyle(mode, ['目頭への視線誘導', '鼻筋のシャドウ'], ['目の離れた印象']),
    });
  }

  if (d.eyeWidth.value === 'narrow') {
    const tips = [
      'アイラインを目尻に向けて強調して見せ、目幅を視覚的に広げる',
      '目頭側にハイライトをなじませ、目の横幅を引き立てて見せる',
    ];
    if (mode === 'stage') tips.push('目尻ラインを足し算で長く引き、遠目でも目幅を強調して見せる');
    if (mode === 'photo') tips.push('目尻方向に細いラインを強調して見せ、カメラ映えを整える');
    advice.push({
      category: '目幅の見え方を整える',
      tips,
      style: makeStyle(mode, ['目尻の横幅', '目頭のハイライト'], ['目の小さな印象']),
    });
  } else if (d.eyeWidth.value === 'wide') {
    const tips = [
      '横方向のアイラインをなじませて抑え、縦方向の影で奥行きを見せる',
      'アイシャドウをグラデーションで縦方向になじませ、目元を引き締めて見せる',
    ];
    if (mode === 'stage') tips.push('上まぶたに締め色をなじませ、横幅を活かしながらバランスを整えて見せる');
    advice.push({
      category: '目幅の見え方を整える',
      tips,
      style: makeStyle(mode, ['目元の縦の奥行き'], ['過剰な横幅感'], '引き算'),
    });
  }

  if (d.eyeLevel.value === 'asymmetric') {
    advice.push({
      category: '目の高さのバランスを整える',
      tips: [
        '低い方の眉をなじませながら少し高く見せ、左右差を視覚的に緩和する',
        '低い方のアイラインを目尻でなじませながら上げ、高さを揃えて見せる',
        mode === 'photo'
          ? '撮影は顔の向きをわずかに傾けて左右差をなじませる'
          : '眉とアイラインの微調整を鏡で確認しながら左右対称に見せる',
      ],
      style: makeStyle(mode, ['低い側の眉・目の高さ'], ['左右差の視覚的強調']),
    });
  }

  if (d.midFace.value === 'long' || d.philtrum.value === 'long') {
    const tips: string[] = [];
    if (d.midFace.value === 'long') tips.push('チークを頬骨の上でなじませ、中顔面の重心を上に見せる');
    if (d.philtrum.value === 'long') tips.push('リップラインを上唇寄りに強調して見せ、鼻下の長さを視覚的に整える');
    if (mode === 'stage') tips.push('横方向のチークを足し算で強調し、顔の縦感をなじませる');
    if (mode === 'photo') tips.push('目の下にハイライトをなじませ、光で縦比率を整えて見せる');
    advice.push({
      category: '縦バランスの見え方を整える',
      tips,
      style: makeStyle(mode, ['チークの高い位置', 'リップの上の位置'], ['中顔面の縦の間延び感']),
    });
  }

  if (d.chin.value === 'long') {
    advice.push({
      category: '顎・輪郭の見え方を整える',
      tips: [
        '顎先にシェーディングをなじませ、フェイスラインをシャープに見せる',
        mode === 'stage'
          ? 'フェイスラインのシェーディングを足し算で強調し、遠目でもシャープさを見せる'
          : '顎先にハイライトを置かず、前進色をなじませて抑える',
      ],
      style: makeStyle(mode, ['フェイスラインのシャープさ'], ['顎の縦の長さ感'], '引き算'),
    });
  }

  if (d.jawline.value === 'prominent') {
    advice.push({
      category: 'フェイスラインの見え方を整える',
      tips: [
        'エラ〜顎にシェーディングをなじませ、輪郭を細く見せる',
        mode === 'photo'
          ? '撮影は顎を引いたアングルでシェーディングを活かして見せる'
          : 'チークを縦方向になじませ、顔の幅を引き締めて見せる',
      ],
      style: makeStyle(mode, ['縦方向のシェーディング'], ['エラの横幅感'], '引き算'),
    });
  }

  if (metrics.symmetryScore < 85) {
    advice.push({
      category: '左右のバランスを整える',
      tips: [
        '左右の眉の高さをなじませながら揃え、表情の印象を統一して見せる',
        'アイラインの太さ・長さを左右でなじませ、バランスを整えて見せる',
        'リップラインで左右の形をなじませ、口元の対称性を見せる',
      ],
      style: makeStyle(mode, ['左右対称の眉・目・口の印象'], ['左右差の視覚的なばらつき']),
    });
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  if (advice.length <= 1) {
    advice.push({
      category: '仕上げのバランスを整える',
      tips: [
        '全体のバランスが整っているため、なじませる仕上がりを基本に整える',
        'ハイライトを鼻筋・Tゾーンに強調して見せ、立体感を引き立てる',
        '目元のグラデーションをなじませ、奥行きを見せる',
      ],
      style: makeStyle(mode, ['鼻筋・Tゾーンの立体感', '目元の奥行き'], ['過剰な描き足し']),
    });
  }

  // ── Mode-specific finishing ───────────────────────────────────────────────
  const modeFinishing: Record<ScoringModeId, MakeupAdvice> = {
    natural: {
      category: '引き算メイクの仕上げ方',
      tips: [
        '引き算を基本に、素肌感をなじませながら自然な仕上がりを見せる',
        'スキンケアベースをなじませて整え、肌そのものを見せる',
        'アイブロウは自然なアーチでなじませ、表情を明るく見せる',
      ],
      style: makeStyle(mode, ['素肌感', '自然なアーチ'], ['作り込み感', '余計なライン']),
    },
    stage: {
      category: '足し算メイクの仕上げ方',
      tips: [
        '足し算でファンデーションを1〜2トーン明るく見せ、照明映えを強調する',
        'パウダーをしっかりなじませ、照明による崩れをなじませて防ぐ',
        'アイブロウを足し算でくっきり強調し、遠目でも形を見せる',
        '目元・唇の輪郭をシャープに見せ、印象を強調する',
      ],
      style: makeStyle(mode, ['目元の輪郭', '眉の存在感', 'リップの輪郭'], ['肌の油感', '眉の抜け']),
    },
    photo: {
      category: 'グラデーション仕上げの整え方',
      tips: [
        'ハイライトはなじませる程度に抑え、フラッシュ飛びを整える',
        'カメラ正面で左右対称に見せ、グラデーションで仕上げる',
        '肌のテクスチャをなじませてツヤを見せ、カメラ映えを整える',
      ],
      style: makeStyle(mode, ['左右対称の印象', '肌のツヤ'], ['ハイライトの過剰反射', 'マットすぎる仕上がり']),
    },
  };
  advice.push(modeFinishing[mode]);

  return advice;
}

// ─── Illusion trick makeup advice (golden ratio × mode → visual adjustment) ──

// Per-mode tip tables: same structural diagnosis, different expression strategy.
// natural = light touch / stage = bold contrast / photo = light-based camera

type ModeMap = Record<ScoringModeId, IllusionTip[]>;

const EYE_LOW: ModeMap = {
  natural: [
    { principle: '明るい＝前進',         action: 'アイシャドウのハイライトカラーを上まぶたにさりげなく広げ、目元をやさしく前に引き出す' },
    { principle: '高い位置に色＝重心が上がる', action: 'チークを頬骨の上に自然な高さで配置し、顔の重心を上方向に誘導する' },
    { principle: '眉の位置で重心が変わる', action: '眉山をほんの少し高めに設定し、目元全体の印象を上方向に整える' },
  ],
  stage: [
    { principle: '明るい＝前進（強調）',  action: '上まぶた全体にハイライト〜パール系を広くのせ、照明下で目元が前面に飛び出して見えるようにする' },
    { principle: '高コントラストで重心を引き上げる', action: 'チークをかなり高めに・やや濃く入れ、遠目でも視線が顔の上部に集まるよう強調する' },
    { principle: '眉を高く・太めに',      action: '眉を通常より高い位置に力強く描き、ステージの距離感でも上重心の印象が伝わるようにする' },
  ],
  photo: [
    { principle: '光で自然に前進',        action: '上まぶたの中央にパールのハイライトをごく薄くのせ、フラッシュで飛ばずにツヤで目元を引き出す' },
    { principle: 'カメラ正面での光の誘導', action: 'チークをノーズシャドウに連続させて高めに入れ、カメラ正面で自然に上重心に見えるよう配置する' },
    { principle: '撮影アングルとの組み合わせ', action: '少し顎を引いた構図にし、目元が相対的に上部に映り込む撮影ポジションを意識する' },
  ],
};

const EYE_HIGH: ModeMap = {
  natural: [
    { principle: '暗い＝後退',           action: '上まぶたにブラウンのマットシャドウをほんのり広め（二重幅より少し上）に乗せ、目元の重心をやさしく落ち着かせる' },
    { principle: '下まつげで重心を下げる', action: '目頭〜中央の下まつげをマスカラで強調し、目元の印象を下方向に安定させる' },
    { principle: 'チークを低めに',        action: 'チークを頬骨の中央〜やや下に入れ、視線を顔の中間帯に引きつける' },
  ],
  stage: [
    { principle: '締め色で強くアンカー',  action: 'ダークブラウンのシャドウを上まぶた広範囲に乗せ、照明下でも目元の重心が下に見えるよう強く押し下げる' },
    { principle: '下まつげを濃く・長く',  action: '下まつげをマスカラで存在感が出るほど強調し、遠目でも目元の縦軸が下に伸びて見えるようにする' },
    { principle: 'チークを低め・横長に',  action: 'チークを頬骨の低め位置に横方向にたっぷり入れ、顔の重心全体を中央に下げる' },
  ],
  photo: [
    { principle: '影で自然に後退',        action: 'マットなブラウンをシアーに上まぶたに重ね、フラッシュ撮影でも自然に目元が落ち着いて見えるよう調整する' },
    { principle: '下まつげをカメラに見せる', action: '下まつげの根元をビューラーで整え、正面カメラで下まつげの存在感が伝わるよう丁寧に仕上げる' },
    { principle: 'チークを低めに・淡く',  action: 'チークは淡いピンク〜コーラルで頬骨より低めに配置し、写真で顔の重心が中央寄りに見えるよう整える' },
  ],
};

const MOUTH_LOW: ModeMap = {
  natural: [
    { principle: '口角の位置で重心が上がる', action: 'リップラインを上唇の山に沿ってわずか上めにトレースし、口元の重心をさりげなく引き上げる' },
    { principle: '人中を短く見せる',      action: 'ノーズシャドウを鼻柱の両端に細く・淡く入れ、鼻下〜上唇の距離を視覚的に短縮する' },
    { principle: '明るいリップで前進',    action: '明度の高いヌードピンク・コーラル系で口元を前面に引き出し、重心を自然に上に誘導する' },
  ],
  stage: [
    { principle: '口角を高く・くっきり引く', action: 'リップラインを上唇の山より少し上めに意識的に引き、遠目でも口元の重心が上に見えるようはっきり描く' },
    { principle: '人中短縮を強調',        action: 'ノーズシャドウを通常より少し濃く細く入れ、ステージの距離感でも鼻下の短縮効果が伝わるようにする' },
    { principle: '発色の強いリップで前進', action: '照明に映える鮮やかなリップカラーを選び、口元の存在感を高め視線を顔の上部に引き上げる' },
  ],
  photo: [
    { principle: '光で口元を前進させる',  action: '上唇の山にグロスのハイライトをごく薄くのせ、カメラ正面で口元が自然に上に浮き上がって見えるよう調整する' },
    { principle: '人中短縮をカメラに最適化', action: 'コンシーラーで鼻下を軽くカバーし、写真映えする滑らかな鼻下〜唇の連続感を作る' },
    { principle: 'クリアな発色で引き出す', action: 'フラッシュで飛びにくいサテンフィニッシュのリップを選び、カメラ映えする口元の前進感を演出する' },
  ],
};

const MOUTH_HIGH: ModeMap = {
  natural: [
    { principle: '下唇を強調すると重心が下がる', action: '下唇にグロスをさりげなく重ね、口元の視点をやわらかく下方向に引き下げる' },
    { principle: 'チークで中顔面を整える', action: 'チークを横方向にやや広めに伸ばし、顔の中間部のボリュームを整えてバランスを取る' },
  ],
  stage: [
    { principle: '下唇をコントラストで目立たせる', action: '下唇にグロスを厚めに重ね、遠目でも下唇の存在感が伝わるよう口元の重心を強く下に引く' },
    { principle: 'チークを横広・中間高さに',  action: 'チークを頬骨の中程に横長に広げ、ステージ上で顔の中央エリアに視線が集まるよう強調する' },
  ],
  photo: [
    { principle: '光で下唇を前進',        action: '下唇の中央にクリアグロスをのせ、カメラ正面で下唇が口元の重心として自然に前面に写り込むよう整える' },
    { principle: 'チークを淡く・中間に',   action: 'チークを淡いトーンで頬骨の中程に配置し、写真で顔の中間部が整って見えるように調整する' },
  ],
};

const FACE_LONG: ModeMap = {
  natural: [
    { principle: '横方向の色＝横幅が広がる', action: 'チークを横長にふんわり入れ、頬に水平方向のボリュームをさりげなく加える' },
    { principle: 'アイライン横広め',       action: 'アイラインを目尻に向けてほんの少し横に伸ばし、目元の横幅をやさしく強調する' },
    { principle: '眉を平行気味に',         action: '眉のアーチをゆるめ、水平に近い形に整えて顔の横幅感を自然に演出する' },
  ],
  stage: [
    { principle: '横方向を力強く強調',     action: 'チークを頬全体に横幅いっぱいに広げ、照明下でも顔の横幅が遠目に伝わるよう存在感を出す' },
    { principle: 'アイライン長め・太め',    action: 'アイラインを目尻から長めに伸ばし、かつやや太めに描いて目元の横幅を強くアピールする' },
    { principle: '眉を強調して平行に',      action: '眉をしっかり描いて完全な平行眉に整え、ステージ距離でも横幅の広がりが伝わるようにする' },
  ],
  photo: [
    { principle: '横方向の光で幅を演出',   action: 'チークを頬骨から横方向にグラデーションで広げ、カメラ正面で自然に横幅感が出るよう光を使って調整する' },
    { principle: 'アイラインを自然に横伸ばし', action: 'アイラインを目尻からフラッシュで消えない程度の太さで横に引き、写真で目元の横幅が残るよう仕上げる' },
    { principle: '眉の形でカメラ映えを調整', action: '眉山を低めにフラットに整え、カメラ正面での横幅感を強調する' },
  ],
};

const FACE_WIDE: ModeMap = {
  natural: [
    { principle: '縦方向の影＝縦感が出る', action: 'フェイスラインに細いシェーディングを縦方向に入れ、輪郭をほんのり引き締めて縦長感を演出する' },
    { principle: 'ハイライトを縦ラインに', action: '鼻筋〜Tゾーンに細いハイライトを縦に入れ、顔の中央に視線を集めて縦の印象を加える' },
    { principle: '眉に角度をつける',      action: '眉山を自然な高さで少し立て、顔全体に縦の方向性をさりげなく加える' },
  ],
  stage: [
    { principle: '縦の影を強調',          action: 'フェイスライン〜エラのシェーディングを通常より濃く縦方向に入れ、遠目でも輪郭の引き締まりが伝わるようにする' },
    { principle: 'ハイライトを縦に強く',   action: '鼻筋から額にかけて縦ハイライトを力強く入れ、照明下でも縦のラインが視線を集めるよう強調する' },
    { principle: '眉山を高く・シャープに', action: '眉山を高くシャープに描き、ステージでも顔全体に縦の躍動感が伝わるようにする' },
  ],
  photo: [
    { principle: '影で自然に縦感を出す',   action: 'フェイスラインにシアーなシェーディングをふんわり入れ、フラッシュで飛ばず自然に輪郭が引き締まって写るよう仕上げる' },
    { principle: '縦ハイライトで光誘導',   action: '鼻筋ハイライトをパールで細く縦に入れ、カメラ正面で顔の中心線が際立ち縦長感が出るよう調整する' },
    { principle: '眉をカメラ向けに整える', action: '眉山を適度な角度で整え、写真で顔のバランスが縦方向に安定して見えるよう仕上げる' },
  ],
};

// Map: (condition key) → mode-indexed tip table
const ILLUSION_TIPS: Record<string, ModeMap> = {
  eye_low:    EYE_LOW,
  eye_high:   EYE_HIGH,
  mouth_low:  MOUTH_LOW,
  mouth_high: MOUTH_HIGH,
  face_long:  FACE_LONG,
  face_wide:  FACE_WIDE,
};

const TRIANGLE_NOTE: Record<TriangleAnalysis['type'], string> = {
  balanced:   '全体のバランスが整っているため、錯覚調整は最小限で十分です。',
  vertical:   '綺麗系の構造と組み合わせることで、錯覚調整が自然に仕上がります。',
  horizontal: '可愛い系の構造と組み合わせると、錯覚調整が印象をより明確にします。',
};

const MODE_SECTION_LABEL: Record<ScoringModeId, string> = {
  natural: 'ナチュラルメイク向け',
  stage:   'ステージメイク向け',
  photo:   '写真映えメイク向け',
};

export function generateIllusionAdvice(
  result: AnalysisResult,
  mode: ScoringModeId = 'natural',
): IllusionAdviceSection[] {
  const sections: IllusionAdviceSection[] = [];
  const { goldenRatio: gr, triangleAnalysis: ta } = result;

  const eyePct   = gr.eyePositionRatio.deviationPct;
  const mouthPct = gr.mouthPositionRatio.deviationPct;
  const facePct  = gr.faceRatio.deviationPct;

  const THRESHOLD      = 3;
  const FACE_THRESHOLD = 8;

  type Condition = { key: string; trigger: string; goal: string; modeNote: Record<ScoringModeId, string> };
  type MaybeCondition = Condition | null;

  const conditions: MaybeCondition[] = [
    eyePct > THRESHOLD ? {
      key: 'eye_low',
      trigger: `目位置（参考値より ${eyePct}% 下寄り）`,
      goal: '目元の位置を上方向に見せるために',
      modeNote: {
        natural: '軽い補正で自然な印象を保ちながら重心を整えます。',
        stage:   '照明・距離に対応するため、コントラストを強めに意識します。',
        photo:   '光を使ってカメラ正面で自然に目元を引き出します。',
      },
    } : eyePct < -THRESHOLD ? {
      key: 'eye_high',
      trigger: `目位置（参考値より ${Math.abs(eyePct)}% 上寄り）`,
      goal: '目元の重心を安定した位置に見せるために',
      modeNote: {
        natural: '暗みを軽くのせて自然に落ち着かせます。',
        stage:   '締め色を強めに使い、遠目でも重心を感じさせます。',
        photo:   'シアーな影でフラッシュに負けずに落ち着きを表現します。',
      },
    } : null,

    mouthPct > THRESHOLD ? {
      key: 'mouth_low',
      trigger: `口位置（参考値より ${mouthPct}% 下寄り）`,
      goal: '口元の位置を上方向に見せるために',
      modeNote: {
        natural: 'リップラインとシャドウで自然に口元を引き上げます。',
        stage:   'はっきりとした輪郭と発色で、遠目でも口元の重心を上に伝えます。',
        photo:   '光とグロスでカメラ正面に口元を前進・引き上げます。',
      },
    } : mouthPct < -THRESHOLD ? {
      key: 'mouth_high',
      trigger: `口位置（参考値より ${Math.abs(mouthPct)}% 上寄り）`,
      goal: '口元の重心を自然な位置に見せるために',
      modeNote: {
        natural: 'グロスとチークで中顔面のバランスをやさしく整えます。',
        stage:   '下唇の存在感を強調し、遠目でも口元の重心を安定させます。',
        photo:   '光で下唇を前進させ、写真でバランスよく見えるよう調整します。',
      },
    } : null,

    facePct > FACE_THRESHOLD ? {
      key: 'face_long',
      trigger: `顔比率（参考値より ${facePct}% 縦長）`,
      goal: '顔の縦長感を和らげ、横幅のバランスを整えるために',
      modeNote: {
        natural: '横方向の要素を自然に加え、縦長感をやさしく緩和します。',
        stage:   '横を大きく強調し、遠目でも顔の横幅感が伝わるようにします。',
        photo:   '光と形でカメラ正面に横幅感を自然に演出します。',
      },
    } : facePct < -FACE_THRESHOLD ? {
      key: 'face_wide',
      trigger: `顔比率（参考値より ${Math.abs(facePct)}% 横広）`,
      goal: '顔に縦方向の印象を加えるために',
      modeNote: {
        natural: '縦の影とハイライトでさりげなく縦長感を演出します。',
        stage:   '縦の要素を力強く入れ、遠目でも縦のラインが伝わるようにします。',
        photo:   '自然なシェーディングと光でカメラ向けの縦感を作ります。',
      },
    } : null,
  ];

  const active: Condition[] = conditions.filter((c): c is Condition => c !== null);

  active.forEach((cond, idx) => {
    const tips = ILLUSION_TIPS[cond.key][mode];
    const note = cond.modeNote[mode]
      + (idx === 0 ? ' ' + TRIANGLE_NOTE[ta.type] : '');
    sections.push({ trigger: cond.trigger, goal: cond.goal, tips, modeNote: note });
  });

  return sections;
}
