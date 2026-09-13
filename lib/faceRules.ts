import type { FaceDesignerProviderId } from '@/types/karte';

// Face Rule：ブランドの暗黙知を判断ルール化したもの。
// Concept Book「AIは解析、ブランドは解釈」の"解釈"を担う部分。
// generateFaceDesignerComment の①②③（AIによる解析コメント）はそのままに、
// ここにルールがあるブランドだけ④としてブランドの解釈を追加する。
export interface FaceRule {
  providerId: FaceDesignerProviderId;
  /** ブランドの判断ルール（暗黙知）。Face Rule Interviewから登録される想定 */
  rules: string[];
  /** ④として表示する、ブランド視点のレビュー文 */
  reviewNote: string;
  /** 技法の後に紹介する、推奨カテゴリ（商品は最後に出す方針のため、カテゴリ名のみ） */
  recommendedTechniques: string[];
}

export const FACE_RULES: Partial<Record<FaceDesignerProviderId, FaceRule>> = {
  avance: {
    providerId: 'avance',
    rules: [
      '目頭を強調しすぎない',
      '目尻へ自然に視線を流す',
      '黒目周辺の存在感を高める',
    ],
    reviewNote:
      'AVANCEのアイゾーン哲学では、目頭を強調するより、目尻へ自然に視線を流すことを大切にしています。黒目まわりの存在感を少し高める技法を選ぶと、AVANCEらしい仕上がりに近づきます。',
    recommendedTechniques: ['ライナー', 'マスカラ'],
  },
};

export function getFaceRule(providerId: FaceDesignerProviderId): FaceRule | undefined {
  return FACE_RULES[providerId];
}
