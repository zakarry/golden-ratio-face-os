// ─── Layer 1: Purpose (用途) ──────────────────────────────────────────────────
export type ScoringModeId = 'natural' | 'stage' | 'photo';

// ─── Layer 2: Impression (印象) ───────────────────────────────────────────────
export type ImpressionId = 'kirei' | 'kawaii' | 'natural_imp';

export interface ImpressionType {
  id: ImpressionId;
  label: string;
  description: string;
  detail: string;
}

export const IMPRESSION_TYPES: ImpressionType[] = [
  {
    id: 'kirei',
    label: '綺麗系',
    description: '上品・大人っぽい印象',
    detail: 'シャープなラインと落ち着いたトーンで、凛とした大人の印象を強調します。',
  },
  {
    id: 'kawaii',
    label: '可愛い系',
    description: '親しみやすい・フレッシュな印象',
    detail: '丸みと明るさを活かして、やわらかくフレッシュな印象を引き出します。',
  },
  {
    id: 'natural_imp',
    label: 'ナチュラル系',
    description: '素肌感・自然な印象',
    detail: '素肌を活かした自然な仕上がりで、ありのままの印象を見せます。',
  },
];

// ─── Optional style examples (参考スタイル) ───────────────────────────────────
export type StyleExampleId = 'kpop' | 'conserva' | 'date';

export interface StyleExample {
  id: StyleExampleId;
  label: string;
  tag: string;
  hint: string;
}

export const STYLE_EXAMPLES: StyleExample[] = [
  {
    id: 'kpop',
    label: 'K-POP風',
    tag: '#トレンド',
    hint: '目元を足し算でくっきり強調し、グラデーションリップを合わせるスタイル',
  },
  {
    id: 'conserva',
    label: 'コンサバ',
    tag: '#オフィス',
    hint: '引き算ベースで清潔感を保ちながら、細部に上品さを見せるスタイル',
  },
  {
    id: 'date',
    label: 'デート',
    tag: '#柔らか',
    hint: '血色感とツヤを見せ、やわらかくなじませた仕上がりのスタイル',
  },
];

export interface ScoringMode {
  id: ScoringModeId;
  label: string;
  description: string;
  detail: string;
  weights: {
    faceBalance: number;
    eyePlacement: number;
    noseMouthChin: number;
    symmetry: number;
  };
}

export const SCORING_MODES: ScoringMode[] = [
  {
    id: 'natural',
    label: '日常バランス',
    description: '普段の印象を基準にしたバランス',
    detail: '顔全体の縦バランス、目の配置、下顔面、左右対称性を比較的均等に見ます。日常的な印象設計や自然なバランス確認に適した標準モードです。',
    weights: { faceBalance: 0.30, eyePlacement: 0.30, noseMouthChin: 0.20, symmetry: 0.20 },
  },
  {
    id: 'stage',
    label: 'ステージ映え',
    description: '遠目や照明で目元が強く見える評価',
    detail: 'ステージ上では照明や距離の影響により、目元の印象が強く見えやすいため、目の配置をやや重視します。一方で細かな左右差は遠目では目立ちにくいため、対称性の比重を少し下げています。',
    weights: { faceBalance: 0.30, eyePlacement: 0.40, noseMouthChin: 0.20, symmetry: 0.10 },
  },
  {
    id: 'photo',
    label: '宣材写真用',
    description: 'カメラ写りで整って見える評価',
    detail: '宣材写真では顔全体の構図と目元の印象が写真の安定感に影響しやすいため、顔バランスと目の配置をやや重視します。細かな左右差よりも、カメラ上で整って見える配置を優先します。',
    weights: { faceBalance: 0.35, eyePlacement: 0.35, noseMouthChin: 0.20, symmetry: 0.10 },
  },
];

export interface AnalysisMetrics {
  verticalRatio: [number, number, number];
  horizontalRatio: [number, number, number];
  goldenRatioScore: number;
  eyeDistanceRatio: number;
  eyeAngle: number;
  symmetryScore: number;
  noseLipChinRatio: [number, number];
}

export interface AnalysisScores {
  overall: number;
  faceBalance: number;
  eye: number;
  lowerFace: number;
  symmetry: number;
}

export type TriangleType = 'balanced' | 'vertical' | 'horizontal';

export interface TriangleAnalysis {
  width: number;
  height: number;
  ratio: number;
  type: TriangleType;
  label: string;
  description: string;
  makeupAdvice: string[];
  // Normalised (0–1) landmark coords for canvas overlay
  leftPupil: { x: number; y: number };
  rightPupil: { x: number; y: number };
  mouthCenter: { x: number; y: number };
}

export interface ScoreBreakdown {
  faceBalance: {
    percentage: number;
    weighted: number;
    max: 30;
    measuredRatio: [number, number, number];
    idealRatio: [number, number, number];
    subscores: { verticalThirds: number };
    explanation: string;
  };
  eyePlacement: {
    percentage: number;
    weighted: number;
    max: 30;
    subscores: { eyeHeight: number; eyeDistance: number; eyeAngle: number };
    measured: { eyeDistanceRatio: number; eyeAngle: number };
    explanation: string;
  };
  noseMouthChin: {
    percentage: number;
    weighted: number;
    max: 20;
    measuredRatio: [number, number];
    idealRatio: [number, number];
    subscores: { lowerFaceRatio: number };
    explanation: string;
  };
  symmetry: {
    percentage: number;
    weighted: number;
    max: 20;
    subscores: { eyeLevel: number; mouthCorner: number; centerLine: number };
    explanation: string;
  };
}

// ─── Feature Diagnosis ────────────────────────────────────────────────────────

export type DiagnosisLevel = 'wide' | 'standard' | 'narrow'
  | 'long' | 'short'
  | 'close' | 'far'
  | 'stable' | 'asymmetric'
  | 'prominent' | 'normal';

export interface DiagnosisItem {
  label: string;
  value: DiagnosisLevel;
  display: string;
  note: string;
  tone: 'neutral' | 'info' | 'caution';
}

export interface FaceDiagnosis {
  // Vertical
  forehead: DiagnosisItem;
  midFace: DiagnosisItem;
  philtrum: DiagnosisItem;
  chin: DiagnosisItem;
  // Horizontal / eye
  eyeDistance: DiagnosisItem;
  eyeLevel: DiagnosisItem;
  eyeWidth: DiagnosisItem;
  jawline: DiagnosisItem;
}

// ─── Golden ratio structural reference ───────────────────────────────────────

export interface GoldenRatioItem {
  label: string;
  measured: number;       // actual computed value
  reference: number;      // φ-based reference
  deviation: number;      // measured − reference (signed)
  deviationPct: number;   // deviation as % of reference (signed, rounded)
  note: string;           // neutral interpretation
}

export interface GoldenRatioAnalysis {
  faceRatio: GoldenRatioItem;       // faceHeight / faceWidth  → ref 1.618
  eyePositionRatio: GoldenRatioItem; // (eyeCenterY − foreheadY) / faceHeight → ref 0.50
  mouthPositionRatio: GoldenRatioItem; // (mouthCenterY − foreheadY) / faceHeight → ref 0.75
  summary: string;
}

// ─── Face strengths ───────────────────────────────────────────────────────────

export interface FaceStrength {
  feature: string;     // the concrete structural feature
  impression: string;  // what impression it creates
  usage: string;       // how it can be used / leveraged
}

export interface AnalysisResult {
  metrics: AnalysisMetrics;
  scores: AnalysisScores;
  scoreBreakdown: ScoreBreakdown;
  triangleAnalysis: TriangleAnalysis;
  goldenRatio: GoldenRatioAnalysis;
  diagnosis: FaceDiagnosis;
  strengths: FaceStrength[];
}

export interface AnonymousAnalysisData {
  id: string;
  createdAt: string;
  source: 'web';
  consent: true;
  metrics: AnalysisMetrics;
  scores: AnalysisScores;
  triangleAnalysis: Omit<TriangleAnalysis, 'leftPupil' | 'rightPupil' | 'mouthCenter'>;
}

// ─── Style framework ─────────────────────────────────────────────────────────

export type StyleOperation = '足し算' | '引き算' | 'バランス';
export type ContrastLevel  = '高コントラスト' | '中コントラスト' | '低コントラスト';
export type BlendStyle     = 'シャープ' | 'グラデーション' | 'ぼかし';

export interface StyleFramework {
  operation: StyleOperation;
  emphasis: string[];   // what to bring forward — 「見せる」parts
  suppress: string[];   // what to hold back  — 「なじませる」parts
  contrast: ContrastLevel;
  blend: BlendStyle;
}

export interface MakeupAdvice {
  category: string;
  tips: string[];
  style: StyleFramework;
}

export interface IllusionTip {
  principle: string;
  action: string;
}

export interface IllusionAdviceSection {
  trigger: string;
  goal: string;
  tips: IllusionTip[];
  modeNote?: string;
}

export interface GuideSettings {
  faceBoxX: number;      // px from left of displayed image
  faceBoxY: number;      // px from top
  faceBoxWidth: number;  // px
  faceBoxHeight: number; // px
  centerLineX: number;   // px from left
  eyebrowLineY: number;  // px from top
  eyeLineY: number;
  noseBaseLineY: number;
  lipLineY: number;
  chinLineY: number;
}

export function defaultGuideSettings(w: number, h: number): GuideSettings {
  return {
    faceBoxX: w * 0.18,
    faceBoxY: h * 0.08,
    faceBoxWidth: w * 0.64,
    faceBoxHeight: h * 0.82,
    centerLineX: w * 0.50,
    eyebrowLineY: h * 0.32,
    eyeLineY: h * 0.40,
    noseBaseLineY: h * 0.58,
    lipLineY: h * 0.70,
    chinLineY: h * 0.88,
  };
}

// Placeholder types for future MediaPipe integration
export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

export interface MediaPipeResult {
  landmarks: FaceLandmark[];
  faceBox: { x: number; y: number; width: number; height: number };
}

// ─── Men's grooming types ─────────────────────────────────────────────────────

export type GroomingModeId = 'casual' | 'formal' | 'photo';

export interface GroomingMode {
  id: GroomingModeId;
  label: string;
  labelSub: string;
  description: string;
  detail: string;
}

export const GROOMING_MODES: GroomingMode[] = [
  {
    id: 'casual',
    label: 'ナチュラル',
    labelSub: '普段',
    description: '清潔感と自然さを優先',
    detail: '日常シーンでは作り込みすぎず、清潔感と骨格の自然な輪郭を活かします。眉・肌・輪郭の整え方で印象を底上げします。',
  },
  {
    id: 'formal',
    label: 'フォーマル',
    labelSub: '審査・スーツ',
    description: '構造と存在感を強調',
    detail: '審査・スーツ着用シーンでは骨格のシャープさと眉・フェイスラインの明確さが信頼感と存在感に直結します。',
  },
  {
    id: 'photo',
    label: 'フォト',
    labelSub: '宣材',
    description: 'カメラ映えと立体感',
    detail: '宣材写真ではカメラ正面での骨格の立体感、眉の形、肌のテクスチャが印象を左右します。光の入り方を意識したスタイリングが重要です。',
  },
];

export type GroomingStyleId = 'sharp' | 'natural' | 'soft' | 'classic';

export interface GroomingStyle {
  id: GroomingStyleId;
  label: string;
  description: string;
  detail: string;
}

export const GROOMING_STYLES: GroomingStyle[] = [
  {
    id: 'sharp',
    label: 'シャープ系',
    description: '骨格と輪郭を強調',
    detail: 'フェイスラインと眉のラインを明確にし、構造を前面に出したクリーンな印象を作ります。',
  },
  {
    id: 'natural',
    label: 'ナチュラル系',
    description: '素の質感・清潔感',
    detail: '過剰な整え方をせず、素の骨格と肌質を活かした自然で清潔な印象を保ちます。',
  },
  {
    id: 'soft',
    label: 'ソフト系',
    description: '親しみやすい・やわらかい',
    detail: '眉やフェイスラインの角をなじませてやわらかく整え、接しやすい印象を作ります。',
  },
  {
    id: 'classic',
    label: 'クラシック系',
    description: '端正・正統派',
    detail: '左右対称と比率の整いを重視し、時代を問わない端正な印象を構成します。',
  },
];

// ─── Grooming advice output ───────────────────────────────────────────────────

export type GroomingCategory =
  | 'ヘアスタイル'
  | '眉'
  | '髭・ひげ'
  | 'フェイスライン'
  | '肌質・テクスチャ';

export interface GroomingTip {
  area: GroomingCategory;
  action: string;     // concrete instruction using 「見せる」「整える」「なじませる」
  reason: string;     // why this matters for the face structure
}

export interface GroomingAdvice {
  category: string;
  tips: GroomingTip[];
  emphasis: string[];
  suppress: string[];
}
