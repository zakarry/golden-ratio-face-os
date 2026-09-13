import type { AnalysisResult } from './analysis';
import type { DetectedGuide } from '@/lib/faceLandmarks';

// ─── Record types ─────────────────────────────────────────────────────────────

export type KarteRecordType = 'baseline' | 'monthly' | 'dailyMakeup' | 'dailyCondition';

// ─── Face yoga / self-care ────────────────────────────────────────────────────

export interface FaceYogaExercise {
  id: string;
  title: string;
  targetArea: string;
  purpose: string;
  steps: string[];
  durationOrRepetitions: string;
  caution: string;
}

export interface FaceYogaPlan {
  selectedConditions: string[];
  recommendedExercises: FaceYogaExercise[];
  completed: boolean;
  userNote?: string;
}

export const FACE_YOGA_CONDITIONS = [
  'むくみが気になる',
  '目元が重い',
  '顎が疲れている',
  '口角の左右差が気になる',
  '首や肩がこっている',
  '特に気になることはない',
] as const;

export type FaceYogaCondition = typeof FACE_YOGA_CONDITIONS[number];

export type MakeupPurpose =
  | 'natural'
  | 'stage'
  | 'photo'
  | 'kirei'
  | 'kawaii'
  | 'cool';

export const MAKEUP_PURPOSE_LABELS: Record<MakeupPurpose, string> = {
  natural: 'ナチュラル',
  stage:   'ステージ',
  photo:   '写真映え',
  kirei:   '綺麗系',
  kawaii:  '可愛い系',
  cool:    'クール系',
};

export interface MakeupPlan {
  purpose: MakeupPurpose;
  addition: string[];      // 足し算メイク
  subtraction: string[];   // 引き算メイク
  contrast: string;
  blending: string;
  cheek: string;
  eye: string;
  lip: string;
  eyebrow: string;
  shading: string;
  advice: string[];
}

export interface BeforeAfter {
  beforeImageSrc?: string;    // data URL — kept only in memory, not persisted
  afterImageSrc?: string;
  beforeAnalysis: AnalysisResult;
  afterAnalysis: AnalysisResult;
  changeSummary: string[];
}

export interface FaceKarteRecord {
  id: string;
  date: string;                 // ISO string
  recordType: KarteRecordType;

  // Saved face image (data URL) and detected guide — baseline only
  imageSrc?: string;
  guide?: DetectedGuide;

  // Core analysis
  analysis: AnalysisResult;

  // Derived summaries (for history cards — avoid re-running logic)
  diagnosisSummary: string[];
  strengths: string[];          // strength.feature strings

  goldenRatio: {
    faceRatio: number;
    eyePosition: number;
    mouthPosition: number;
  };

  triangleAnalysis: {
    type: 'balanced' | 'vertical' | 'horizontal';
    label: string;
    ratio: number;
  };

  // Optional design / comparison
  makeupPlan?: MakeupPlan;
  beforeAfter?: BeforeAfter;

  // Face yoga / self-care
  faceYogaPlan?: FaceYogaPlan;
  faceYogaSkipped?: boolean;

  // Daily journey context
  purpose?: MakeupPurpose;
  scene?: string;

  // Metadata
  note?: string;
}

// ─── Monthly diff ─────────────────────────────────────────────────────────────

export interface MonthlyDiff {
  label: string;
  baseline: number;
  current: number;
  delta: number;        // current − baseline (positive = improved toward reference)
  note: string;
}

export interface MonthlyCondition {
  overallDelta: number;
  symmetryDelta: number;
  verticalDelta: number;
  eyeDistanceDelta: number;
  puffinessTrend: 'none' | 'mild' | 'moderate';
  diffs: MonthlyDiff[];
  summary: string;
}

// ─── Before / After impression comparison ─────────────────────────────────────

export type ImpressionLevel =
  | 'much_stronger'    // 強くなった
  | 'slightly_stronger' // やや強くなった
  | 'about_same'       // ほぼ同じ
  | 'slightly_weaker'; // やや弱くなった

export interface ImpressionItem {
  label: string;
  level: ImpressionLevel;
  note: string;
}

export interface StructureComparison {
  goldenRatio: string;     // 黄金比参考値
  placement: string;       // 目・口・骨格配置
  baseStructure: string;   // 顔の基礎構造
  message: string;          // メイクによって顔の基礎構造は変わりません。
}

export interface ImpressionComparison {
  structure: StructureComparison;
  items: ImpressionItem[];
  desiredImpression?: {
    label: string;
    note: string;
  };
  disclaimer: string;      // 画像条件の違いにより、参考結果です。
}

// ─── Face Designer Comment (provider architecture) ───────────────────────────

export type FaceDesignerProviderId =
  | 'standard_ai'           // Standard AI Face Designer
  | 'miss_world'            // Miss World Official Face Designer
  | 'avance'                // AVANCE Official Face Designer
  | 'shiseido'              // SHISEIDO Official Face Designer
  | 'professional';        // Professional Face Designer

export interface FaceDesignerProvider {
  id: FaceDesignerProviderId;
  name: string;             // display name (Japanese)
  nameEn: string;          // display name (English subtitle)
  tagline?: string;         // short tagline
  specialties: string[];   // e.g. ['Natural', 'Portrait', 'Daily makeup']
  philosophy: string;      // design philosophy quote
}

export const FACE_DESIGNER_PROVIDERS: Record<FaceDesignerProviderId, FaceDesignerProvider> = {
  standard_ai: {
    id: 'standard_ai',
    name: 'スタンダードAIフェイスデザイナー',
    nameEn: 'Standard AI Face Designer',
    tagline: '基本のフェイスデザイン解説',
    specialties: ['Natural', 'Portrait', 'Daily makeup'],
    philosophy: 'その人らしさを残しながら、\n目的に合った印象を自然に設計します。',
  },
  miss_world: {
    id: 'miss_world',
    name: 'ミス・ワールド公式フェイスデザイナー',
    nameEn: 'Miss World Official Face Designer',
    specialties: [],
    philosophy: '',
  },
  avance: {
    id: 'avance',
    name: 'AVANCE公式フェイスデザイナー',
    nameEn: 'AVANCE Official Face Designer',
    tagline: 'アイゾーンの見せ方に哲学を持つブランド',
    specialties: ['Eye zone', 'Portrait', 'Stage'],
    philosophy: '目もとは、強調するのではなく、\n自然に視線を集める場所でありたい。',
  },
  shiseido: {
    id: 'shiseido',
    name: 'SHISEIDO公式フェイスデザイナー',
    nameEn: 'SHISEIDO Official Face Designer',
    specialties: [],
    philosophy: '',
  },
  professional: {
    id: 'professional',
    name: 'プロフェッショナルフェイスデザイナー',
    nameEn: 'Professional Face Designer',
    specialties: [],
    philosophy: '',
  },
};

// Future placeholder: recommended products (not yet populated)
export interface RecommendedProduct {
  name: string;
  brand?: string;
  category?: string;
  description?: string;
}

// Future placeholder: recommended techniques (not yet populated)
export interface RecommendedTechnique {
  name: string;
  description?: string;
}

export interface FaceDesignerRecommendations {
  products: RecommendedProduct[];   // future placeholder — empty for now
  techniques: RecommendedTechnique[]; // future placeholder — empty for now
}

export interface FaceDesignerReviewSection {
  number: string;      // '①', '②', '③'
  title: string;       // section title (Japanese)
  body: string;        // section content (may contain newlines)
}

export const FACE_DESIGNER_ENDING_MESSAGE =
  '美しさは評価ではなく、\n積み重ねです。\n\n次回の顔カルテで、\nさらにあなたらしい表現を\n一緒に育てていきましょう。';

export interface FaceDesignerComment {
  provider: FaceDesignerProvider;
  sections: FaceDesignerReviewSection[];  // always exactly 3
  recommendations: FaceDesignerRecommendations;
}
