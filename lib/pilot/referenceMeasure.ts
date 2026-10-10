// スタッフ用：参加者が挙げた「似ている人」の写真を測って 12 指標を保存する
// 本人の設計図（pilot_records.metrics）と同じ computePilotMetrics を使うので、そのまま並べられる。

import { detectFaceLandmarks } from '@/lib/faceLandmarks';
import { computePilotMetrics, type PilotMetrics, type MetricId, METRIC_DEFS } from '@/lib/pilot/targetCard';
import { checkFraming, type FramingCheck } from '@/lib/pilot/pilotStorage';
import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';

export interface ReferenceMeasurement {
  metrics: PilotMetrics;
  framing: FramingCheck;
  imageWidth: number;
  imageHeight: number;
}

/** storage のパス（または任意の画像URL/dataURL）から測定する */
export async function measureReferenceImage(src: string): Promise<ReferenceMeasurement | null> {
  const g = await detectFaceLandmarks(src);
  if (!g) return null;
  const w = g.imageWidth ?? 0, h = g.imageHeight ?? 0;
  if (!w || !h) return null;
  return { metrics: computePilotMetrics(g, w, h), framing: checkFraming(g, w, h), imageWidth: w, imageHeight: h };
}

/** storage の private 画像を署名付きURLで取る（スタッフのみ読める） */
export async function signedUrl(path: string, seconds = 600): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  await ensureAnonymousSession();
  const { data, error } = await supabase.storage.from('pilot-photos').createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function saveReferenceMetrics(
  id: string, m: ReferenceMeasurement, sourceNote: string, clearImage: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Supabase 未設定' };
  // 写真を消す場合は、記録から外される前に場所を控えておく
  const before = clearImage
    ? (await supabase.from('pilot_reference_people').select('image_path').eq('id', id).maybeSingle()).data?.image_path as string | null | undefined
    : null;
  const { error } = await supabase.rpc('pilot_staff_set_reference_metrics', {
    p_id: id, p_metrics: m.metrics, p_framing: m.framing, p_source_note: sourceNote, p_clear_image: clearImage,
  });
  if (error) return { ok: false, error: error.message };
  if (clearImage && before) {
    // 画像は測定後に消す（権利面）。失敗しても metrics は残る
    const { error: rmErr } = await supabase.storage.from('pilot-photos').remove([before]);
    if (rmErr) return { ok: true, error: `測定値は保存しました。写真の削除に失敗しました（${rmErr.message}）` };
  }
  return { ok: true };
}

/** 本人と参照を並べた比較行。差は「本人 − 参照」 */
export function compareMetrics(subject: PilotMetrics, ref: PilotMetrics) {
  const keys: MetricId[] = ['eyeDist', 'eyeWidth', 'eyeAngle', 'pupilPos', 'zone2', 'zone3', 'philtrum', 'faceRatio'];
  return keys.map(k => {
    const def = METRIC_DEFS.find(d => d.id === k)!;
    const diff = subject[k] - ref[k];
    const close = Math.abs(diff) <= (def.unit === '°' ? 2 : 0.02);
    return { id: k, label: def.label, subject: subject[k], ref: ref[k], ideal: def.ideal, diff, close, unit: def.unit, forehead: !!def.dependsOnForehead };
  });
}
