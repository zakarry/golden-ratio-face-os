'use client';

// 運営ページ「分析」タブ。開くたびに最新の記録から計算する（写真はまだ届き続けているので資料にせずここで見る）。
// 1. 逆三角形の散布図（参加者＋測定済みの似ている人）
// 2. 12指標のヒストグラム（許容幅の帯つき）
// 3. 束ね表（寄せ方＝黄金比で「近づける」になった指標。打ち合わせの順番決め用）
// 4. 各図を PNG で保存
// 本人＝写り○の最新のメイク前（寄せ方と同じ選び方）。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { ParticipantSummary } from '@/lib/pilot/staff';
import { fetchCaptures, jstDate, type CaptureRow } from '@/lib/pilot/staffExport';
import { fetchAllSurveysForStaff, REFERENCE_KIND_LABEL, type ReferenceKind, type StaffReferenceRow } from '@/lib/pilot/survey';
import { METRIC_DEFS, formatMetric, correctedValue, SMARTPHONE_CORRECTIONS, SMARTPHONE_NOTE, type MetricDef, type MetricId, type PilotMetrics } from '@/lib/pilot/targetCard';
import { STRENGTH_LABEL } from '@/lib/pilot/prescription';
import { buildYosekata, deriveYoseValues, SMARTPHONE_YOSE_CORRECTION, type YoseRow } from '@/lib/pilot/yosekata';
import { pickYoseSubject } from '@/lib/pilot/yosekataStaff';

/** テスト参加者（灰色で区別、または除外） */
const TEST_CODES = new Set(['F38', 'F39', 'F40', 'F41']);
/** 額（生え際）が推定の指標。数えと束ね表には入れず、参考として図だけ出す */
const FOREHEAD_REF = new Set<MetricId>(['eyeY', 'noseY', 'lipY']);
const MEDIAN = '#2563eb';
const KIND_COLOR: Record<ReferenceKind, string> = { self_happy: '#2563eb', others_say: '#059669', dislike: '#e11d48' };
const INK = '#1c1917', GRAY = '#a8a29e', IDEAL = '#dc2626', FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

interface Subject {
  p: ParticipantSummary;
  test: boolean;
  takenAt: string;
  metrics: PilotMetrics;
  base: number;
  height: number;
}

export default function StaffAnalysis({ list }: { list: ParticipantSummary[] }) {
  const [captures, setCaptures] = useState<CaptureRow[] | null>(null);
  const [refs, setRefs] = useState<StaffReferenceRow[]>([]);
  const [error, setError] = useState('');
  const [testMode, setTestMode] = useState<'gray' | 'exclude'>('gray');

  const load = useCallback(async () => {
    setError(''); setCaptures(null);
    try {
      const [c, s] = await Promise.all([fetchCaptures(), fetchAllSurveysForStaff()]);
      setCaptures(c); setRefs(s.refs);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const subjects = useMemo<Subject[]>(() => {
    if (!captures) return [];
    const out: Subject[] = [];
    for (const p of list) {
      const test = TEST_CODES.has(p.subjectCode.toUpperCase());
      if (test && testMode === 'exclude') continue;
      const s = pickYoseSubject(captures.filter(c => c.participant_token === p.token).map(c => ({ ...c, id: '' })));
      if (!s?.metrics) continue;
      const m = s.metrics as unknown as PilotMetrics;
      const v = deriveYoseValues(m);
      // 底辺（目間距離）は黄金比と比べるのでスマホ補正つき
      out.push({ p, test, takenAt: s.taken_at!, metrics: m, base: correctedValue('eyeDist', v.eyeDist, SMARTPHONE_CORRECTIONS), height: v.triH });
    }
    return out.sort((a, b) => a.p.subjectCode.localeCompare(b.p.subjectCode));
  }, [captures, list, testMode]);

  const realCount = subjects.filter(s => !s.test).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <p className="text-stone-600">対象 {realCount}名{subjects.length > realCount && `（＋テスト ${subjects.length - realCount}名）`}　<span className="text-stone-400">各自の写り○の最新のメイク前</span></p>
        <div className="flex rounded-lg border border-stone-300 overflow-hidden divide-x divide-stone-300">
          {([['gray', 'テストは灰色'], ['exclude', 'テストを除外']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTestMode(v)} className={`px-3 py-1.5 ${testMode === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>{l}</button>
          ))}
        </div>
        <button type="button" onClick={load} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 最新にする</button>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!captures && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}
      {captures && subjects.length === 0 && <p className="text-xs text-stone-500">写り○のメイク前の記録がまだありません。</p>}
      {captures && subjects.length > 0 && (
        <>
          <TriangleScatter subjects={subjects} refs={refs} />
          <Histograms subjects={subjects} />
          <BundleTable subjects={subjects} />
        </>
      )}
    </div>
  );
}

// ── 1. 逆三角形の散布図 ────────────────────────────────────────────

function TriangleScatter({ subjects, refs }: { subjects: Subject[]; refs: StaffReferenceRow[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  // 黄金比の高さ＝0.36×縦横比の平均（テスト以外。全員テストならテストも含める）
  const base = subjects.some(s => !s.test) ? subjects.filter(s => !s.test) : subjects;
  const meanRatio = base.reduce((a, s) => a + s.metrics.faceRatio, 0) / base.length;
  const ideal = { x: 0.46, y: 0.36 * meanRatio };
  const byToken = new Map(subjects.map(s => [s.p.token, s]));
  const refPts = refs.filter(r => r.metrics && byToken.has(r.token)).map(r => {
    const v = deriveYoseValues(r.metrics as unknown as PilotMetrics);
    return { r, x: v.eyeDist, y: v.triH, owner: byToken.get(r.token)! };
  });

  const W = 820, H = 580, L = 64, R = 24, T = 60, B = 56;
  const xs = [...subjects.map(s => s.base), ...refPts.map(p => p.x), ideal.x];
  const ys = [...subjects.map(s => s.height), ...refPts.map(p => p.y), ideal.y];
  const pad = (lo: number, hi: number) => { const d = (hi - lo) || 0.05; return [lo - d * 0.12, hi + d * 0.12]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const X = (v: number) => L + (v - x0) / (x1 - x0) * (W - L - R);
  const Y = (v: number) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
  // コードのラベルが重ならないよう、右上→右下→左上→左下→さらに上下の順に空いている位置を選ぶ
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const hit = (b: { x: number; y: number; w: number; h: number }) => placed.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  const labelPos = new Map(subjects.map(s => {
    const cx = X(s.base), cy = Y(s.height), w = s.p.subjectCode.length * 6.4 + 2, h = 11;
    const cands = [[7, -6], [7, 13], [-7 - w, -6], [-7 - w, 13], [7, -18], [7, 25], [-7 - w, -18], [-7 - w, 25]];
    let pick = cands[0];
    for (const c of cands) { const b = { x: cx + c[0], y: cy + c[1] - 9, w, h }; if (!hit(b)) { pick = c; break; } }
    placed.push({ x: cx + pick[0], y: cy + pick[1] - 9, w, h });
    return [s.p.token, { x: cx + pick[0], y: cy + pick[1] }] as const;
  }));
  const ticks = (a: number, b: number) => { const n = 6, st = (b - a) / n; return Array.from({ length: n + 1 }, (_, i) => a + st * i); };

  return (
    <Panel title="1. 逆三角形の散布図" sub={`横＝底辺（目間距離）、縦＝高さ（目→口）。どちらも顔幅比。赤＝黄金比（0.46, 0.36×縦横比の平均）。参加者の底辺は${SMARTPHONE_NOTE}つき（似ている人の写真は補正なし）`} onSave={() => saveSvgPng(svgRef.current, '分析_逆三角形.png')}>
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ fontFamily: FONT, background: '#ffffff' }}>
          <text x={L} y={22} fontSize={14} fontWeight={700} fill={INK}>逆三角形（底辺 × 高さ、顔幅比）　n={subjects.filter(s => !s.test).length}</text>
          {ticks(x0, x1).map((t, i) => <g key={'x' + i}><line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke="#f0eeec" /><text x={X(t)} y={H - B + 16} fontSize={10} textAnchor="middle" fill={GRAY}>{t.toFixed(3)}</text></g>)}
          {ticks(y0, y1).map((t, i) => <g key={'y' + i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#f0eeec" /><text x={L - 6} y={Y(t) + 3} fontSize={10} textAnchor="end" fill={GRAY}>{t.toFixed(3)}</text></g>)}
          <text x={(L + W - R) / 2} y={H - 14} fontSize={11} textAnchor="middle" fill={INK}>底辺＝目間距離（顔幅比）　← 寄り目　　離れ目 →</text>
          <text x={16} y={(T + H - B) / 2} fontSize={11} textAnchor="middle" fill={INK} transform={`rotate(-90 16 ${(T + H - B) / 2})`}>高さ＝目→口（顔幅比）</text>
          {/* 黄金比の十字線 */}
          <line x1={X(ideal.x)} x2={X(ideal.x)} y1={T} y2={H - B} stroke={IDEAL} strokeDasharray="4 4" opacity={0.5} />
          <line x1={L} x2={W - R} y1={Y(ideal.y)} y2={Y(ideal.y)} stroke={IDEAL} strokeDasharray="4 4" opacity={0.5} />
          {/* 似ている人：挙げた参加者と線でつなぐ */}
          {refPts.map(({ r, x, y, owner }) => (
            <line key={'l' + r.id} x1={X(owner.base)} y1={Y(owner.height)} x2={X(x)} y2={Y(y)} stroke={owner.test ? GRAY : KIND_COLOR[r.kind]} strokeWidth={1} opacity={0.45} />
          ))}
          {refPts.map(({ r, x, y, owner }) => {
            const c = owner.test ? GRAY : KIND_COLOR[r.kind];
            return (
              <g key={'r' + r.id}>
                <rect x={X(x) - 4.5} y={Y(y) - 4.5} width={9} height={9} transform={`rotate(45 ${X(x)} ${Y(y)})`} fill="#ffffff" stroke={c} strokeWidth={1.8} />
                <text x={X(x) + 8} y={Y(y) + 3} fontSize={9} fill={c}>{r.person_name}</text>
              </g>
            );
          })}
          {subjects.map(s => (
            <g key={s.p.token}>
              <circle cx={X(s.base)} cy={Y(s.height)} r={5} fill={s.test ? GRAY : INK} />
              <text x={labelPos.get(s.p.token)!.x} y={labelPos.get(s.p.token)!.y} fontSize={10} fontWeight={600} fill={s.test ? GRAY : INK}>{s.p.subjectCode}</text>
            </g>
          ))}
          <circle cx={X(ideal.x)} cy={Y(ideal.y)} r={7} fill={IDEAL} />
          <text x={X(ideal.x) + 10} y={Y(ideal.y) + 14} fontSize={11} fontWeight={700} fill={IDEAL}>黄金比</text>
          {/* 凡例（点に重ならないよう、図の外の上に横並び） */}
          <g transform={`translate(${L}, 40)`}>
            <circle cx={6} cy={0} r={5} fill={INK} /><text x={16} y={4} fontSize={10} fill={INK}>参加者</text>
            <circle cx={66} cy={0} r={5} fill={GRAY} /><text x={76} y={4} fontSize={10} fill={GRAY}>テスト</text>
            <circle cx={126} cy={0} r={6} fill={IDEAL} /><text x={136} y={4} fontSize={10} fill={IDEAL}>黄金比</text>
            {(['self_happy', 'others_say', 'dislike'] as const).map((k, i) => (
              <g key={k} transform={`translate(${186 + i * 130}, 0)`}>
                <rect x={1.5} y={-4.5} width={9} height={9} transform="rotate(45 6 0)" fill="#ffffff" stroke={KIND_COLOR[k]} strokeWidth={1.8} />
                <text x={16} y={4} fontSize={10} fill={KIND_COLOR[k]}>{REFERENCE_KIND_LABEL[k]}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </Panel>
  );
}

// ── 2. 12指標のヒストグラム ────────────────────────────────────────

function Histograms({ subjects }: { subjects: Subject[] }) {
  const refs = useRef<Record<string, SVGSVGElement | null>>({});
  const main = METRIC_DEFS.filter(d => !FOREHEAD_REF.has(d.id));
  const ref = METRIC_DEFS.filter(d => FOREHEAD_REF.has(d.id));
  const cell = (d: MetricDef) => (
    <div key={d.id} className="space-y-1">
      <Hist def={d} subjects={subjects} reference={FOREHEAD_REF.has(d.id)} svgRef={el => { refs.current[d.id] = el; }} />
      <button type="button" onClick={() => saveSvgPng(refs.current[d.id] ?? null, `分析_分布_${d.label.replace(/（.*?）/g, '')}.png`)} className="text-[10px] text-stone-500 underline">この図を保存</button>
    </div>
  );
  const saveAll = async () => { for (const d of METRIC_DEFS) await saveSvgPng(refs.current[d.id] ?? null, `分析_分布_${d.label.replace(/（.*?）/g, '')}.png`); };
  return (
    <Panel title="2. 12指標の分布" sub={`灰色の帯＝黄金比の許容幅、赤線＝黄金比、青の点線＝参加者全体の中央値。目間距離は${SMARTPHONE_NOTE}つき。額が推定の3指標（目の高さ・鼻底・口の位置）は数えず参考表示`} onSave={saveAll} saveLabel="12枚とも保存">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{main.map(cell)}</div>
      <p className="text-xs font-semibold text-stone-500 pt-2">参考（額の位置が推定なので、数えない）</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-80">{ref.map(cell)}</div>
    </Panel>
  );
}

function Hist({ def, subjects, reference, svgRef }: { def: MetricDef; subjects: Subject[]; reference: boolean; svgRef: (el: SVGSVGElement | null) => void }) {
  // 黄金比と比べるので、目間距離はスマホ補正つきの値を並べる
  const vals = subjects.map(s => ({ v: correctedValue(def.id, s.metrics[def.id], SMARTPHONE_CORRECTIONS), test: s.test })).filter(x => typeof x.v === 'number' && isFinite(x.v));
  const lo0 = Math.min(...vals.map(x => x.v), def.ideal - def.tolerance * 2);
  const hi0 = Math.max(...vals.map(x => x.v), def.ideal + def.tolerance * 2);
  const N = 12, step = (hi0 - lo0) / N || 1;
  const bins = Array.from({ length: N }, (_, i) => ({ a: lo0 + i * step, real: 0, test: 0 }));
  for (const x of vals) { const i = Math.min(N - 1, Math.max(0, Math.floor((x.v - lo0) / step))); if (x.test) bins[i].test++; else bins[i].real++; }
  const maxC = Math.max(1, ...bins.map(b => b.real + b.test));
  const real = vals.filter(x => !x.test);
  const below = real.filter(x => x.v < def.ideal - def.tolerance).length;
  const above = real.filter(x => x.v > def.ideal + def.tolerance).length;
  const inside = real.length - below - above;
  const sorted = real.map(x => x.v).sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null;

  const W = 300, H = 170, L = 26, R = 10, T = 34, B = 34;
  const X = (v: number) => L + (v - lo0) / (hi0 - lo0) * (W - L - R);
  const Yc = (c: number) => H - B - c / maxC * (H - T - B);
  const bw = (W - L - R) / N;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, background: '#ffffff', maxWidth: W }} className="rounded-lg border border-stone-100">
      <text x={8} y={15} fontSize={11} fontWeight={700} fill={INK}>{def.label}{reference ? '（参考・額は推定）' : ''}{def.id === 'eyeDist' ? '（スマホ補正 −0.014）' : ''}</text>
      <text x={8} y={28} fontSize={9} fill={GRAY}>{reference
        ? `中央値 ${median != null ? formatMetric(median, def.unit) : '—'}（額が推定のため数えない）`
        : `低い側 ${below}人 / 範囲内 ${inside}人 / 高い側 ${above}人　中央値 ${median != null ? formatMetric(median, def.unit) : '—'}`}</text>
      <rect x={X(def.ideal - def.tolerance)} y={T} width={X(def.ideal + def.tolerance) - X(def.ideal - def.tolerance)} height={H - T - B} fill="#e7e5e4" opacity={0.7} />
      {bins.map((b, i) => (
        <g key={i}>
          <rect x={L + i * bw + 1} y={Yc(b.real)} width={bw - 2} height={H - B - Yc(b.real)} fill={INK} />
          {b.test > 0 && <rect x={L + i * bw + 1} y={Yc(b.real + b.test)} width={bw - 2} height={Yc(b.real) - Yc(b.real + b.test)} fill={GRAY} />}
        </g>
      ))}
      <line x1={X(def.ideal)} x2={X(def.ideal)} y1={T - 2} y2={H - B} stroke={IDEAL} strokeWidth={1.5} />
      {median != null && <line x1={X(median)} x2={X(median)} y1={T - 2} y2={H - B} stroke={MEDIAN} strokeWidth={1.5} strokeDasharray="4 3" />}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#d6d3d1" />
      {[lo0, def.ideal, hi0].map((t, i) => <text key={i} x={X(t)} y={H - B + 13} fontSize={9} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fill={i === 1 ? IDEAL : GRAY}>{formatMetric(t, def.unit)}</text>)}
      <text x={L - 4} y={T + 6} fontSize={8} textAnchor="end" fill={GRAY}>{maxC}</text>
      <text x={L - 4} y={H - B} fontSize={8} textAnchor="end" fill={GRAY}>0</text>
    </svg>
  );
}

// ── 3. 束ね表 ──────────────────────────────────────────────────────

interface BundleRow { s: Subject; agree: YoseRow[]; total: number }

function BundleTable({ subjects }: { subjects: Subject[] }) {
  const rows = useMemo<BundleRow[]>(() => subjects.map(s => {
    const r = buildYosekata(s.p.subjectCode, s.metrics, { name: '黄金比', kind: 'ideal', metrics: null }, { selfCorrection: SMARTPHONE_YOSE_CORRECTION });
    const agree = r.rows.filter(x => x.relation === 'agree').sort((a, b) => b.ratio - a.ratio);
    return { s, agree, total: agree.reduce((a, x) => a + x.ratio, 0) };
  }).sort((a, b) => Number(a.s.test) - Number(b.s.test) || b.agree.length - a.agree.length || b.total - a.total), [subjects]);
  const item = (x: YoseRow) => `${x.label.replace(/（.*?）/g, '')} ${x.direction}（${STRENGTH_LABEL[x.strength!]}）`;
  const tone = (x: YoseRow) => x.strength === 'strong' ? 'bg-rose-50 border-rose-200 text-rose-800' : x.strength === 'standard' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-stone-50 border-stone-200 text-stone-700';

  return (
    <Panel title="3. 束ね表（黄金比へ近づけるところ）" sub={`近づける項目が多い順（同数なら差の大きい順）。強＝赤、標準＝黄、弱＝灰。額が推定の指標は入れていない。目間距離は${SMARTPHONE_NOTE}つき`} onSave={() => saveTablePng(rows.map(r => ({ code: r.s.p.subjectCode, name: r.s.p.name, date: jstDate(r.s.takenAt), test: r.s.test, items: r.agree.map(item) })))}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-stone-400 text-[10px] text-left"><th className="py-1 px-2">順</th><th className="px-2">コード</th><th className="px-2">名前</th><th className="px-2">撮影日</th><th className="px-2 text-right">数</th><th className="px-2">近づけるところ（方向・強さ）</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.s.p.token} className={`border-t border-stone-100 align-top ${r.s.test ? 'text-stone-400' : 'text-stone-700'}`}>
              <td className="py-1.5 px-2 tabular-nums">{i + 1}</td>
              <td className="px-2 font-semibold">{r.s.p.subjectCode}{r.s.test && <span className="ml-1 text-[9px]">テスト</span>}</td>
              <td className="px-2 whitespace-nowrap">{r.s.p.name}</td>
              <td className="px-2 tabular-nums whitespace-nowrap">{jstDate(r.s.takenAt)}</td>
              <td className="px-2 text-right tabular-nums">{r.agree.length}</td>
              <td className="px-2 py-1"><div className="flex flex-wrap gap-1">
                {r.agree.length === 0 ? <span className="text-stone-400">なし（配置は揃っている）</span>
                  : r.agree.map(x => <span key={x.id} className={`rounded-full border px-2 py-0.5 ${r.s.test ? 'bg-stone-50 border-stone-200 text-stone-400' : tone(x)}`}>{item(x)}</span>)}
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 共通 ───────────────────────────────────────────────────────────

function Panel({ title, sub, onSave, saveLabel = '画像で保存', children }: { title: string; sub: string; onSave: () => void; saveLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-stone-800">{title}</p>
          <p className="text-[11px] text-stone-500">{sub}</p>
        </div>
        <button type="button" onClick={onSave} className={ghostBtn}><Download className="w-3.5 h-3.5" /> {saveLabel}</button>
      </div>
      {children}
    </div>
  );
}

function download(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}

/** SVG をそのままの縦横比で 2 倍の PNG にする */
async function saveSvgPng(svg: SVGSVGElement | null, name: string) {
  if (!svg) return;
  const vb = svg.viewBox.baseVal;
  const w = vb?.width || svg.clientWidth, h = vb?.height || svg.clientHeight;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  const img = new Image();
  await new Promise<void>((ok, ng) => { img.onload = () => ok(); img.onerror = () => ng(); img.src = src; });
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  download(c.toDataURL('image/png'), name);
  c.width = 0; c.height = 0;
}

/** 束ね表を PNG に描く */
function saveTablePng(rows: { code: string; name: string; date: string; test: boolean; items: string[] }[]) {
  const S = 2, W = 1100, rowH = 24, top = 56;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = (top + rows.length * rowH + 20) * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, top + rows.length * rowH + 20);
  ctx.fillStyle = INK; ctx.font = `bold 15px ${FONT}`;
  ctx.fillText(`束ね表（黄金比へ近づけるところ）　${jstDate(new Date().toISOString())}`, 16, 24);
  ctx.font = `11px ${FONT}`; ctx.fillStyle = GRAY;
  const cols = [16, 48, 100, 220, 310, 340];
  ['順', 'コード', '名前', '撮影日', '数', '近づけるところ（方向・強さ）'].forEach((h, i) => ctx.fillText(h, cols[i], 46));
  rows.forEach((r, i) => {
    const y = top + i * rowH + 16;
    ctx.strokeStyle = '#f0eeec'; ctx.beginPath(); ctx.moveTo(16, y - 16); ctx.lineTo(W - 16, y - 16); ctx.stroke();
    ctx.fillStyle = r.test ? GRAY : INK; ctx.font = `12px ${FONT}`;
    ctx.fillText(String(i + 1), cols[0], y);
    ctx.fillText(r.code + (r.test ? '（テスト）' : ''), cols[1], y);
    ctx.fillText(r.name, cols[2], y);
    ctx.fillText(r.date, cols[3], y);
    ctx.fillText(String(r.items.length), cols[4], y);
    ctx.fillText(r.items.length ? r.items.join('、') : 'なし', cols[5], y, W - cols[5] - 16);
  });
  download(c.toDataURL('image/png'), '分析_束ね表.png');
  c.width = 0; c.height = 0;
}

const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
