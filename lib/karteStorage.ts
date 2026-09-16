import type { FaceKarteRecord, KarteRecordType } from '@/types/karte';

const STORAGE_KEY = 'face_karte_records';

// ─── localStorage CRUD ────────────────────────────────────────────────────────

export function getFaceKarteRecords(): FaceKarteRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';

export function saveFaceKarteRecord(record: FaceKarteRecord): void {
  const records = getFaceKarteRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('face-karte-updated'));
  }

  void mirrorToSupabase(record);
}

async function mirrorToSupabase(record: FaceKarteRecord): Promise<void> {
  console.log('[supabase] mirrorToSupabase 開始:', record.id);
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const userId = await ensureAnonymousSession();
    if (!userId) {
      console.warn('[supabase] user idが取得できなかったため中央保存を中止します');
      return;
    }

    const { imageSrc: _imageSrc, guide, analysis, diagnosisSummary, strengths, goldenRatio,
      triangleAnalysis, makeupPlan, beforeAfter, faceYogaPlan, faceYogaSkipped,
      purpose, scene, level, styleId, providerId, note, ...rest } = record;

    const { error } = await supabase.from('face_karte_records').upsert({
      id: rest.id,
      user_id: userId,
      date: rest.date,
      record_type: rest.recordType,
      image_url: null,
      guide: guide ?? null,
      analysis,
      diagnosis_summary: diagnosisSummary ?? null,
      strengths: strengths ?? null,
      golden_ratio: goldenRatio ?? null,
      triangle_analysis: triangleAnalysis ?? null,
      makeup_plan: makeupPlan ?? null,
      before_after: beforeAfter ?? null,
      face_yoga_plan: faceYogaPlan ?? null,
      face_yoga_skipped: faceYogaSkipped ?? null,
      purpose: purpose ?? null,
      scene: scene ?? null,
      level: level ?? null,
      style_id: styleId ?? null,
      provider_id: providerId ?? null,
      note: note ?? null,
    });

    if (error) {
      console.error('[supabase] karte mirror write returned an error:', error.message, error);
      return;
    }
    console.log('[supabase] karte mirror write 成功:', record.id);
  } catch (err) {
    console.warn('[supabase] karte mirror write failed:', err);
  }
}

export function deleteFaceKarteRecord(id: string): void {
  const records = getFaceKarteRecords().filter(r => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getBaselineRecord(): FaceKarteRecord | null {
  const records = getFaceKarteRecords();
  return records.find(r => r.recordType === 'baseline') ?? null;
}

export function getLatestByType(type: KarteRecordType): FaceKarteRecord | null {
  const records = getFaceKarteRecords();
  return records.find(r => r.recordType === type) ?? null;
}

export function hasTodayRecord(type: KarteRecordType): boolean {
  const record = getLatestByType(type);
  if (!record) return false;
  const today = new Date();
  const recordDate = new Date(record.date);
  return (
    recordDate.getFullYear() === today.getFullYear() &&
    recordDate.getMonth() === today.getMonth() &&
    recordDate.getDate() === today.getDate()
  );
}

// ─── Supabase stubs (future) ──────────────────────────────────────────────────

export async function saveToSupabase(_record: FaceKarteRecord): Promise<void> {
  console.warn('saveToSupabase: not yet implemented');
}

export async function getRecordsFromSupabase(_userId: string): Promise<FaceKarteRecord[]> {
  console.warn('getRecordsFromSupabase: not yet implemented');
  return [];
}

// ─── Record builder ───────────────────────────────────────────────────────────

import type { AnalysisResult } from '@/types/analysis';
import type { MakeupPlan, BeforeAfter, FaceYogaPlan, MakeupPurpose, FaceDesignerProviderId } from '@/types/karte';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { UserLevel } from '@/types/userLevel';
import type { StyleId } from '@/lib/idealStyleChoices';

export function buildKarteRecord(
  type: KarteRecordType,
  analysis: AnalysisResult,
  options: { makeupPlan?: MakeupPlan; beforeAfter?: BeforeAfter; note?: string; faceYogaPlan?: FaceYogaPlan; faceYogaSkipped?: boolean; purpose?: MakeupPurpose; scene?: string; imageSrc?: string; guide?: DetectedGuide; level?: UserLevel; styleId?: StyleId; providerId?: FaceDesignerProviderId } = {},
): FaceKarteRecord {
  return {
    id: `karte_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: new Date().toISOString(),
    recordType: type,
    imageSrc: options.imageSrc,
    guide: options.guide,
    analysis,
    diagnosisSummary: buildDiagnosisSummary(analysis),
    strengths: analysis.strengths.map(s => s.feature),
    goldenRatio: {
      faceRatio:     analysis.goldenRatio.faceRatio.measured,
      eyePosition:   analysis.goldenRatio.eyePositionRatio.measured,
      mouthPosition: analysis.goldenRatio.mouthPositionRatio.measured,
    },
    triangleAnalysis: {
      type:  analysis.triangleAnalysis.type,
      label: analysis.triangleAnalysis.label,
      ratio: analysis.triangleAnalysis.ratio,
    },
    makeupPlan:  options.makeupPlan,
    beforeAfter: options.beforeAfter,
    faceYogaPlan: options.faceYogaPlan,
    faceYogaSkipped: options.faceYogaSkipped,
    purpose:     options.purpose,
    scene:       options.scene,
    level:       options.level,
    styleId:     options.styleId,
    providerId:  options.providerId,
    note:        options.note,
  };
}

function buildDiagnosisSummary(analysis: AnalysisResult): string[] {
  const d = analysis.diagnosis;
  const items = [
    d.forehead, d.midFace, d.philtrum, d.chin,
    d.eyeDistance, d.eyeLevel, d.eyeWidth, d.jawline,
  ];
  return items
    .filter(i => i.tone !== 'neutral')
    .map(i => `${i.label}：${i.display}`);
}
