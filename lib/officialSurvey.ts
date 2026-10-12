// 公式版の事前アンケート（「なりたい顔から」で答える）
// 質問は専用リンク版と同じ SURVEY_QUESTIONS。似ている人（3〜5）は名前だけ（写真なし。将来は参照DBから選ぶ）。
// 回答はこの端末に置き、顔カルテ（face_karte_records の Face Identity＝baseline）に survey として載せて中央にも残す。

import type { FaceKarteRecord } from '@/types/karte';
import type { ReferenceKind, SurveyAnswers } from '@/lib/pilot/survey';

export interface OfficialSurveyPerson {
  id: string;
  kind: ReferenceKind;
  person_name: string;
}

export interface OfficialSurvey {
  answers: SurveyAnswers;
  references: OfficialSurveyPerson[];
  submitted_at: string;
}

const KEY = 'face_survey';

export function getOfficialSurvey(): OfficialSurvey | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as OfficialSurvey;
  } catch { /* 壊れていたら無いものとして扱う */ }
  return null;
}

/** 保存して、顔カルテ（baseline）があればそこにも載せる（saveFaceKarteRecord が中央にも送る） */
export async function saveOfficialSurvey(answers: SurveyAnswers, references: OfficialSurveyPerson[]): Promise<OfficialSurvey> {
  const data: OfficialSurvey = {
    answers,
    references: references.filter(r => r.person_name.trim()).map(r => ({ id: r.id, kind: r.kind, person_name: r.person_name.trim() })),
    submitted_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(data));
  const { getBaselineRecord, saveFaceKarteRecord } = await import('@/lib/karteStorage');
  const baseline = getBaselineRecord();
  if (baseline) saveFaceKarteRecord({ ...baseline, survey: data });
  window.dispatchEvent(new Event('face-survey-updated'));
  return data;
}

/** baseline を保存するとき、回答済みのアンケートを一緒に載せる */
export function withOfficialSurvey(record: FaceKarteRecord): FaceKarteRecord {
  if (record.recordType !== 'baseline' || record.survey) return record;
  const s = getOfficialSurvey();
  return s ? { ...record, survey: s } : record;
}

export function surveyNames(s: OfficialSurvey | null, kind: ReferenceKind): string[] {
  return s ? s.references.filter(r => r.kind === kind).map(r => r.person_name) : [];
}
