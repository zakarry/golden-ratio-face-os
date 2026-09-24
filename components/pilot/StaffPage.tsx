'use client';

// 運営ページ（?staff=1）
// 許可されたメールでログイン → 参加者の一覧 → 1人ずつの経過（写真・設計図・顔カルテ・処方・ずれの推移）

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, FileSpreadsheet, LogOut, Mail, RefreshCw, UserPlus, Users } from 'lucide-react';
import { downloadStaffExcel } from '@/lib/pilot/staffExport';
import {
  getParticipantHistory, getStaffState, listParticipants, parseRoster, registerParticipants, resetLocalAuth, sendStaffLoginLink,
  staffMediaUrls, staffSignOut, updateParticipant, withTimeout,
  type ParticipantSummary, type StaffState,
} from '@/lib/pilot/staff';
import type { PilotHistoryItem } from '@/lib/pilot/pilotStorage';
import PilotHistory from './PilotHistory';

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }) : '—';

export default function StaffPage() {
  const [state, setState] = useState<StaffState | null>(null);
  const [stuck, setStuck] = useState(false);
  const refresh = useCallback(async () => {
    setState(null); setStuck(false);
    try { setState(await withTimeout(getStaffState(), 12000)); }
    catch { setStuck(true); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const logout = useCallback(async () => { await staffSignOut(); refresh(); }, [refresh]);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-stone-900">ミス・ワールドJAPAN 運営ページ</h2>
          <p className="text-xs text-stone-500">参加者の撮影の経過を確認します。許可されたスタッフだけが見られます。</p>
        </div>
        {state && state.kind !== 'signedOut' && (
          <button type="button" onClick={logout} className={ghostBtn}><LogOut className="w-3.5 h-3.5" /> ログアウト（{state.email}）</button>
        )}
      </div>
      {!state && !stuck && <Card><p className="text-sm text-stone-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> 読み込んでいます…</p></Card>}
      {stuck && (
        <Card>
          <p className="text-sm text-rose-700">ログイン情報を読み込めませんでした。</p>
          <p className="text-xs text-stone-600 leading-relaxed">このサイトを開いているほかのタブ（ログインメールのリンクで開いたタブなど）をすべて閉じてから、「もう一度」を押してください。それでも進まないときは「ログインし直す」を押し、メールのリンクからもう一度ログインしてください。</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={refresh} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> もう一度</button>
            <button type="button" onClick={resetLocalAuth} className={ghostBtn}><LogOut className="w-3.5 h-3.5" /> ログインし直す</button>
          </div>
        </Card>
      )}
      {state?.kind === 'signedOut' && <Login />}
      {state?.kind === 'notStaff' && <Card><p className="text-sm text-rose-700">{state.email} は運営ページの利用が許可されていません。許可されたメールアドレスでログインし直してください。</p></Card>}
      {state?.kind === 'staff' && <Dashboard />}
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true); setMsg('');
    const err = await sendStaffLoginLink(email);
    setSending(false);
    setMsg(err ? `送れませんでした（${err}）` : `${email} にログイン用のリンクを送りました。メールを開いて、リンクを押してください（この端末のこのブラウザで開くとログインできます）。`);
  };
  return (
    <Card>
      <p className="text-sm text-stone-700">メールアドレスを入れると、ログイン用のリンクが届きます。</p>
      <div className="flex gap-2">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={`${inputCls} flex-1`} autoComplete="email" />
        <button type="button" disabled={!/\S+@\S+\.\S+/.test(email) || sending} onClick={send} className={primaryBtn}><Mail className="w-4 h-4" /> 送る</button>
      </div>
      {msg && <p className="text-xs text-stone-600">{msg}</p>}
    </Card>
  );
}

function Dashboard() {
  const [list, setList] = useState<ParticipantSummary[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ParticipantSummary | null>(null);

  const load = useCallback(async () => {
    setError('');
    try { setList(await listParticipants()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (selected) return <Detail p={selected} onBack={() => { setSelected(null); load(); }} />;

  const total = list?.length ?? 0;
  const started = list?.filter(p => p.count > 0).length ?? 0;

  return (
    <div className="space-y-5">
    {list && <Register existingCodes={list.map(p => p.subjectCode)} onDone={load} startOpen={list.length === 0} />}
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Users className="w-4 h-4" /> 参加者 {total}名　<span className="text-xs font-normal text-stone-500">撮影あり {started}名・未撮影 {total - started}名</span></p>
        <div className="flex items-center gap-2">
          {list && <ExcelButton list={list} />}
          <button type="button" onClick={load} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 更新</button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!list && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}
      {list && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-stone-400 text-[10px] text-left"><th className="py-1">コード</th><th>名前</th><th>未成年</th><th>同意</th><th className="text-right">回</th><th className="text-right">枚（前/後）</th><th className="text-right">最終</th><th /></tr></thead>
            <tbody>{list.map(p => (
              <tr key={p.token} onClick={() => setSelected(p)} className={`border-t border-stone-100 cursor-pointer hover:bg-amber-50/60 ${p.count === 0 ? 'text-stone-400' : 'text-stone-800'}`}>
                <td className="py-2 font-semibold">{p.subjectCode}</td>
                <td>{p.name}</td>
                <td>{p.isMinor ? '未成年' : ''}</td>
                <td>{p.consentedAt ? (p.consentBy === 'guardian' ? '保護者' : '本人') : <span className="text-amber-700">未</span>}</td>
                <td className="text-right tabular-nums">{p.sessions}</td>
                <td className="text-right tabular-nums">{p.count}（{p.beforeCount}/{p.afterCount}）</td>
                <td className="text-right">{fmt(p.lastAt)}</td>
                <td className="text-right"><CopyLink token={p.token} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
    </div>
  );
}

/** 名簿を貼り付けてまとめて登録（コードは F01, F02 … と自動） */
function Register({ existingCodes, onDone, startOpen }: { existingCodes: string[]; onDone: () => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const roster = parseRoster(text);
  const submit = async () => {
    setBusy(true); setMsg('');
    try { const n = await registerParticipants(roster, existingCodes); setText(''); setMsg(`${n}名を登録しました。下の一覧の「リンク」または「Excelで保存」から専用リンクを配れます。`); onDone(); }
    catch (e) { setMsg(`登録できませんでした（${e instanceof Error ? e.message : String(e)}）`); }
    setBusy(false);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={ghostBtn}><UserPlus className="w-3.5 h-3.5" /> 参加者を追加</button>;
  return (
    <Card>
      <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><UserPlus className="w-4 h-4" /> 参加者を登録</p>
      <p className="text-xs text-stone-600 leading-relaxed">名前を1行に1人ずつ貼り付けてください。18歳未満の人は、行の最後に「未成年」と書きます（例：<span className="font-mono">山田 花子 未成年</span>）。コードは F01・F02… と自動で振られます。名前はスタッフ画面とExcelにだけ表示され、参加者の画面には出ません。</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className={`${inputCls} w-full font-mono`} placeholder={'山田 花子\n佐藤 美咲 未成年'} />
      {roster.length > 0 && <p className="text-xs text-stone-500">{roster.length}名（うち未成年 {roster.filter(r => r.isMinor).length}名）を登録します。</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={submit} disabled={busy || roster.length === 0} className={primaryBtn}><UserPlus className="w-4 h-4" /> {busy ? '登録中…' : '登録する'}</button>
        <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>閉じる</button>
        {msg && <span className="text-xs text-stone-600">{msg}</span>}
      </div>
    </Card>
  );
}

/** 一覧と撮影ごとの記録を Excel で保存 */
function ExcelButton({ list }: { list: ParticipantSummary[] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (withImages: boolean) => {
    setBusy(true); setMsg(withImages ? '画像を準備中…' : '作成中…');
    try { await downloadStaffExcel(list, window.location.origin, { withImages, onProgress: setMsg }); setMsg(''); }
    catch (e) { setMsg(`作成できませんでした（${e instanceof Error ? e.message : String(e)}）`); }
    setBusy(false);
  };
  return (
    <>
      <button type="button" onClick={() => run(true)} disabled={busy} className={ghostBtn}><FileSpreadsheet className="w-3.5 h-3.5" /> Excelで保存（写真つき）</button>
      <button type="button" onClick={() => run(false)} disabled={busy} className={ghostBtn}><FileSpreadsheet className="w-3.5 h-3.5" /> 数値のみ</button>
      {msg && <span className="text-xs text-stone-600">{msg}</span>}
    </>
  );
}

/** 参加者に送る専用リンクをコピー（LINE で開いたとき標準ブラウザに切り替える指定つき） */
function CopyLink({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(`${window.location.origin}/?p=${token}&openExternalBrowser=1`); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* noop */ }
  };
  return <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-[10px] text-stone-500 underline"><Copy className="w-3 h-3" />{done ? 'コピーしました' : 'リンク'}</button>;
}

function Detail({ p, onBack }: { p: ParticipantSummary; onBack: () => void }) {
  const [history, setHistory] = useState<PilotHistoryItem[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    getParticipantHistory(p.token).then(setHistory).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [p.token]);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button type="button" onClick={onBack} className={ghostBtn}><ArrowLeft className="w-3.5 h-3.5" /> 一覧へ</button>
        <p className="text-sm font-semibold text-stone-800">{p.subjectCode}　<span className="text-xs font-normal text-stone-500">{p.sessions}回・{p.count}枚{p.consentedAt ? `・同意 ${fmt(p.consentedAt)}（${p.consentBy === 'guardian' ? '保護者' : '本人'}）` : '・同意なし'}</span></p>
        <CopyLink token={p.token} />
      </div>
      <EditParticipant p={p} />
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!history && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}
      {history && <PilotHistory history={history} getUrls={staffMediaUrls} showPhotos />}
    </Card>
  );
}

/** 名前と未成年の修正 */
function EditParticipant({ p }: { p: ParticipantSummary }) {
  const [name, setName] = useState(p.name);
  const [minor, setMinor] = useState(!!p.isMinor);
  const [msg, setMsg] = useState('');
  const dirty = name !== p.name || minor !== !!p.isMinor;
  const save = async () => {
    setMsg('保存中…');
    try { await updateParticipant(p.token, { name, isMinor: minor }); p.name = name; p.isMinor = minor; setMsg('保存しました'); }
    catch (e) { setMsg(`保存できませんでした（${e instanceof Error ? e.message : String(e)}）`); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input value={name} onChange={e => { setName(e.target.value); setMsg(''); }} placeholder="名前" className={`${inputCls} w-48`} />
      <label className="flex items-center gap-1 text-stone-600"><input type="checkbox" checked={minor} onChange={e => { setMinor(e.target.checked); setMsg(''); }} /> 未成年</label>
      <button type="button" onClick={save} disabled={!dirty} className={`${ghostBtn} disabled:opacity-40`}>保存</button>
      {msg && <span className="text-stone-500">{msg}</span>}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">{children}</section>;
}

const inputCls = 'rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 bg-white';
const primaryBtn = 'inline-flex items-center gap-2 rounded-lg bg-stone-800 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-40';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
