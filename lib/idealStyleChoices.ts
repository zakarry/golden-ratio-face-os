import type { PurposeId } from '@/lib/faceDesignChoices';

export type StyleId =
  | 'natural_soft' | 'natural_clean' | 'natural_fresh'
  | 'elegant_grace' | 'elegant_adult' | 'elegant_refined'
  | 'cute_round' | 'cute_playful' | 'cute_doll'
  | 'cool_sharp' | 'cool_minimal' | 'cool_modern';

export type StyleCategoryId = 'natural' | 'elegant' | 'cute' | 'cool';

export interface StyleCategory {
  id: StyleCategoryId;
  label: string;
}

export const STYLE_CATEGORIES: StyleCategory[] = [
  { id: 'natural',  label: 'ナチュラル' },
  { id: 'elegant', label: 'エレガント' },
  { id: 'cute',    label: 'キュート' },
  { id: 'cool',    label: 'クール' },
];

export interface IdealStyle {
  id: StyleId;
  label: string;
  blurb: string;
  category: StyleCategoryId;
}

export const IDEAL_STYLES: IdealStyle[] = [
  { id: 'natural_soft',   label: '柔らかいナチュラル',   blurb: '素肌の質感を活かした、親しみやすい印象',     category: 'natural' },
  { id: 'natural_clean',  label: '清潔感ナチュラル',     blurb: 'すっきりとした輪郭で信頼感のある印象',       category: 'natural' },
  { id: 'natural_fresh',  label: 'みずみずしいナチュラル', blurb: '透明感のある明るい印象',                   category: 'natural' },
  { id: 'elegant_grace',  label: '上品なエレガンス',     blurb: '落ち着いた色気のある大人の印象',             category: 'elegant' },
  { id: 'elegant_adult',  label: '大人っぽいエレガンス',  blurb: '落ち着きと知性を感じさせる印象',             category: 'elegant' },
  { id: 'elegant_refined',label: '洗練エレガンス',       blurb: '引き締まった輪郭の洗練された印象',           category: 'elegant' },
  { id: 'cute_round',     label: '丸みのあるキュート',    blurb: '柔らかな輪郭の親しみやすい印象',             category: 'cute' },
  { id: 'cute_playful',   label: '遊び心キュート',       blurb: '明るい色気のある可愛い印象',                 category: 'cute' },
  { id: 'cute_doll',      label: '人形風キュート',        blurb: '大きな目元が特徴の愛らしい印象',             category: 'cute' },
  { id: 'cool_sharp',     label: 'シャープクール',       blurb: '凛とした輪郭の力強い印象',                   category: 'cool' },
  { id: 'cool_minimal',   label: 'ミニマルクール',       blurb: '削ぎ落としたすっきりとした印象',             category: 'cool' },
  { id: 'cool_modern',    label: 'モダンクール',         blurb: '都会的な洗練された印象',                     category: 'cool' },
];

export const STYLE_TO_PURPOSE: Record<StyleId, PurposeId> = {
  natural_soft:    'approachable',
  natural_clean:   'natural',
  natural_fresh:   'transparent',
  elegant_grace:   'elegant',
  elegant_adult:   'adult',
  elegant_refined: 'refined',
  cute_round:      'cute',
  cute_playful:    'cute',
  cute_doll:       'cute',
  cool_sharp:      'cool',
  cool_minimal:    'calm',
  cool_modern:     'refined',
};

export function getStylesByCategory(category: StyleCategoryId): IdealStyle[] {
  return IDEAL_STYLES.filter(s => s.category === category);
}
