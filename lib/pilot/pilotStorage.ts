// パイロット記録の保存
// 端末（localStorage）に必ず保存し、Supabase（pilot_records + storage: pilot-photos）に写す。
// 写真は後日の照合に必要なので、パイロットでは画像も保存する（本人同意のうえ）。
// 参加者は専用URLのトークンだけを持つ。書き込みは pilot_submit、読み出しは pilot_lookup（本人分のみ）。

import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { PilotMetrics, TargetCard } from './targetCard';
export type { PilotMetrics, TargetCard };
import type { Prescription } from './prescription';
import type { FaceKarteRecord } from '@/types/karte';

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
  blueprintDataUrl?: string;  // 顔の設計図（写真＋黄金比の線）。送信後は端末から消す
  blueprintPath?: string;
  /** 顔カルテ（強み・顔印象タイプ・黄金比参考値など。画像は含めない） */
  karte?: Omit<FaceKarteRecord, 'imageSrc'>;
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
export const PILOT_APP_VERSION = 'pilot-continuous-2026-09-25';

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
    const slim = records.map(r => ({ ...r, imageDataUrl: undefined, blueprintDataUrl: undefined }));
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

/** サーバーに保存済みの1回分の撮影（本人・スタッフの履歴表示用） */
export interface PilotHistoryItem {
  id: string;
  phase: PilotPhase;
  takenAt: string;
  /** 撮影日（日本時間 YYYY-MM-DD）。同じ日が同じ「回」 */
  sessionDate: string;
  imagePath: string | null;
  blueprintPath: string | null;
  metrics: PilotMetrics;
  targetCard: TargetCard;
  prescription: Prescription | null;
  karte: Omit<FaceKarteRecord, 'imageSrc'> | null;
  framing: FramingCheck | null;
}

export interface ParticipantInfo {
  subjectCode: string;
  event: string;
  /** 運営が登録した未成年フラグ（未登録なら null） */
  isMinor: boolean | null;
  /** 同意済みなら日時（同意は1人1回） */
  consentedAt: string | null;
  consentBy: 'self' | 'guardian' | null;
  count: number;
  limit: number;
  history: PilotHistoryItem[];
}

/** pilot_lookup の history 要素 / pilot_records の行 → PilotHistoryItem */
export function toHistoryItem(r: any): PilotHistoryItem {
  return {
    id: r.id, phase: r.phase, takenAt: r.taken_at,
    sessionDate: r.session_date ?? new Date(new Date(r.taken_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10),
    imagePath: r.image_path ?? null, blueprintPath: r.blueprint_path ?? null,
    metrics: r.metrics, targetCard: r.target_card, prescription: r.prescription ?? null, karte: r.karte ?? null, framing: r.framing ?? null,
  };
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
      consentedAt: data.consented_at ?? null, consentBy: data.consent_by ?? null,
      count: data.count ?? 0, limit: data.limit ?? 30,
      history: Array.isArray(data.history) ? data.history.map(toHistoryItem) : [],
    };
  } catch { return 'offline'; }
}

/** 同意を記録する（1人1回）。失敗時はエラーメッセージ */
export async function recordConsent(token: string, isMinor: boolean, guardianName: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'Supabase 未設定';
  try {
    if (!(await ensureAnonymousSession())) return '通信できませんでした';
    const { error } = await supabase.rpc('pilot_consent', { p_token: token, p_is_minor: isMinor, p_guardian_name: guardianName });
    return error ? error.message : null;
  } catch (e) { return e instanceof Error ? e.message : String(e); }
}

/** 本人の画像を見るための署名付きURL（10分有効）。path → url */
export async function fetchOwnMediaUrls(token: string, paths: string[]): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase || paths.length === 0) return {};
  try {
    if (!(await ensureAnonymousSession())) return {};
    const { data, error } = await supabase.functions.invoke('pilot-media', { body: { token, paths } });
    if (error || !data?.urls) return {};
    return data.urls as Record<string, string>;
  } catch { return {}; }
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

    // 写真と設計図はトークン名のフォルダへ「追加」だけ（上書き・閲覧は不可）
    const upload = async (dataUrl: string, path: string) => {
      const blob = dataUrlToBlob(dataUrl);
      const { error: upErr } = await supabase.storage.from('pilot-photos').upload(path, blob, { contentType: blob.type, upsert: false });
      // 再送時は前回アップロード済みのことがある
      return upErr && !/exist|duplicate/i.test(upErr.message) ? upErr.message : null;
    };
    const imagePath = record.imageDataUrl ? `${record.token}/${record.phase}_${record.id}.jpg` : record.imagePath;
    if (record.imageDataUrl && imagePath) {
      const err = await upload(record.imageDataUrl, imagePath);
      if (err) return { ...record, syncState: 'error', syncError: `写真の保存に失敗: ${err}` };
    }
    const blueprintPath = record.blueprintDataUrl ? `${record.token}/${record.phase}_${record.id}_blueprint.jpg` : record.blueprintPath;
    if (record.blueprintDataUrl && blueprintPath) {
      const err = await upload(record.blueprintDataUrl, blueprintPath);
      if (err) return { ...record, syncState: 'error', syncError: `設計図の保存に失敗: ${err}` };
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
        blueprint_path: blueprintPath ?? null,
        karte: record.karte ?? null,
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
    if (error) return { ...record, imagePath, blueprintPath, syncState: 'error', syncError: error.message };
    // 送れたら端末の画像は消して容量を空ける（顔カルテ側に写真の控えがある）
    return { ...record, imagePath, blueprintPath, imageDataUrl: undefined, blueprintDataUrl: undefined, syncState: 'synced', syncError: undefined };
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
