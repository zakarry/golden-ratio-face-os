// 運営ページ用の寄せ方（yosekata.ts の計算を、参加者の記録と「似ている人」につなぐ）
// 本人＝写り○（framing.ok）の最新の「メイク前」、目標＝黄金比＋測定済みの似ている人全員。

import { getSupabaseClient } from '@/lib/supabaseClient';
import type { PilotMetrics } from './targetCard';
import type { StaffReferenceRow } from './survey';
import { buildYosekata, summarizeYosekata, YOSEKATA_VERSION, type YoseResult, type YoseSummaryRow } from './yosekata';

export interface YoseSubjectRecord {
  id: string;
  phase: string;
  taken_at?: string;
  takenAt?: string;
  metrics: PilotMetrics | Record<string, number> | null;
  framing: { ok?: boolean } | null;
}

/** 写り○の最新の before 記録（無ければ null） */
export function pickYoseSubject<T extends YoseSubjectRecord>(records: T[]): T | null {
  const ok = records.filter(r => r.phase === 'before' && r.framing?.ok === true && r.metrics);
  ok.sort((a, b) => (a.taken_at ?? a.takenAt ?? '').localeCompare(b.taken_at ?? b.takenAt ?? ''));
  return ok[ok.length - 1] ?? null;
}

export interface YoseBundle {
  /** 先頭が黄金比、そのあとに似ている人（種類順・登録順） */
  results: { result: YoseResult; referenceId: string | null }[];
  /** 似ている人どうしの束ね（黄金比は入れない） */
  summary: YoseSummaryRow[];
}

const KIND_ORDER = ['self_happy', 'others_say', 'dislike'];

export function buildYoseBundle(code: string, self: PilotMetrics, refs: StaffReferenceRow[]): YoseBundle {
  const measured = refs.filter(r => r.metrics).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const results = [
    { result: buildYosekata(code, self, { name: '黄金比', kind: 'ideal', metrics: null }), referenceId: null },
    ...measured.map(r => ({ result: buildYosekata(code, self, { name: r.person_name, kind: r.kind, metrics: r.metrics as unknown as PilotMetrics }), referenceId: r.id })),
  ];
  const people = results.slice(1).map(x => x.result);
  return { results, summary: people.length ? summarizeYosekata(people) : [] };
}

/** 保存の id。版が変わったら別の行として残す（同じ版の再保存だけ上書き） */
export function yoseId(recordId: string, referenceId: string | null) {
  return `yose_${recordId}_${referenceId ?? 'ideal'}_${YOSEKATA_VERSION}`;
}

export async function saveYosekata(recordId: string, items: YoseBundle['results']): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'Supabase 未設定';
  for (const { result, referenceId } of items) {
    const { error } = await supabase.rpc('pilot_staff_save_yosekata', {
      p_id: yoseId(recordId, referenceId), p_record_id: recordId, p_reference_id: referenceId ?? '',
      p_target_kind: result.targetKind, p_target_name: result.targetName,
      p_result: result, p_text: result.text, p_version: result.config.version,
    });
    if (error) return error.message;
  }
  return null;
}

export interface SavedYoseRow {
  id: string;
  record_id: string;
  reference_id: string | null;
  target_kind: string;
  target_name: string;
  text: string;
  version: string;
  created_by: string | null;
  created_at: string;
}

export async function listSavedYosekata(subjectCode: string): Promise<SavedYoseRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('pilot_yosekata')
    .select('id, record_id, reference_id, target_kind, target_name, text, version, created_by, created_at')
    .eq('subject_code', subjectCode).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedYoseRow[];
}

/** 撮影記録の顔の位置（写真に三角形を描くため） */
export async function fetchRecordGuide(recordId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('pilot_records').select('guide, image_path').eq('id', recordId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as { guide: import('@/lib/faceLandmarks').DetectedGuide | null; image_path: string | null } | null;
}
