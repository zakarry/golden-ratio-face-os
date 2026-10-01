'use client';

// 運営ページ「撮影ごと」：Excel の「撮影ごと」シートと同じ表を画面で見る（写真・設計図つき）
// 画像は表示中のページの分だけ署名付きURLを取る。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, RefreshCw, X } from 'lucide-react';
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
  // 拡大表示中の撮影（filtered の中の位置）
  const [viewing, setViewing] = useState<number | null>(null);

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
  useEffect(() => { setPage(0); setViewing(null); }, [person, phase]);

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
                    <td className="px-2 py-2 min-w-[136px]"><Thumb url={r.image_path ? urls[r.image_path] : undefined} has={!!r.image_path} alt="写真" onOpen={() => setViewing(filtered.indexOf(r))} /></td>
                    <td className="px-2 py-2 min-w-[136px]"><Thumb url={r.blueprint_path ? urls[r.blueprint_path] : undefined} has={!!r.blueprint_path} alt="顔の設計図" onOpen={() => setViewing(filtered.indexOf(r))} /></td>
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
      {viewing !== null && filtered[viewing] && (
        <Viewer row={filtered[viewing]} person={byToken.get(filtered[viewing].participant_token)} urls={urls} setUrls={setUrls}
          onClose={() => setViewing(null)}
          onPrev={viewing > 0 ? () => setViewing(viewing - 1) : undefined}
          onNext={viewing < filtered.length - 1 ? () => setViewing(viewing + 1) : undefined} />
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

/** 縮小表示。押すと拡大表示を開く */
function Thumb({ url, has, alt, onOpen }: { url?: string; has: boolean; alt: string; onOpen: () => void }) {
  const box = 'block w-[120px] h-[160px] shrink-0 rounded-lg';
  if (!has) return <div className={`${box} border border-dashed border-stone-200 flex items-center justify-center text-stone-300`}><ImageOff className="w-5 h-5" /></div>;
  if (!url) return <div className={`${box} bg-stone-100 animate-pulse`} />;
  return (
    <button type="button" onClick={onOpen} className={`${box} overflow-hidden border border-stone-200 bg-stone-100 cursor-zoom-in`} title="押すと大きく表示">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="w-[120px] h-[160px] max-w-none object-contain" />
    </button>
  );
}

/** 写真と顔の設計図を並べて大きく表示。← → で前後の撮影、Esc で閉じる */
function Viewer({ row, person, urls, setUrls, onClose, onPrev, onNext }: {
  row: CaptureRow; person?: ParticipantSummary; urls: Record<string, string>;
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onClose: () => void; onPrev?: () => void; onNext?: () => void;
}) {
  // 別のページの撮影に移ったときは、その画像のURLを取る
  const need = [row.image_path, row.blueprint_path].filter((p): p is string => !!p && !urls[p]).join('|');
  useEffect(() => {
    if (!need) return;
    let alive = true;
    staffMediaUrls(need.split('|')).then(u => { if (alive) setUrls(prev => ({ ...prev, ...u })); });
    return () => { alive = false; };
  }, [need, setUrls]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  const img = (path: string | null, label: string) => (
    <figure className="flex flex-col items-center gap-1 min-w-0">
      <figcaption className="text-xs text-white/80">{label}</figcaption>
      {path && urls[path]
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={urls[path]} alt={label} className="max-h-[78vh] max-w-full object-contain rounded-lg bg-black/30" />
        : <div className="w-64 h-80 rounded-lg bg-white/10 flex items-center justify-center text-white/50 text-xs">{path ? '読み込み中…' : 'なし'}</div>}
    </figure>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-white text-sm mb-3" onClick={e => e.stopPropagation()}>
        <p>
          <span className="font-semibold">{person?.subjectCode} {person?.name}</span>　{jstDate(row.taken_at)} {jstTime(row.taken_at)}　{row.phase === 'before' ? 'メイク前' : 'メイク後'}
          {row.framing?.ok === false && <span className="text-amber-300">　写りに注意：{(row.framing.warnings ?? []).join('・')}</span>}
        </p>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs"><X className="w-4 h-4" /> 閉じる（Esc）</button>
      </div>
      <div className="flex-1 flex items-center justify-center gap-4 min-h-0" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onPrev} disabled={!onPrev} className="shrink-0 rounded-full bg-white/10 p-2 text-white disabled:opacity-20" aria-label="前の撮影"><ChevronLeft className="w-6 h-6" /></button>
        <div className="grid grid-cols-2 gap-4 min-w-0 max-w-6xl">
          {img(row.image_path, '写真')}
          {img(row.blueprint_path, '顔の設計図')}
        </div>
        <button type="button" onClick={onNext} disabled={!onNext} className="shrink-0 rounded-full bg-white/10 p-2 text-white disabled:opacity-20" aria-label="次の撮影"><ChevronRight className="w-6 h-6" /></button>
      </div>
    </div>
  );
}
const selectCls = 'rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
