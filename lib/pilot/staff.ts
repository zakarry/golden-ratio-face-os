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

export interface ParticipantSummary {
  token: string;
  subjectCode: string;
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
    .select('token, subject_code, is_minor, consented_at, consent_by').order('subject_code');
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
      token: p.token, subjectCode: p.subject_code, isMinor: p.is_minor, consentedAt: p.consented_at, consentBy: p.consent_by,
      count: mine.length,
      beforeCount: mine.filter(r => r.phase === 'before').length,
      afterCount: mine.filter(r => r.phase === 'after').length,
      sessions: new Set(mine.map(r => jstDate(r.taken_at))).size,
      lastAt: mine.length ? mine[mine.length - 1].taken_at : null,
    };
  });
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
