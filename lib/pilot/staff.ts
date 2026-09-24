// 運営（スタッフ）用。メールのログインリンクでログインし、許可リスト（pilot_staff）にある人だけが
// 全員の記録と写真を読める（判定はデータベースの is_pilot_staff() とアクセスの決まりで行う）。

import { getSupabaseClient } from '@/lib/supabaseClient';
import { toHistoryItem, type PilotHistoryItem } from './pilotStorage';

export type StaffState = { kind: 'signedOut' } | { kind: 'notStaff'; email: string } | { kind: 'staff'; email: string };

export async function getStaffState(): Promise<StaffState> {
  const supabase = getSupabaseClient();
  if (!supabase) return { kind: 'signedOut' };
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user || user.is_anonymous || !user.email) return { kind: 'signedOut' };
  const { data } = await supabase.rpc('is_pilot_staff');
  return data === true ? { kind: 'staff', email: user.email } : { kind: 'notStaff', email: user.email };
}

/** ログイン用リンクをメールで送る。失敗時はエラーメッセージ */
export async function sendStaffLoginLink(email: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return 'Supabase 未設定';
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/?staff=1`, shouldCreateUser: true },
  });
  return error ? error.message : null;
}

export async function staffSignOut() {
  await getSupabaseClient()?.auth.signOut();
}

/** 一定時間で諦める（ログイン情報の読み込みが他のタブと取り合いになって止まることがある） */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** この端末に残っているログイン情報を消して読み込み直す（止まったときの最終手段） */
export function resetLocalAuth() {
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.includes('auth-token')).forEach(k => localStorage.removeItem(k)); } catch { /* noop */ }
  window.location.replace(`${window.location.origin}/?staff=1`);
}

export interface ParticipantSummary {
  token: string;
  subjectCode: string;
  /** 名前（スタッフだけが見る） */
  name: string;
  isMinor: boolean | null;
  consentedAt: string | null;
  consentBy: string | null;
  count: number;
  beforeCount: number;
  afterCount: number;
  sessions: number;
  lastAt: string | null;
}

const jstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

export async function listParticipants(): Promise<ParticipantSummary[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data: ps, error } = await supabase.from('pilot_participants')
    .select('token, subject_code, display_name, is_minor, consented_at, consent_by').order('subject_code');
  if (error || !ps) throw new Error(error?.message ?? '読み込めませんでした');

  // 記録は最大 40名×30枚。1回の取得上限（1000行）を超えるので分けて読む
  const rows: { participant_token: string; phase: string; taken_at: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: e2 } = await supabase.from('pilot_records')
      .select('participant_token, phase, taken_at').not('participant_token', 'is', null)
      .order('taken_at').range(from, from + 999);
    if (e2) throw new Error(e2.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  return ps.map(p => {
    const mine = rows.filter(r => r.participant_token === p.token);
    return {
      token: p.token, subjectCode: p.subject_code, name: p.display_name ?? '', isMinor: p.is_minor, consentedAt: p.consented_at, consentBy: p.consent_by,
      count: mine.length,
      beforeCount: mine.filter(r => r.phase === 'before').length,
      afterCount: mine.filter(r => r.phase === 'after').length,
      sessions: new Set(mine.map(r => jstDate(r.taken_at))).size,
      lastAt: mine.length ? mine[mine.length - 1].taken_at : null,
    };
  });
}

/** 貼り付けた名簿を読む。1行1人。行末に「未成年」または「*」があれば未成年 */
export function parseRoster(text: string): { name: string; isMinor: boolean }[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const isMinor = /(未成年|＊|\*)\s*$/.test(l);
    const name = l.replace(/[,，、\t\s]*(未成年|＊|\*)\s*$/, '').replace(/[,，、\t]+$/, '').trim();
    return { name, isMinor };
  }).filter(r => r.name);
}

/** 参加者をまとめて登録する。コードは F01, F02 … と空いている番号から振る */
export async function registerParticipants(roster: { name: string; isMinor: boolean }[], existingCodes: string[]): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || roster.length === 0) return 0;
  let n = existingCodes.reduce((m, c) => { const x = /^F(\d+)$/.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  const rows = roster.map(r => ({ subject_code: `F${String(++n).padStart(2, '0')}`, display_name: r.name, is_minor: r.isMinor }));
  const { error } = await supabase.from('pilot_participants').insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function updateParticipant(token: string, patch: { name?: string; isMinor?: boolean }) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.display_name = patch.name.trim() || null;
  if (patch.isMinor !== undefined) row.is_minor = patch.isMinor;
  const { error } = await supabase.from('pilot_participants').update(row).eq('token', token);
  if (error) throw new Error(error.message);
}

export async function getParticipantHistory(token: string): Promise<PilotHistoryItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('pilot_records')
    .select('id, phase, taken_at, image_path, blueprint_path, metrics, target_card, prescription, karte, framing')
    .eq('participant_token', token).order('taken_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map(toHistoryItem);
}

export async function staffMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  if (!supabase || paths.length === 0) return {};
  const { data } = await supabase.storage.from('pilot-photos').createSignedUrls(paths, 600);
  return Object.fromEntries((data ?? []).filter(d => d.signedUrl && d.path).map(d => [d.path as string, d.signedUrl]));
}
