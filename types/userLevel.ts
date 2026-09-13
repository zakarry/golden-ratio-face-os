export type UserLevel = 'beginner' | 'intermediate' | 'advanced';

export const USER_LEVEL_LABELS: Record<UserLevel, string> = {
  beginner:     '初級',
  intermediate:  '中級',
  advanced:      '上級',
};

export const USER_LEVEL_DESCRIPTIONS: Record<UserLevel, string> = {
  beginner:     'メイクにあまり自信がない、基本から知りたい',
  intermediate:  '普段メイクはするけど、"なりたい顔"がある',
  advanced:      'メイクは得意、シーンや目的で使い分けたい',
};
