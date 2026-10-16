// 事前アンケート（本人の自己認識）
// 設計図の数値には出ないもの（自己像・他者像・目的・目の形・髪の予定）を本人から聞く。
// 回答は pilot_survey、挙がった「似ている人」は pilot_reference_people に入り、
// スタッフが参照写真を測定して本人の設計図と並べる（参照データベースの最初の中身になる）。

import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';

export type SurveyQuestionType = 'text' | 'textarea' | 'single' | 'multi' | 'people';

export interface SurveyQuestion {
  id: string;
  no: number;
  title: string;
  help?: string;
  type: SurveyQuestionType;
  options?: string[];
  /** type=multi/single で「その他」自由記入を許す */
  other?: boolean;
  /** type=people のとき、参照の種類 */
  refKind?: ReferenceKind;
}

/** 本人がアンケートで挙げる3種類＋運営が見る人（staff_say。本人側には出さない） */
export type ReferenceKind = 'self_happy' | 'others_say' | 'dislike' | 'staff_say';

export const REFERENCE_KIND_LABEL: Record<ReferenceKind, string> = {
  self_happy: '言われると嬉しい人',
  others_say: '周りが言う人',
  dislike: '言われて嫌だった人',
  staff_say: '運営が見る人',
};

/** 質問は id で保存されるので、文言を直しても id は変えないこと */
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: 'like', no: 1, type: 'textarea', title: '自分の顔で好きなところ', help: 'いくつでも' },
  { id: 'dislike', no: 2, type: 'textarea', title: '自分の顔で気になるところ、嫌いなところ' },
  { id: 'ref_self_happy', no: 3, type: 'people', refKind: 'self_happy',
    title: '「似ている」と言われると嬉しい人', help: '芸能人など、何人でも。一人につき一枚、真正面の写真を一緒に送ってください。' },
  { id: 'ref_others_say', no: 4, type: 'people', refKind: 'others_say',
    title: '周りの人からよく「似ている」と言われる人', help: '自分では思っていなくてもOK。こちらも一人一枚、真正面の写真を。' },
  { id: 'ref_dislike', no: 5, type: 'people', refKind: 'dislike',
    title: '言われて嫌だった「似ている人」がいれば', help: '写真はなくて構いません。' },
  { id: 'impression', no: 6, type: 'multi', other: true,
    title: '公式写真で、どんな雰囲気に見られたいですか', help: '3つまで',
    options: ['清楚', '強い', 'かわいい', '知的', '親しみやすい', '大人っぽい', '元気', '上品'] },
  { id: 'makeup_level', no: 7, type: 'single',
    title: '普段のメイクはどのくらいですか',
    options: ['ほぼしない', 'ナチュラル', 'しっかり', '日によって違う'] },
  { id: 'eyelid', no: 8, type: 'single', title: '目について当てはまるもの',
    options: ['一重', '奥二重', '二重', '左右で違う'] },
  { id: 'color_contact', no: 8, type: 'single', title: 'カラコンを普段使うか',
    options: ['使う', 'たまに', '使わない'] },
  { id: 'lash_ext', no: 8, type: 'single', title: 'まつ毛エクステをしているか',
    options: ['していない', 'している（撮影日まで付けたまま）', 'している（撮影日までに外す）', 'している（未定）'] },
  { id: 'false_lash', no: 8, type: 'single', title: 'つけまつげを使ったことがあるか',
    options: ['よく使う', 'たまに', '使ったことがない'] },
  { id: 'hair_plan', no: 9, type: 'textarea',
    title: '撮影日までに髪型・髪色・眉を変える予定がありますか', help: 'あれば内容と時期。なければ「なし」' },
  { id: 'no_touch', no: 10, type: 'textarea',
    title: 'メイクで絶対に触ってほしくないところ、または使えない化粧品があれば' },
];

export interface ReferencePerson {
  id: string;
  kind: ReferenceKind;
  person_name: string;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  source_note?: string | null;
  /** 端末上のプレビュー（未送信の画像） */
  localDataUrl?: string;
  /** 運営が写真を測った値（本人の比較表示に使う。未測定なら null） */
  metrics?: Record<string, number> | null;
  measured_at?: string | null;
}

export type SurveyAnswers = Record<string, string | string[]>;

export interface SurveyData {
  subject_code: string;
  answers: SurveyAnswers;
  submitted_at: string | null;
  references: ReferencePerson[];
}

export async function fetchSurvey(token: string): Promise<SurveyData | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  await ensureAnonymousSession();
  const { data, error } = await supabase.rpc('pilot_survey_get', { p_token: token });
  if (error || !data) return null;
  return data as SurveyData;
}

/** 画像を長辺 maxSide px に縮小（縦横比は変えない）して JPEG dataURL にする */
export async function shrinkImage(file: File, maxSide = 1600): Promise<{ dataUrl: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), width: w, height: h };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

/** 参照写真を <token>/survey/ に上げ、回答と参照を保存する */
export async function submitSurvey(token: string, answers: SurveyAnswers, refs: ReferencePerson[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: 'Supabase 未設定' };
  const uid = await ensureAnonymousSession();
  if (!uid) return { ok: false, error: '匿名セッションを取得できません' };

  const out: Omit<ReferencePerson, 'localDataUrl'>[] = [];
  for (const r of refs) {
    if (!r.person_name.trim()) continue;
    let image_path = r.image_path ?? null;
    if (!image_path && r.localDataUrl) {
      const blob = dataUrlToBlob(r.localDataUrl);
      const path = `${token}/survey/${r.kind}_${r.id}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('pilot-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) return { ok: false, error: `写真の送信に失敗: ${error.message}` };
      image_path = path;
    }
    out.push({ id: r.id, kind: r.kind, person_name: r.person_name.trim(), image_path, image_width: r.image_width ?? null, image_height: r.image_height ?? null, source_note: r.source_note ?? null });
  }
  const { error } = await supabase.rpc('pilot_survey_submit', { p_token: token, p_answers: answers, p_references: out });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── スタッフ用（is_pilot_staff の SELECT ポリシーで読む） ─────────────

export interface StaffReferenceRow {
  id: string;
  token: string;
  subject_code: string;
  kind: ReferenceKind;
  person_name: string;
  image_path: string | null;
  source_note: string | null;
  metrics: Record<string, number> | null;
  framing: { yaw?: number; roll?: number; ok?: boolean; warnings?: string[] } | null;
  measured_at: string | null;
  measured_by: string | null;
  /** 運営が見る人（staff_say）を登録した人のメール */
  added_by?: string | null;
}

export interface StaffSurveyRow {
  token: string;
  subject_code: string;
  answers: SurveyAnswers;
  submitted_at: string;
  updated_at: string;
}

/** 1人分のアンケート回答と「似ている人」 */
export async function fetchSurveyForStaff(token: string): Promise<{ survey: StaffSurveyRow | null; refs: StaffReferenceRow[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { survey: null, refs: [] };
  const [s, r] = await Promise.all([
    supabase.from('pilot_survey').select('*').eq('token', token).maybeSingle(),
    supabase.from('pilot_reference_people').select('*').eq('token', token).order('created_at'),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (r.error) throw new Error(r.error.message);
  return { survey: (s.data as StaffSurveyRow | null) ?? null, refs: (r.data ?? []) as StaffReferenceRow[] };
}

/** 全員分（一覧の印・Excel 用） */
export async function fetchAllSurveysForStaff(): Promise<{ surveys: StaffSurveyRow[]; refs: StaffReferenceRow[] }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { surveys: [], refs: [] };
  const [s, r] = await Promise.all([
    supabase.from('pilot_survey').select('*').range(0, 999),
    supabase.from('pilot_reference_people').select('*').order('created_at').range(0, 1999),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (r.error) throw new Error(r.error.message);
  return { surveys: (s.data ?? []) as StaffSurveyRow[], refs: (r.data ?? []) as StaffReferenceRow[] };
}

export function newReferenceId(subjectCode: string) {
  return `ref_${subjectCode}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 打ち合わせシート用：回答を「質問→答え」の行に平らにする */
export function flattenAnswers(answers: SurveyAnswers): { no: number; title: string; answer: string }[] {
  return SURVEY_QUESTIONS.filter(q => q.type !== 'people').map(q => {
    const v = answers[q.id];
    const base = Array.isArray(v) ? v.join('、') : (v ?? '');
    // 「その他」の自由記入（<id>_other）も同じ行に入れる
    const other = q.other ? String(answers[`${q.id}_other`] ?? '').trim() : '';
    const answer = [base, other && `その他：${other}`].filter(Boolean).join('、');
    return { no: q.no, title: q.title, answer };
  });
}

/**
 * 運営が見る人（staff_say）を登録する。写真は縦横比を変えずに縮小して <token>/survey/staff_ 配下に置く。
 * 登録した人のメールはデータベース側で added_by に残る。戻り値はエラー文（成功なら null）
 */
export async function addStaffReference(token: string, personName: string, file: File | null, sourceNote: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'Supabase 未設定';
  let path: string | null = null, w: number | null = null, h: number | null = null;
  if (file) {
    const s = await shrinkImage(file, 1600);
    path = `${token}/survey/staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from('pilot-photos').upload(path, dataUrlToBlob(s.dataUrl), { contentType: 'image/jpeg' });
    if (error) return `写真を保存できませんでした（${error.message}）`;
    w = s.width; h = s.height;
  }
  const { error } = await supabase.rpc('pilot_staff_add_reference', {
    p_token: token, p_person_name: personName, p_image_path: path ?? '', p_image_width: w, p_image_height: h, p_source_note: sourceNote,
  });
  if (error) {
    if (path) await supabase.storage.from('pilot-photos').remove([path]);
    return `登録できませんでした（${error.message}）`;
  }
  return null;
}
