import type { MakeupPurpose } from '@/types/karte';

export type PurposeId =
  | 'trust' | 'intelligent' | 'calm' | 'approachable'
  | 'natural' | 'cute' | 'adult' | 'elegant'
  | 'photogenic' | 'transparent' | 'presence' | 'refined'
  | 'glamorous' | 'powerful' | 'dramatic' | 'cool'
  | 'graceful' | 'modest';

export interface PurposeOption {
  id: PurposeId;
  label: string;
}

export type SceneId =
  | 'casual' | 'work' | 'date' | 'dinner'
  | 'headshot' | 'audition' | 'stage' | 'party';

export interface SceneOption {
  id: SceneId;
  label: string;
}

export const PURPOSES: PurposeOption[] = [
  { id: 'trust',        label: '信頼感' },
  { id: 'intelligent',  label: '知的' },
  { id: 'calm',         label: '落ち着き' },
  { id: 'approachable', label: '親しみやすい' },
  { id: 'natural',      label: 'ナチュラル' },
  { id: 'cute',         label: '可愛い' },
  { id: 'adult',        label: '大人っぽい' },
  { id: 'elegant',      label: 'エレガント' },
  { id: 'photogenic',   label: '写真映え' },
  { id: 'transparent',  label: '透明感' },
  { id: 'presence',     label: '存在感' },
  { id: 'refined',      label: '洗練' },
  { id: 'glamorous',    label: '華やか' },
  { id: 'powerful',     label: '力強い' },
  { id: 'dramatic',     label: 'ドラマティック' },
  { id: 'graceful',    label: '上品' },
  { id: 'modest',      label: '控えめ' },
  { id: 'cool',         label: 'クール' },
];

export const SCENES: SceneOption[] = [
  { id: 'casual',    label: '普段のお出かけ' },
  { id: 'work',      label: '仕事・商談' },
  { id: 'date',      label: 'デート' },
  { id: 'dinner',    label: '友人との食事' },
  { id: 'headshot',  label: '宣材写真・SNS' },
  { id: 'audition',  label: 'オーディション' },
  { id: 'stage',     label: 'ステージ・イベント' },
  { id: 'party',     label: 'フォーマル（結婚式・式典など）' },
];

export const SCENE_TO_PURPOSES: Record<SceneId, PurposeId[]> = {
  casual:   ['natural', 'cute', 'elegant', 'approachable'],
  work:     ['trust', 'intelligent', 'calm', 'approachable'],
  date:     ['natural', 'cute', 'adult', 'elegant'],
  dinner:   ['natural', 'cute', 'approachable', 'elegant'],
  headshot: ['photogenic', 'transparent', 'presence', 'refined'],
  audition: ['natural', 'elegant', 'presence', 'photogenic'],
  stage:    ['glamorous', 'powerful', 'dramatic', 'presence'],
  party:    ['graceful', 'modest', 'calm', 'glamorous'],
};

export const PURPOSE_TO_MAKEUP: Record<PurposeId, MakeupPurpose> = {
  trust:        'kirei',
  intelligent:  'kirei',
  calm:         'kirei',
  approachable: 'natural',
  natural:      'natural',
  cute:         'kawaii',
  adult:        'kirei',
  elegant:      'kirei',
  photogenic:   'photo',
  transparent:  'photo',
  presence:     'stage',
  refined:      'kirei',
  glamorous:    'stage',
  powerful:     'stage',
  dramatic:     'stage',
  cool:         'cool',
  graceful:     'kirei',
  modest:       'natural',
};
