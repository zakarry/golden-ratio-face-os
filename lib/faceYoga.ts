import type { AnalysisResult } from '@/types/analysis';
import type { FaceYogaExercise, FaceYogaPlan } from '@/types/karte';

// ─── Exercise definitions ─────────────────────────────────────────────────────
// Face yoga is for movement awareness, expression balance, temporary puffiness,
// jaw relaxation, posture awareness, and daily conditioning — NOT for changing
// bone structure or golden ratio.

interface ExerciseDef {
  id: string;
  title: string;
  targetArea: string;
  purpose: string;
  steps: string[];
  durationOrRepetitions: string;
  caution: string;
  // which diagnosis signals trigger this exercise
  triggers: (analysis: AnalysisResult, conditions: string[]) => boolean;
}

const EXERCISES: Record<string, ExerciseDef> = {
  mouthCorner: {
    id: 'mouth-corner-balance',
    title: '口角バランスエクササイズ',
    targetArea: '口元',
    purpose: '口角を上げる動きの左右差に気づく',
    steps: [
      '鏡を見て左右の口角を確認する',
      '低く見える側だけを無理に強く上げない',
      '両側を均等にゆっくり持ち上げる',
      '3秒保持 × 5回',
    ],
    durationOrRepetitions: '3秒保持 × 5回',
    caution: '無理に片側だけ上げないでください。痛みが出たら中止してください。',
    triggers: (a, conds) =>
      a.scoreBreakdown.symmetry.subscores.mouthCorner < 85 ||
      conds.includes('口角の左右差が気になる'),
  },
  eyeRelax: {
    id: 'eye-relax',
    title: '目元リラックス',
    targetArea: '目元',
    purpose: '目元の余分な緊張を減らし、左右の使い方を観察する',
    steps: [
      '眉を上げずに目を軽く開く',
      '強く見開かない',
      'ゆっくり閉じて力を抜く',
      '5回',
    ],
    durationOrRepetitions: '5回',
    caution: '強く見開かないでください。違和感があれば中止してください。',
    triggers: (a, conds) =>
      a.diagnosis.eyeLevel.value === 'asymmetric' ||
      a.scoreBreakdown.symmetry.subscores.eyeLevel < 85 ||
      conds.includes('目元が重い'),
  },
  jawRelease: {
    id: 'jaw-release',
    title: '顎まわりリリース',
    targetArea: '顎・顎関節',
    purpose: '噛みしめや顎まわりの緊張をゆるめる',
    steps: [
      '上下の歯を離す',
      '舌先を上顎に軽く置く',
      '顎を左右に小さく動かす',
      '痛みのない範囲で行う',
    ],
    durationOrRepetitions: '各方向に小さく5往復',
    caution: '痛みのない範囲で行ってください。顎関節に違和感があれば中止してください。',
    triggers: (a, conds) =>
      a.diagnosis.jawline.value === 'prominent' ||
      a.scoreBreakdown.symmetry.subscores.centerLine < 85 ||
      conds.includes('顎が疲れている'),
  },
  puffinessCare: {
    id: 'puffiness-care',
    title: 'むくみケア',
    targetArea: '顔全体・首',
    purpose: '朝の顔コンディションを整える',
    steps: [
      '首を長く保つ',
      '肩を下げる',
      '深く呼吸する',
      '顔を強くこすらない',
      '耳の下から鎖骨方向へ軽く触れる',
    ],
    durationOrRepetitions: '約1分間',
    caution: '顔を強くこすったり、皮膚を過度に引っ張ったりしないでください。',
    triggers: (_a, conds) => conds.includes('むくみが気になる'),
  },
  postureReset: {
    id: 'posture-reset',
    title: '首・姿勢リセット',
    targetArea: '首・姿勢',
    purpose: '撮影時の顔の見え方と首のラインを整える',
    steps: [
      '顎を軽く引く',
      '頭頂部を上に伸ばす',
      '肩を後ろに引きすぎない',
      '鼻からゆっくり呼吸する',
      '30秒',
    ],
    durationOrRepetitions: '30秒',
    caution: '無理な姿勢を長く続けないでください。めまいがあれば中止してください。',
    triggers: (a, conds) =>
      a.scoreBreakdown.symmetry.subscores.centerLine < 80 ||
      a.scoreBreakdown.symmetry.percentage < 80 ||
      conds.includes('首や肩がこっている'),
  },
};

// ─── Plan generator ───────────────────────────────────────────────────────────

export function generateFaceYogaPlan(
  analysis: AnalysisResult,
  selectedConditions: string[],
  context?: { purpose?: string; scene?: string },
): FaceYogaPlan {
  const recommended: FaceYogaExercise[] = [];

  for (const key of Object.keys(EXERCISES)) {
    const def = EXERCISES[key];
    if (def.triggers(analysis, selectedConditions)) {
      recommended.push({
        id: def.id,
        title: def.title,
        targetArea: def.targetArea,
        purpose: def.purpose,
        steps: def.steps,
        durationOrRepetitions: def.durationOrRepetitions,
        caution: def.caution,
      });
    }
  }

  // Purpose/Scene-influenced priority ordering (not medical claims).
  // Reorders exercises so the most relevant ones come first for the
  // selected context. Does not add new exercises or change triggers.
  if (context) {
    const priorityMap = prioritizeForContext(context.purpose, context.scene);
    recommended.sort((a, b) => {
      const pa = priorityMap[a.id] ?? 99;
      const pb = priorityMap[b.id] ?? 99;
      return pa - pb;
    });
  }

  // Cap at 3 exercises per the spec
  const capped = recommended.slice(0, 3);

  // If nothing triggered, provide a gentle default (puffiness care as general conditioning)
  if (capped.length === 0) {
    const def = EXERCISES.puffinessCare;
    capped.push({
      id: def.id,
      title: def.title,
      targetArea: def.targetArea,
      purpose: def.purpose,
      steps: def.steps,
      durationOrRepetitions: def.durationOrRepetitions,
      caution: def.caution,
    });
  }

  return {
    selectedConditions,
    recommendedExercises: capped,
    completed: false,
  };
}

// ─── Context-aware priority ──────────────────────────────────────────────────
// Maps purpose/scene to exercise priority (lower = higher priority).
// This only reorders — it does not add exercises or make structural claims.

function prioritizeForContext(
  purpose?: string,
  scene?: string,
): Record<string, number> {
  const p = purpose ?? '';
  const s = scene ?? '';

  // Stage / presentation: release eye-area tension, prepare expression, relax jaw
  if (p === 'stage' || s === 'stage' || s === 'audition') {
    return { 'eye-relax': 1, 'mouth-corner-balance': 2, 'jaw-release': 3, 'posture-reset': 4, 'puffiness-care': 5 };
  }
  // Photography: address puffiness, prepare expression, check neck/shoulder
  if (p === 'photo' || s === 'headshot') {
    return { 'puffiness-care': 1, 'eye-relax': 2, 'posture-reset': 3, 'mouth-corner-balance': 4, 'jaw-release': 5 };
  }
  // Date / daily: soften tension, relaxed expression, mouth area
  if (s === 'date' || s === 'casual' || p === 'natural' || p === 'kawaii') {
    return { 'eye-relax': 1, 'mouth-corner-balance': 2, 'puffiness-care': 3, 'jaw-release': 4, 'posture-reset': 5 };
  }
  // Work / formal: posture, jaw, eye relaxation
  if (s === 'work' || s === 'dinner' || p === 'kirei' || p === 'cool') {
    return { 'posture-reset': 1, 'jaw-release': 2, 'eye-relax': 3, 'mouth-corner-balance': 4, 'puffiness-care': 5 };
  }

  return {};
}

export const FACE_YOGA_SAFETY_WARNING =
  '痛み、顎関節の違和感、しびれ、強いめまいなどがある場合は中止してください。顔を強く押したり、皮膚を過度に引っ張ったりしないでください。';

export const FACE_YOGA_DISCLAIMER =
  '顔ヨガによる骨格、鼻の長さ、目の間隔、黄金比そのものの変化を保証するものではありません。';
