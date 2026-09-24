// パイロット記録の保存
// 端末（localStorage）に必ず保存し、Supabase（pilot_records + storage: pilot-photos）に写す。
// 写真は後日の照合に必要なので、パイロットでは画像も保存する（本人同意のうえ）。

import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { PilotMetrics, TargetCard } from './targetCard';
import type { Prescription } from './prescription';

export type PilotPhase = 'before' | 'after';

export interface FramingCheck {
  /** 0=正面。±0.05 以内が目安 */
  yaw: number;
  /** 度。±3° 以内が目安 */
  roll: number;
  /** 画像幅に対する顔幅。0.25 以上が目安 */
  faceWidthFrac: number;
  ok: boolean;
  warnings: string[];
}

export interface PilotRecord {
  id: string;
  subjectCode: string;
  phase: PilotPhase;
  takenAt: string;
  event: string;
  operator: string;
  consent: boolean;
  imageDataUrl?: string;      // 端末保存のみ（Supabase には storage 経由）
  imagePath?: string;         // storage 上のパス
  imageWidth: number;
  imageHeight: number;
  guide: DetectedGuide;
  metrics: PilotMetrics;
  targetCard: TargetCard;
  prescription: Prescription;
  framing: FramingCheck;
  note?: string;
  appVersion: string;
  syncState: 'local' | 'synced' | 'error';
  syncError?: string;
}

const LS_KEY = 'face_os_pilot_records_v1';
export const PILOT_APP_VERSION = 'pilot-2026-09-27';

export function getPilotRecords(): PilotRecord[] {
  if (typeof window === 'undefined') return [];
  try { const raw = localStorage.getItem(LS_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch { return []; }
}

function writeLocal(records: PilotRecord[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {
    // 画像で容量を超えた場合は画像を落として再保存
    const slim = records.map(r => ({ ...r, imageDataUrl: undefined }));
    try { localStorage.setItem(LS_KEY, JSON.stringify(slim)); } catch { /* give up */ }
  }
  window.dispatchEvent(new Event('face-os-pilot-updated'));
}

export function upsertLocal(record: PilotRecord) {
  const all = getPilotRecords();
  const i = all.findIndex(r => r.id === record.id);
  if (i >= 0) all[i] = record; else all.unshift(record);
  writeLocal(all);
}

export function findLocalBefore(subjectCode: string): PilotRecord | null {
  return getPilotRecords().find(r => r.subjectCode === subjectCode && r.phase === 'before') ?? null;
}

export function newPilotId(subjectCode: string, phase: PilotPhase) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `pilot_${subjectCode}_${phase}_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/** Supabase へ写す。成功/失敗を record.syncState に反映して返す */
export async function syncPilotRecord(record: PilotRecord): Promise<PilotRecord> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ...record, syncState: 'error', syncError: 'Supabase 未設定' };
  try {
    const userId = await ensureAnonymousSession();
    if (!userId) return { ...record, syncState: 'error', syncError: '匿名セッションを取得できません' };

    let imagePath = record.imagePath;
    if (!imagePath && record.imageDataUrl) {
      const blob = dataUrlToBlob(record.imageDataUrl);
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      imagePath = `${record.event}/${record.subjectCode}/${record.phase}_${record.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pilot-photos').upload(imagePath, blob, { contentType: blob.type, upsert: true });
      if (upErr) return { ...record, syncState: 'error', syncError: `写真の保存に失敗: ${upErr.message}` };
    }

    const { error } = await supabase.from('pilot_records').upsert({
      id: record.id,
      user_id: userId,
      subject_code: record.subjectCode,
      phase: record.phase,
      taken_at: record.takenAt,
      event: record.event,
      operator: record.operator || null,
      consent: record.consent,
      image_path: imagePath ?? null,
      image_width: record.imageWidth,
      image_height: record.imageHeight,
      guide: record.guide,
      metrics: record.metrics,
      target_card: record.targetCard,
      prescription: record.prescription,
      framing: record.framing,
      note: record.note ?? null,
      app_version: record.appVersion,
    });
    if (error) return { ...record, imagePath, syncState: 'error', syncError: error.message };
    return { ...record, imagePath, syncState: 'synced', syncError: undefined };
  } catch (e) {
    return { ...record, syncState: 'error', syncError: e instanceof Error ? e.message : String(e) };
  }
}

/** 同じ subject_code の「前」を Supabase から探す（他端末で撮った分も拾う） */
export async function fetchBeforeFromSupabase(subjectCode: string, event: string): Promise<PilotRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    await ensureAnonymousSession();
    const { data, error } = await supabase.from('pilot_records')
      .select('*').eq('subject_code', subjectCode).eq('event', event).eq('phase', 'before')
      .order('taken_at', { ascending: false }).limit(1);
    if (error || !data || data.length === 0) return null;
    const r = data[0];
    return {
      id: r.id, subjectCode: r.subject_code, phase: r.phase, takenAt: r.taken_at, event: r.event, operator: r.operator ?? '',
      consent: !!r.consent, imagePath: r.image_path ?? undefined, imageWidth: r.image_width, imageHeight: r.image_height,
      guide: r.guide, metrics: r.metrics, targetCard: r.target_card, prescription: r.prescription, framing: r.framing,
      note: r.note ?? undefined, appVersion: r.app_version ?? '', syncState: 'synced',
    };
  } catch { return null; }
}

/** 未同期の記録をまとめて再送 */
export async function resyncPending(): Promise<{ ok: number; ng: number }> {
  const all = getPilotRecords();
  let ok = 0, ng = 0;
  for (const r of all) {
    if (r.syncState === 'synced') continue;
    const res = await syncPilotRecord(r);
    if (res.syncState === 'synced') ok++; else ng++;
    upsertLocal(res);
  }
  return { ok, ng };
}

export function checkFraming(g: DetectedGuide, imageW: number, imageH: number): FramingCheck {
  const W = (g.faceRightX - g.faceLeftX);
  const mid = (g.faceLeftX + g.faceRightX) / 2;
  const yaw = (g.centerLineX - mid) / W;                       // 0 = 正面
  const roll = Math.atan2((g.rightEyeY - g.leftEyeY) * imageH, (g.rightEyeX - g.leftEyeX) * imageW) * 180 / Math.PI;
  const faceWidthFrac = W; // 0–1 正規化なので画像幅に対する割合
  const warnings: string[] = [];
  if (Math.abs(yaw) > 0.05) warnings.push(yaw > 0 ? '顔が少し左を向いています（本人の右側が見えすぎ）。正面へ' : '顔が少し右を向いています。正面へ');
  if (Math.abs(roll) > 3) warnings.push(`顔が${Math.abs(roll).toFixed(0)}°傾いています。目の高さを水平に`);
  if (faceWidthFrac < 0.25) warnings.push('顔が小さすぎます。もう少し近づいてください');
  if (faceWidthFrac > 0.7) warnings.push('顔が大きすぎます。少し離れてください');
  return { yaw, roll, faceWidthFrac, ok: warnings.length === 0, warnings };
}
