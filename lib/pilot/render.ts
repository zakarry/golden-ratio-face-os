// 完成イメージの生成 → 測定 → 判定 → 記録（ブラウザ側。運営専用）
// 生成は Edge Function pilot-render（APIキーはサーバー側）。測定は参照写真と同じ measureReferenceImage。
// 生成した画像はすぐ candidate で記録し、運営が採用／不採用と症例一行をあとからつける。

import { getSupabaseClient } from '@/lib/supabaseClient';
import { measureReferenceImage } from './referenceMeasure';
import type { PilotMetrics } from './targetCard';
import type { SurveyAnswers } from './survey';
import { YOSE_METRICS, deriveYoseValues, type YoseMetricId, type YoseResult } from './yosekata';
import { buildRenderPrompt, type RenderEngine, type RenderPurpose, type RenderPromptOptions } from './renderPrompt';

export const RENDER_PROMPT_VERSION = 'render-2026-10-18';

export const RENDER_PURPOSE_LABEL: Record<RenderPurpose, string> = { hp: 'HP', portrait: '宣材', stage: '舞台' };
export const RENDER_ENGINE_LABEL: Record<RenderEngine, string> = { gemini: 'Gemini', openai: 'ChatGPT' };

/** 素顔と生成画像の差の許容幅（寄せ方と同じ） */
const TOL = Object.fromEntries(YOSE_METRICS.map(m => [m.id, m.tolerance])) as Record<YoseMetricId, number>;

export type RenderDiffs = Record<string, { diff: number; ratio: number }>;
export type RenderDecision = 'adopted' | 'rejected' | 'candidate';

export interface RenderRow {
  id: string;
  token: string;
  subject_code: string;
  engine: RenderEngine | 'manual';
  model: string | null;
  purpose: RenderPurpose | 'other';
  target_name: string | null;
  source_path: string;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  prompt: string;
  prompt_version: string | null;
  diffs: RenderDiffs | null;
  max_ratio: number | null;
  skeleton_ok: boolean | null;
  aspect_ok: boolean | null;
  decision: RenderDecision;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** 素顔画像と生成画像の7指標を比べる（補正なし：同じ写真同士の比較なのでスマホ補正は入れない） */
export function compareSkeleton(src: PilotMetrics, out: PilotMetrics) {
  const a = deriveYoseValues(src), b = deriveYoseValues(out);
  const diffs: RenderDiffs = {};
  let maxRatio = 0;
  for (const m of YOSE_METRICS) {
    const d = (b[m.id] ?? 0) - (a[m.id] ?? 0);
    const ratio = Math.abs(d) / TOL[m.id];
    diffs[m.id] = { diff: d, ratio };
    maxRatio = Math.max(maxRatio, ratio);
  }
  return { diffs, maxRatio, skeletonOk: maxRatio <= 1.0 };
}

/** 縦横比が素顔と ±2% 以内か */
export const aspectOk = (sw: number, sh: number, ow: number, oh: number) => Math.abs((ow / oh) / (sw / sh) - 1) <= 0.02;

/** アンケートから指示文の肌・印象・触らない場所を作る */
const SKIN_WORDS: [RegExp, string][] = [
  [/そばかす|ソバカス/, 'そばかす'], [/ニキビ|にきび/, 'ニキビ跡'], [/あざ|アザ/, 'あざ'], [/くま|クマ|隈/, '目の下のくま'],
  [/赤み|赤ら/, '赤み'], [/シミ|しみ/, 'シミ'], [/毛穴/, '毛穴'], [/くすみ/, 'くすみ'],
];
export function promptOptionsFromSurvey(a: SurveyAnswers | null | undefined): Pick<RenderPromptOptions, 'skinFix' | 'impression' | 'noTouch'> {
  if (!a) return {};
  const str = (v: string | string[] | undefined) => Array.isArray(v) ? v.join('、') : (v ?? '');
  const dislike = str(a.dislike);
  const skinFix = SKIN_WORDS.filter(([re]) => re.test(dislike)).map(([, w]) => w);
  const imp = a.impression;
  const impression = (Array.isArray(imp) ? imp : imp ? [imp] : []).map(s => s.trim()).filter(Boolean);
  const noTouch = str(a.no_touch).trim();
  return {
    skinFix: skinFix.length ? skinFix : undefined,
    impression: impression.length ? impression : undefined,
    noTouch: noTouch && !/^(特に)?(なし|無し|ない|ないです|ありません)[。！!]?$/.test(noTouch) ? noTouch : undefined,
  };
}

export interface RenderStatus { gemini: boolean; openai: boolean; models?: { gemini: string; openai: string } }

/** Edge Function のエラー本文を取り出す */
async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const j = await ctx.json(); if (j?.error) return String(j.error); } catch { /* noop */ }
  }
  return error instanceof Error ? error.message : String(error);
}

/** どちらのキーが入っているか（無い方はボタンを無効にする） */
export async function fetchRenderStatus(): Promise<RenderStatus> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data, error } = await supabase.functions.invoke('pilot-render', { body: { action: 'status' } });
  if (error) throw new Error(await fnError(error));
  return data as RenderStatus;
}

export interface RenderSource {
  recordId: string;
  path: string;
  metrics: PilotMetrics;
  width: number;
  height: number;
}

/** 素顔：写真をブラウザで測り直す（生成画像と同じ経路・同じ版の検出器で揃える）。測れなければ記録の値 */
export async function measureSource(url: string, recordId: string, path: string, stored: PilotMetrics): Promise<RenderSource> {
  const m = await measureReferenceImage(url);
  if (m) return { recordId, path, metrics: m.metrics, width: m.imageWidth, height: m.imageHeight };
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((ok, ng) => { img.onload = () => ok(); img.onerror = () => ng(new Error('素顔の写真を読み込めませんでした')); img.src = url; });
  return { recordId, path, metrics: stored, width: img.naturalWidth, height: img.naturalHeight };
}

export function buildPrompt(yose: YoseResult, engine: RenderEngine, purpose: RenderPurpose, extra?: Partial<RenderPromptOptions>) {
  return buildRenderPrompt(yose, { ...extra, purpose, engine });
}

/** 生成 → 測定 → 判定 → candidate で記録。記録した行を返す */
export async function generateRender(args: {
  token: string; subjectCode: string; source: RenderSource; engine: RenderEngine; purpose: RenderPurpose;
  prompt: string; targetName?: string;
}): Promise<RenderRow> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 未設定');
  const { data: j, error } = await supabase.functions.invoke('pilot-render', {
    body: { token: args.token, sourcePath: args.source.path, prompt: args.prompt, engine: args.engine, label: args.purpose, width: args.source.width, height: args.source.height },
  });
  if (error) throw new Error(await fnError(error));

  // 測定（参照写真の測定と同じ経路）。顔が取れなくても画像と記録は残す
  const m = await measureReferenceImage(j.url);
  const cmp = m ? compareSkeleton(args.source.metrics, m.metrics) : null;
  const { data: u } = await supabase.auth.getUser();
  const { data: row, error: insErr } = await supabase.from('pilot_renders').insert({
    token: args.token, subject_code: args.subjectCode, engine: args.engine, model: j.model ?? null, purpose: args.purpose,
    target_name: args.targetName ?? null, source_path: args.source.path, image_path: j.path,
    image_width: m?.imageWidth ?? null, image_height: m?.imageHeight ?? null,
    prompt: j.usedPrompt ?? args.prompt, prompt_version: RENDER_PROMPT_VERSION + (j.retried ? '+soften' : ''),
    metrics: m?.metrics ?? null, source_metrics: args.source.metrics, diffs: cmp?.diffs ?? null, max_ratio: cmp?.maxRatio ?? null,
    skeleton_ok: cmp?.skeletonOk ?? null,
    aspect_ok: m ? aspectOk(args.source.width, args.source.height, m.imageWidth, m.imageHeight) : null,
    decision: 'candidate', created_by: u.user?.email ?? null,
  }).select('*').single();
  if (insErr) throw new Error(`画像は作りましたが記録できませんでした（${insErr.message}）`);
  return row as RenderRow;
}

export async function listRenders(token: string): Promise<RenderRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('pilot_renders').select('*').eq('token', token).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RenderRow[];
}

/** 全員分の採用（Excel 用） */
export async function listAdoptedRenders(): Promise<RenderRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('pilot_renders').select('*').eq('decision', 'adopted').order('subject_code').range(0, 1999);
  if (error) throw new Error(error.message);
  return (data ?? []) as RenderRow[];
}

/** 採否と症例一行。採用は用途ごとに1枚：同じ人・同じ用途の他の採用は candidate に戻す */
export async function setRenderDecision(r: RenderRow, decision: RenderDecision, note: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase 未設定');
  if (decision === 'adopted') {
    const { error } = await supabase.from('pilot_renders').update({ decision: 'candidate' })
      .eq('token', r.token).eq('purpose', r.purpose).eq('decision', 'adopted').neq('id', r.id);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from('pilot_renders').update({ decision, note: note.trim() || null }).eq('id', r.id);
  if (error) throw new Error(error.message);
}
