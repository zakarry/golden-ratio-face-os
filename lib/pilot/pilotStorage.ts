// パイロット記録の保存
// 端末（localStorage）に必ず保存し、Supabase（pilot_records + storage: pilot-photos）に写す。
// 写真は後日の照合に必要なので、パイロットでは画像も保存する（本人同意のうえ）。
// 参加者は専用URLのトークンだけを持つ。書き込みは pilot_submit、読み出しは pilot_lookup（本人分のみ）。

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
  token: string;
  subjectCode: string;
  phase: PilotPhase;
  takenAt: string;
  event: string;
  consent: boolean;
  isMinor: boolean;
  guardianName?: string;
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

const LS_KEY = 'face_os_pilot_records_v2';
export const PILOT_APP_VERSION = 'pilot-self-2026-09-24';

export function getPilotRecords(token?: string): PilotRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY); const a = raw ? JSON.parse(raw) : [];
    const all: PilotRecord[] = Array.isArray(a) ? a : [];
    return token ? all.filter(r => r.token === token) : all;
  } catch { return []; }
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

export function findLocalBefore(token: string): PilotRecord | null {
  return getPilotRecords(token).find(r => r.phase === 'before') ?? null;
}

export function newPilotId(subjectCode: string, phase: PilotPhase) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `pilot_${subjectCode}_${phase}_${stamp}_${rand}`;
}

/** 専用URLのトークン（?p=）。一度開けば端末に記憶し、次回は普通のURLからでも続きができる */
const TOKEN_KEY = 'face_os_pilot_token_v1';
export function readPilotToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('p');
  if (fromUrl) { try { localStorage.setItem(TOKEN_KEY, fromUrl.trim()); } catch { /* noop */ } return fromUrl.trim(); }
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function forgetPilotToken() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ } }
export function savePilotToken(token: string) { try { localStorage.setItem(TOKEN_KEY, token.trim()); } catch { /* noop */ } }

export interface ParticipantInfo {
  subjectCode: string;
  event: string;
  /** 運営が登録した未成年フラグ（未登録なら null） */
  isMinor: boolean | null;
  before: { takenAt: string; metrics: PilotMetrics } | null;
  hasAfter: boolean;
}

/** トークンの持ち主の情報。無効なら null、通信できなければ 'offline' */
export async function lookupParticipant(token: string): Promise<ParticipantInfo | null | 'offline'> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'offline';
  try {
    if (!(await ensureAnonymousSession())) return 'offline';
    const { data, error } = await supabase.rpc('pilot_lookup', { p_token: token });
    if (error) return 'offline';
    if (!data) return null;
    return {
      subjectCode: data.subject_code, event: data.event, isMinor: data.is_minor ?? null,
      before: data.before ? { takenAt: data.before.taken_at, metrics: data.before.metrics } : null,
      hasAfter: !!data.has_after,
    };
  } catch { return 'offline'; }
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

    // 写真はトークン名のフォルダへ「追加」だけ（上書き・閲覧は不可）
    const imagePath = record.imageDataUrl ? `${record.token}/${record.phase}_${record.id}.jpg` : record.imagePath;
    if (record.imageDataUrl && imagePath) {
      const blob = dataUrlToBlob(record.imageDataUrl);
      const { error: upErr } = await supabase.storage.from('pilot-photos').upload(imagePath, blob, { contentType: blob.type, upsert: false });
      // 再送時は前回アップロード済みのことがある
      if (upErr && !/exist|duplicate/i.test(upErr.message)) return { ...record, syncState: 'error', syncError: `写真の保存に失敗: ${upErr.message}` };
    }

    const { error } = await supabase.rpc('pilot_submit', {
      p_token: record.token,
      p_record: {
        id: record.id,
        phase: record.phase,
        taken_at: record.takenAt,
        consent: record.consent,
        is_minor: record.isMinor,
        guardian_name: record.guardianName ?? null,
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
      },
    });
    if (error) return { ...record, imagePath, syncState: 'error', syncError: error.message };
    return { ...record, imagePath, syncState: 'synced', syncError: undefined };
  } catch (e) {
    return { ...record, syncState: 'error', syncError: e instanceof Error ? e.message : String(e) };
  }
}

/** 未同期の記録をまとめて再送 */
export async function resyncPending(token: string): Promise<{ ok: number; ng: number }> {
  const all = getPilotRecords(token);
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
