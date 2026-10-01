'use client';

// 運営ページ「撮影ごと」：Excel の「撮影ごと」シートと同じ表を画面で見る（写真・設計図つき）
// 画像は表示中のページの分だけ署名付きURLを取る。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw } from 'lucide-react';
import { METRIC_DEFS } from '@/lib/pilot/targetCard';
import { fetchCaptures, jstDate, jstTime, type CaptureRow } from '@/lib/pilot/staffExport';
import { staffMediaUrls, type ParticipantSummary } from '@/lib/pilot/staff';

const PAGE = 30;
type PhaseFilter = 'all' | 'before' | 'after';

export default function StaffCaptures({ list, onOpenPerson }: { list: ParticipantSummary[]; onOpenPerson: (p: ParticipantSummary) => void }) {
  const [rows, setRows] = useState<CaptureRow[] | null>(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState('');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [page, setPage] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // 署名付きURLは10分で切れるので、更新のたびに取り直す
  const load = useCallback(async () => {
    setRows(null); setError(''); setUrls({});
    try { setRows(await fetchCaptures()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const byToken = useMemo(() => new Map(list.map(p => [p.token, p])), [list]);

  // 回＝人ごとの撮影日の通し番号
  const sessionNo = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    [...(rows ?? [])].sort((a, b) => a.taken_at.localeCompare(b.taken_at)).forEach(c => {
      const s = m.get(c.participant_token) ?? new Map<string, number>();
      const d = jstDate(c.taken_at);
      if (!s.has(d)) s.set(d, s.size + 1);
      m.set(c.participant_token, s);
    });
    return m;
  }, [rows]);

  // 新しい撮影が上
  const filtered = useMemo(() => (rows ?? [])
    .filter(r => (!person || r.participant_token === person) && (phase === 'all' || r.phase === phase))
    .sort((a, b) => b.taken_at.localeCompare(a.taken_at)), [rows, person, phase]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [person, phase]);

  // 表示中のページの画像だけURLを取る
  const pathsKey = shown.flatMap(r => [r.image_path, r.blueprint_path]).filter((p): p is string => !!p && !urls[p]).join('|');
  useEffect(() => {
    if (!pathsKey) return;
    let alive = true;
    staffMediaUrls(pathsKey.split('|')).then(u => { if (alive) setUrls(prev => ({ ...prev, ...u })); });
    return () => { alive = false; };
  }, [pathsKey]);

  const people = useMemo(() => list.filter(p => p.count > 0), [list]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={person} onChange={e => setPerson(e.target.value)} className={selectCls}>
          <option value="">全員（{rows?.length ?? 0}枚）</option>
          {people.map(p => <option key={p.token} value={p.token}>{p.subjectCode} {p.name}（{p.count}枚）</option>)}
        </select>
        <select value={phase} onChange={e => setPhase(e.target.value as PhaseFilter)} className={selectCls}>
          <option value="all">メイク前・後</option>
          <option value="before">メイク前だけ</option>
          <option value="after">メイク後だけ</option>
        </select>
        <button type="button" onClick={load} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 更新</button>
        <span className="text-stone-500">{filtered.length}枚</span>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!rows && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}
      {rows && filtered.length === 0 && <p className="text-xs text-stone-400">撮影はまだありません。</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs whitespace-nowrap">
            <thead className="bg-[#F3E9D8] text-stone-700">
              <tr className="text-left">
                {['コード', '名前', '写真', '顔の設計図', '回', '撮影日', '時刻', '段階', '写り', '写りの注意', '顔印象タイプ', '強み', '黄金比 縦横', '目位置', '口位置', '修正対象'].map(h => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}
                {METRIC_DEFS.map(d => <th key={d.id} className="px-2 py-2 font-semibold" title={`黄金比 ${d.unit === '°' ? d.ideal + '°' : d.ideal.toFixed(3)}`}>{d.label.replace(/（.*?）/g, '')}<br /><span className="font-normal text-stone-500">黄金比 {d.unit === '°' ? d.ideal + '°' : d.ideal.toFixed(3)}</span></th>)}
                <th className="px-2 py-2 font-semibold">処方</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const p = byToken.get(r.participant_token);
                return (
                  <tr key={`${r.participant_token}_${r.taken_at}`} className="border-t border-stone-100 align-top bg-white">
                    <td className="px-2 py-2 font-semibold">{p ? <button type="button" onClick={() => onOpenPerson(p)} className="underline">{p.subjectCode}</button> : '—'}</td>
                    <td className="px-2 py-2">{p?.name}</td>
                    <td className="px-2 py-2"><Thumb url={r.image_path ? urls[r.image_path] : undefined} has={!!r.image_path} alt="写真" /></td>
                    <td className="px-2 py-2"><Thumb url={r.blueprint_path ? urls[r.blueprint_path] : undefined} has={!!r.blueprint_path} alt="顔の設計図" /></td>
                    <td className="px-2 py-2 text-right">{sessionNo.get(r.participant_token)?.get(jstDate(r.taken_at))}</td>
                    <td className="px-2 py-2">{jstDate(r.taken_at)}</td>
                    <td className="px-2 py-2">{jstTime(r.taken_at)}</td>
                    <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium text-white ${r.phase === 'before' ? 'bg-stone-800' : 'bg-amber-500'}`}>{r.phase === 'before' ? 'メイク前' : 'メイク後'}</span></td>
                    <td className="px-2 py-2 text-center">{r.framing?.ok === false ? <span className="text-amber-700">×</span> : '○'}</td>
                    <td className="px-2 py-2 whitespace-normal min-w-[10rem] text-amber-800">{(r.framing?.warnings ?? []).join('・')}</td>
                    <td className="px-2 py-2">{r.tri ?? ''}</td>
                    <td className="px-2 py-2 whitespace-normal min-w-[12rem]">{(r.strengths ?? []).join('、')}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.gr?.faceRatio ?? ''}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.gr?.eyePosition ?? ''}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.gr?.mouthPosition ?? ''}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.actionable ?? ''}</td>
                    {METRIC_DEFS.map(d => { const v = r.metrics?.[d.id]; return <td key={d.id} className="px-2 py-2 text-right tabular-nums">{typeof v === 'number' ? (d.unit === '°' ? v.toFixed(1) : v.toFixed(3)) : ''}</td>; })}
                    <td className="px-2 py-2 whitespace-normal min-w-[18rem]">{r.headline ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={`${ghostBtn} disabled:opacity-40`}><ChevronLeft className="w-3.5 h-3.5" /> 前へ</button>
          <span className="text-stone-500">{page + 1} / {pages}</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className={`${ghostBtn} disabled:opacity-40`}>次へ <ChevronRight className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}

/** 縮小表示。押すと元の大きさで開く */
function Thumb({ url, has, alt }: { url?: string; has: boolean; alt: string }) {
  if (!has) return <div className="w-[120px] h-[160px] rounded-lg border border-dashed border-stone-200 flex items-center justify-center text-stone-300"><ImageOff className="w-5 h-5" /></div>;
  if (!url) return <div className="w-[120px] h-[160px] rounded-lg bg-stone-100 animate-pulse" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} className="w-[120px] h-[160px] object-cover rounded-lg border border-stone-200" /></a>;
}

const selectCls = 'rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
