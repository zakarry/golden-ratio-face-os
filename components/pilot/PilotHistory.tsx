'use client';

// 撮影の履歴（本人・スタッフ共通）
// 撮影日（日本時間）ごとに「第n回」としてまとめ、設計図・顔カルテ・処方と、黄金比からのずれの推移を見せる。

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ImageOff } from 'lucide-react';
import { METRIC_DEFS, formatMetric, type MetricId } from '@/lib/pilot/targetCard';
import type { Prescription } from '@/lib/pilot/prescription';
import type { PilotHistoryItem } from '@/lib/pilot/pilotStorage';

/** 推移を見せる指標（額の推定に頼らないものを中心に） */
const TREND_METRICS: MetricId[] = ['eyeDist', 'eyeWidth', 'eyeAngle', 'faceRatio', 'zone3', 'philtrum'];

export interface Session { no: number; date: string; items: PilotHistoryItem[] }

export function groupSessions(history: PilotHistoryItem[]): Session[] {
  const byDate = new Map<string, PilotHistoryItem[]>();
  [...history].sort((a, b) => a.takenAt.localeCompare(b.takenAt)).forEach(h => {
    const arr = byDate.get(h.sessionDate) ?? []; arr.push(h); byDate.set(h.sessionDate, arr);
  });
  return Array.from(byDate.entries()).map(([date, items], i) => ({ no: i + 1, date, items }));
}

const fmtDate = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}`; };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
const phaseLabel = (p: string) => p === 'before' ? 'メイク前' : 'メイク後';

/** 現在値 − 理想値（黄金比からのずれ。0 が黄金比） */
function deviation(h: PilotHistoryItem, id: MetricId): number | null {
  const t = h.targetCard?.items?.find(i => i.id === id);
  return t ? t.current - t.ideal : null;
}

export default function PilotHistory({ history, getUrls, showPhotos = false }: {
  history: PilotHistoryItem[];
  /** storage のパス → 表示用URL */
  getUrls: (paths: string[]) => Promise<Record<string, string>>;
  /** スタッフ用：元の写真も並べる */
  showPhotos?: boolean;
}) {
  const sessions = useMemo(() => groupSessions(history), [history]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const pathsKey = useMemo(() => history.flatMap(h => [h.blueprintPath, showPhotos ? h.imagePath : null]).filter((p): p is string => !!p).join('|'), [history, showPhotos]);
  useEffect(() => {
    if (!pathsKey) return;
    let alive = true;
    getUrls(pathsKey.split('|')).then(u => { if (alive) setUrls(u); });
    return () => { alive = false; };
  }, [pathsKey, getUrls]);

  if (history.length === 0) return <p className="text-xs text-stone-400">まだ記録はありません。</p>;

  return (
    <div className="space-y-5">
      <GapTrend history={history} />
      <div className="space-y-3">
        {[...sessions].reverse().map(s => <SessionCard key={s.date} session={s} urls={urls} showPhotos={showPhotos} />)}
      </div>
    </div>
  );
}

function SessionCard({ session, urls, showPhotos }: { session: Session; urls: Record<string, string>; showPhotos: boolean }) {
  const lastBefore = [...session.items].reverse().find(i => i.phase === 'before');
  const lastAfter = [...session.items].reverse().find(i => i.phase === 'after');
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
      <p className="text-sm font-semibold text-stone-800">第{session.no}回　<span className="text-xs font-normal text-stone-500">{fmtDate(session.date)}・{session.items.length}枚</span></p>
      {lastBefore && lastAfter && <MakeupEffect before={lastBefore} after={lastAfter} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {session.items.map(h => <CaptureCard key={h.id} h={h} urls={urls} showPhotos={showPhotos} />)}
      </div>
    </div>
  );
}

function CaptureCard({ h, urls, showPhotos }: { h: PilotHistoryItem; urls: Record<string, string>; showPhotos: boolean }) {
  const [open, setOpen] = useState(false);
  const bp = h.blueprintPath ? urls[h.blueprintPath] : undefined;
  const ph = showPhotos && h.imagePath ? urls[h.imagePath] : undefined;
  const k = h.karte;
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${h.phase === 'before' ? 'bg-stone-800 text-white' : 'bg-amber-500 text-white'}`}>{phaseLabel(h.phase)}</span>
        <span className="text-stone-400">{fmtTime(h.takenAt)}</span>
      </div>
      <div className={`grid gap-2 ${ph ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {ph && <a href={ph} target="_blank" rel="noreferrer"><img src={ph} alt="写真" className="w-full rounded-lg border border-stone-200" /></a>}
        {bp
          ? <a href={bp} target="_blank" rel="noreferrer"><img src={bp} alt="顔の設計図" className="w-full rounded-lg border border-stone-200" /></a>
          : <div className="aspect-[3/4] rounded-lg border border-dashed border-stone-200 flex items-center justify-center text-stone-300"><ImageOff className="w-5 h-5" /></div>}
      </div>
      {h.framing && !h.framing.ok && <p className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 写りに注意（{h.framing.warnings.join('・')}）</p>}
      {k && (
        <div className="space-y-0.5 text-stone-600">
          {k.triangleAnalysis && <p><span className="text-stone-400">顔印象タイプ：</span>{k.triangleAnalysis.label}</p>}
          {k.strengths && k.strengths.length > 0 && <p><span className="text-stone-400">強み：</span>{k.strengths.join('、')}</p>}
          {k.goldenRatio && <p className="tabular-nums"><span className="text-stone-400">黄金比参考値：</span>縦横 {k.goldenRatio.faceRatio.toFixed(3)}・目 {k.goldenRatio.eyePosition.toFixed(3)}・口 {k.goldenRatio.mouthPosition.toFixed(3)}</p>}
        </div>
      )}
      <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-stone-500">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> 処方と数値
      </button>
      {open && (
        <div className="space-y-2">
          {h.prescription && <><p className="text-stone-700">{h.prescription.headline}</p><RxList rx={h.prescription} /></>}
          <table className="w-full">
            <thead><tr className="text-stone-400 text-[10px]"><th className="text-left py-1">指標</th><th className="text-right">現在</th><th className="text-right">黄金比</th><th className="text-right">方向</th></tr></thead>
            <tbody>{(h.targetCard?.items ?? []).map(t => (
              <tr key={t.id} className={`border-t border-stone-100 ${t.actionable ? 'text-stone-800' : 'text-stone-400'}`}>
                <td className="py-1">{t.label}</td><td className="text-right tabular-nums">{formatMetric(t.current, t.unit)}</td><td className="text-right tabular-nums">{formatMetric(t.ideal, t.unit)}</td><td className="text-right">{t.direction}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 同じ日のメイク前→後で、黄金比に近づいた／離れた指標 */
function MakeupEffect({ before, after }: { before: PilotHistoryItem; after: PilotHistoryItem }) {
  const rows = TREND_METRICS.map(id => {
    const def = METRIC_DEFS.find(d => d.id === id)!;
    const b = deviation(before, id), a = deviation(after, id);
    if (b == null || a == null) return null;
    const change = Math.abs(b) - Math.abs(a); // 正 = 黄金比に近づいた
    return { id, label: def.label.replace(/（.*?）/g, ''), change, rel: change / def.tolerance, unit: def.unit };
  }).filter((r): r is NonNullable<typeof r> => !!r && Math.abs(r.rel) >= 0.3);
  return (
    <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3 text-xs space-y-1">
      <p className="font-semibold text-amber-900">この日のメイク前 → メイク後</p>
      {rows.length === 0
        ? <p className="text-stone-600">数値の上ではほとんど変わっていません。</p>
        : rows.map(r => <p key={r.id} className={r.change > 0 ? 'text-emerald-700' : 'text-rose-700'}>{r.label}：黄金比に{r.change > 0 ? '近づいた' : '離れた'}（{r.unit === '°' ? `${Math.abs(r.change).toFixed(1)}°` : Math.abs(r.change).toFixed(3)}）</p>)}
    </div>
  );
}

/** 黄金比からのずれの推移（0 = 黄金比。帯は許容幅） */
function GapTrend({ history }: { history: PilotHistoryItem[] }) {
  const sorted = useMemo(() => [...history].sort((a, b) => a.takenAt.localeCompare(b.takenAt)), [history]);
  if (sorted.length < 2) return null;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-stone-800">黄金比からのずれの変化</p>
        <p className="text-[11px] text-stone-500 leading-relaxed">真ん中の線が黄金比、薄い帯が「整っている」範囲です。
          <span className="inline-block w-2 h-2 rounded-full bg-stone-700 align-middle mx-1" />メイク前　<span className="inline-block w-2 h-2 rounded-full bg-amber-500 align-middle mx-1" />メイク後
          　日をまたいだ変化の多くは撮り方（距離・角度・明かり）の違いです。同じ日のメイク前→後の差を主に見てください。</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {TREND_METRICS.map(id => <Spark key={id} id={id} items={sorted} />)}
      </div>
    </div>
  );
}

function Spark({ id, items }: { id: MetricId; items: PilotHistoryItem[] }) {
  const def = METRIC_DEFS.find(d => d.id === id)!;
  const pts = items.map((h, i) => ({ i, v: deviation(h, id), phase: h.phase, ok: h.framing?.ok !== false })).filter(p => p.v != null) as { i: number; v: number; phase: string; ok: boolean }[];
  if (pts.length === 0) return null;
  const W = 160, H = 70, pad = 6;
  const span = Math.max(def.tolerance * 2, ...pts.map(p => Math.abs(p.v))) * 1.15;
  const x = (i: number) => pad + (items.length === 1 ? (W - 2 * pad) / 2 : (i / (items.length - 1)) * (W - 2 * pad));
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - pad);
  const line = (phase: string) => pts.filter(p => p.phase === phase).map(p => `${x(p.i)},${y(p.v)}`).join(' ');
  const latest = pts[pts.length - 1];
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-stone-600">{def.label.replace(/（.*?）/g, '')} <span className="text-stone-400 tabular-nums">最新 {latest.v >= 0 ? '+' : ''}{def.unit === '°' ? latest.v.toFixed(1) + '°' : latest.v.toFixed(3)}</span></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-stone-50">
        <rect x={0} y={y(def.tolerance)} width={W} height={y(-def.tolerance) - y(def.tolerance)} fill="rgba(201,169,110,0.15)" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(201,169,110,0.9)" strokeWidth={1} strokeDasharray="3 3" />
        {(['before', 'after'] as const).map(ph => <polyline key={ph} points={line(ph)} fill="none" stroke={ph === 'before' ? '#44403c' : '#f59e0b'} strokeWidth={1.5} />)}
        {pts.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.5} fill={p.phase === 'before' ? '#44403c' : '#f59e0b'} opacity={p.ok ? 1 : 0.3} />)}
      </svg>
    </div>
  );
}

export function RxList({ rx }: { rx: Prescription }) {
  return (
    <ol className="space-y-2 mt-2">
      {rx.items.map((i, idx) => (
        <li key={i.techniqueId} className="rounded-xl border border-stone-200 bg-white p-3 text-xs space-y-1">
          <div className="flex items-center gap-2"><span className="inline-flex w-5 h-5 rounded-full bg-stone-800 text-white items-center justify-center text-[10px]">{idx + 1}</span><span className="text-[10px] text-stone-400">{i.step} {i.stepLabel}</span></div>
          <p className="text-sm font-semibold text-stone-800">{i.name}</p>
          <p><span className="text-stone-400">量：</span><span className="font-medium">{i.amount}</span></p>
          <p><span className="text-stone-400">場所：</span>{i.where}</p>
          <p><span className="text-stone-400">色：</span>{i.color}</p>
          {i.caution && <p className="text-rose-700"><span className="text-stone-400">注意：</span>{i.caution}</p>}
        </li>
      ))}
    </ol>
  );
}
