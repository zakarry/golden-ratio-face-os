// 運営ページ用の寄せ方（yosekata.ts の計算を、参加者の記録と「似ている人」につなぐ）
// 本人＝写り○かつ傾き 8〜20°かつ近すぎない「メイク前」の記録の中央値、目標＝黄金比＋測定済みの似ている人全員。

import { getSupabaseClient } from '@/lib/supabaseClient';
import { METRIC_DEFS, type PilotMetrics } from './targetCard';
import { retakeStatus, usableBefore, type RetakeStatus } from './pilotStorage';
import type { StaffReferenceRow } from './survey';
import { buildYosekata, summarizeYosekata, PILOT_PURPOSE, SMARTPHONE_YOSE_CORRECTION, YOSEKATA_VERSION, type YosePurpose, type YoseResult, type YoseSummaryRow } from './yosekata';

export interface YoseSubjectRecord {
  id: string;
  phase: string;
  taken_at?: string;
  takenAt?: string;
  metrics: PilotMetrics | Record<string, number> | null;
  framing: { ok?: boolean; pitch?: number; faceWidthFrac?: number; warnings?: string[] } | null;
}


export interface YoseSubject {
  /** 使った記録のうちいちばん新しいもの（保存の record_id と写真に使う） */
  id: string;
  takenAt: string;
  /** 中央値を取った記録の数 */
  count: number;
  /** 写り○かつ傾き 8〜20° のメイク前の記録の中央値（指標ごと） */
  metrics: PilotMetrics;
}

const when = (r: YoseSubjectRecord) => r.taken_at ?? r.takenAt ?? '';

/**
 * 寄せ方・束ね表で使う「本人の値」。写り○かつ傾き 8〜20° のメイク前の記録の中央値。
 * retake：本人の値に使えるメイク前が1枚もないとき、その理由（写り×だけ／傾きが範囲外だけ／メイク前なし）
 */
export function yoseSubjectFromRecords(records: YoseSubjectRecord[]): { subject: YoseSubject | null; retake: RetakeStatus | null } {
  // 写り○かつ傾き 8〜20°かつ顔の大きさが基準内（近すぎない）のメイク前だけ
  const use = records.filter(r => r.metrics && usableBefore(r)).sort((a, b) => when(a).localeCompare(when(b)));
  if (!use.length) return { subject: null, retake: retakeStatus(records) };
  const metrics = {} as PilotMetrics;
  for (const d of METRIC_DEFS) {
    const v = use.map(r => (r.metrics as Record<string, number>)[d.id]).filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
    const n = v.length;
    metrics[d.id] = n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : NaN;
  }
  const last = use[use.length - 1];
  return { subject: { id: last.id, takenAt: when(last), count: use.length, metrics }, retake: null };
}

export interface YoseBundle {
  /** 先頭が黄金比、そのあとに似ている人（種類順・登録順） */
  results: { result: YoseResult; referenceId: string | null }[];
  /** 似ている人どうしの束ね（黄金比は入れない） */
  summary: YoseSummaryRow[];
}

const KIND_ORDER = ['self_happy', 'others_say', 'dislike', 'staff_say'];

/** パイロットの記録はスマホ撮影なので、黄金比と比べるときは目間距離に −0.014 の補正を入れる */
export function buildYoseBundle(code: string, self: PilotMetrics, refs: StaffReferenceRow[], purpose: YosePurpose = PILOT_PURPOSE): YoseBundle {
  const opts = { selfCorrection: SMARTPHONE_YOSE_CORRECTION, purpose };
  const measured = refs.filter(r => r.metrics).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const results = [
    { result: buildYosekata(code, self, { name: '黄金比', kind: 'ideal', metrics: null }, opts), referenceId: null },
    ...measured.map(r => ({ result: buildYosekata(code, self, { name: r.person_name, kind: r.kind, metrics: r.metrics as unknown as PilotMetrics }, opts), referenceId: r.id })),
  ];
  const people = results.slice(1).map(x => x.result);
  return { results, summary: people.length ? summarizeYosekata(people) : [] };
}

/** 保存の id。版や目的が変わったら別の行として残す（同じ版・同じ目的の再保存だけ上書き） */
export function yoseId(recordId: string, referenceId: string | null, purpose?: string) {
  return `yose_${recordId}_${referenceId ?? 'ideal'}_${YOSEKATA_VERSION}${purpose ? `_${purpose}` : ''}`;
}

export async function saveYosekata(recordId: string, items: YoseBundle['results']): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'Supabase 未設定';
  for (const { result, referenceId } of items) {
    const { error } = await supabase.rpc('pilot_staff_save_yosekata', {
      p_id: yoseId(recordId, referenceId, result.config.purpose), p_record_id: recordId, p_reference_id: referenceId ?? '',
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
