'use client';

// 運営ページ「分析」タブ。開くたびに最新の記録から計算する（写真はまだ届き続けているので資料にせずここで見る）。
// 1. 逆三角形の散布図（参加者＋測定済みの似ている人）
// 2. 12指標のヒストグラム（許容幅の帯つき）
// 3. 束ね表（寄せ方＝黄金比で「近づける」になった指標。打ち合わせの順番決め用）
// 4. 各図を PNG で保存
// 本人＝写り○の最新のメイク前（寄せ方と同じ選び方）。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { staffMediaUrls, type ParticipantSummary } from '@/lib/pilot/staff';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { detectFaceLandmarksWithRaw, estimatePitchDeg } from '@/lib/faceLandmarks';
import { fetchCaptures, jstDate, type CaptureRow } from '@/lib/pilot/staffExport';
import { fetchAllSurveysForStaff, REFERENCE_KIND_LABEL, type ReferenceKind, type StaffReferenceRow } from '@/lib/pilot/survey';
import { METRIC_DEFS, computePilotMetrics, formatMetric, correctedValue, SMARTPHONE_CORRECTIONS, SMARTPHONE_NOTE, type MetricDef, type MetricId, type PilotMetrics } from '@/lib/pilot/targetCard';
import { STRENGTH_LABEL } from '@/lib/pilot/prescription';
import { buildYosekata, deriveYoseValues, groupAgreeRows, SMARTPHONE_YOSE_CORRECTION, type YoseAgreeItem } from '@/lib/pilot/yosekata';
import { yoseSubjectFromRecords } from '@/lib/pilot/yosekataStaff';
import { FRAMING_LIMITS, type RetakeStatus } from '@/lib/pilot/pilotStorage';

/** テスト参加者（灰色で区別、または除外） */
const TEST_CODES = new Set(['F38', 'F39', 'F40', 'F41']);
/** 額（生え際）が推定の指標。数えと束ね表には入れず、参考として図だけ出す */
const FOREHEAD_REF = new Set<MetricId>(['eyeY', 'noseY', 'lipY']);
const MEDIAN = '#2563eb';
const KIND_COLOR: Record<ReferenceKind, string> = { self_happy: '#2563eb', others_say: '#059669', dislike: '#e11d48', staff_say: '#7c3aed' };
const INK = '#1c1917', GRAY = '#a8a29e', IDEAL = '#dc2626', FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";

interface Subject {
  p: ParticipantSummary;
  test: boolean;
  takenAt: string;
  /** 中央値を取った記録の数 */
  count: number;
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

  // 本人の値＝写り○かつ傾き 8〜20° のメイク前の記録の中央値。該当0枚の人は「要撮り直し（傾き）」
  const { subjects, retake } = useMemo(() => {
    const out: Subject[] = [];
    const retake: { p: ParticipantSummary; test: boolean; status: RetakeStatus }[] = [];
    if (!captures) return { subjects: out, retake };
    for (const p of list) {
      const test = TEST_CODES.has(p.subjectCode.toUpperCase());
      if (test && testMode === 'exclude') continue;
      const { subject: s, retake: rt } = yoseSubjectFromRecords(captures.filter(c => c.participant_token === p.token).map(c => ({ ...c, id: '' })));
      if (!s) { if (rt) retake.push({ p, test, status: rt }); continue; }
      const v = deriveYoseValues(s.metrics);
      // 底辺（目間距離）は黄金比と比べるのでスマホ補正つき
      out.push({ p, test, takenAt: s.takenAt, count: s.count, metrics: s.metrics, base: correctedValue('eyeDist', v.eyeDist, SMARTPHONE_CORRECTIONS), height: v.triH });
    }
    return { subjects: out.sort((a, b) => a.p.subjectCode.localeCompare(b.p.subjectCode)), retake };
  }, [captures, list, testMode]);

  const realCount = subjects.filter(s => !s.test).length;
  // まだ1枚も撮っていない人（本人の値が出せない、もう一つの理由）
  const notStarted = list.filter(p => p.count === 0 && !TEST_CODES.has(p.subjectCode.toUpperCase())).map(p => p.subjectCode);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <p className="text-stone-600">対象 {realCount}名{subjects.length > realCount && `（＋テスト ${subjects.length - realCount}名）`}　<span className="text-stone-400">写り○・傾き8〜20°・近すぎないメイク前の中央値</span>{retake.filter(r => !r.test).length > 0 && <span className="text-amber-700 font-semibold">要撮り直し {retake.filter(r => !r.test).length}名</span>}
        {notStarted.length > 0 && <span className="text-stone-500">未撮影 {notStarted.length}名（{notStarted.join('、')}）</span>}</p>
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
          <BundleTable subjects={subjects} retake={retake} />
          <YearCompare subjects={subjects.filter(x => !x.test)} />
          <DistanceScatter captures={captures} list={list} testMode={testMode} />
          <NoseTrial captures={captures} list={list} />
          <PitchTrial captures={captures} list={list} />
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
  // 点そのものも障害物にする（ラベルが別の点に隠れないように）
  const placed: { x: number; y: number; w: number; h: number }[] = [
    ...subjects.map(s => ({ x: X(s.base) - 5, y: Y(s.height) - 5, w: 10, h: 10 })),
    { x: X(ideal.x) - 7, y: Y(ideal.y) - 7, w: 14, h: 14 },
  ];
  const hit = (b: { x: number; y: number; w: number; h: number }) => placed.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  const labelPos = new Map(subjects.map(s => {
    const cx = X(s.base), cy = Y(s.height), w = s.p.subjectCode.length * 6.4 + 2, h = 11;
    const cands = [[7, -6], [7, 13], [-7 - w, -6], [-7 - w, 13], [7, -18], [7, 25], [-7 - w, -18], [-7 - w, 25], [-w / 2, -10], [-w / 2, 20], [12, 4], [-12 - w, 4]];
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
            {(['self_happy', 'others_say', 'dislike', 'staff_say'] as const).map((k, i) => (
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

interface BundleRow { s: Subject; agree: YoseAgreeItem[]; total: number }

function BundleTable({ subjects, retake }: { subjects: Subject[]; retake: { p: ParticipantSummary; test: boolean; status: RetakeStatus }[] }) {
  const rows = useMemo<BundleRow[]>(() => subjects.map(s => {
    const r = buildYosekata(s.p.subjectCode, s.metrics, { name: '黄金比', kind: 'ideal', metrics: null }, { selfCorrection: SMARTPHONE_YOSE_CORRECTION });
    // 下顔面（中顔面÷下顔面・人中比・目→口の高さ）は1件として数える
    const agree = groupAgreeRows(r.rows);
    return { s, agree, total: agree.reduce((a, x) => a + x.ratio, 0) };
  }).sort((a, b) => Number(a.s.test) - Number(b.s.test) || b.agree.length - a.agree.length || b.total - a.total), [subjects]);
  const item = (g: YoseAgreeItem) => g.key === 'lower'
    ? `下顔面：${g.rows.map(x => x.direction).join('・')}（${STRENGTH_LABEL[g.strength]}）`
    : `${g.label.replace(/（.*?）/g, '')} ${g.rows[0].direction}（${STRENGTH_LABEL[g.strength]}）`;
  const tone = (x: YoseAgreeItem) => x.strength === 'strong' ? 'bg-rose-50 border-rose-200 text-rose-800' : x.strength === 'standard' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-stone-50 border-stone-200 text-stone-700';

  return (
    <Panel title="3. 束ね表（黄金比へ近づけるところ）" sub={`近づける項目が多い順（同数なら差の大きい順）。強＝赤、標準＝黄、弱＝灰。下顔面（中顔面÷下顔面・人中比・目→口の高さ）は1件として数える。額が推定の指標は入れていない。目間距離は${SMARTPHONE_NOTE}つき`} onSave={() => saveTablePng([...rows.map(r => ({ code: r.s.p.subjectCode, name: r.s.p.name, date: `${jstDate(r.s.takenAt)}（${r.s.count}枚）`, test: r.s.test, items: r.agree.map(item) })), ...retake.map(x => ({ code: x.p.subjectCode, name: x.p.name, date: '', test: x.test, items: [`${x.status.label}：${x.status.reason}`] }))])}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-stone-400 text-[10px] text-left"><th className="py-1 px-2">順</th><th className="px-2">コード</th><th className="px-2">名前</th><th className="px-2">撮影日（中央値の枚数）</th><th className="px-2 text-right">数</th><th className="px-2">近づけるところ（方向・強さ）</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.s.p.token} className={`border-t border-stone-100 align-top ${r.s.test ? 'text-stone-400' : 'text-stone-700'}`}>
              <td className="py-1.5 px-2 tabular-nums">{i + 1}</td>
              <td className="px-2 font-semibold">{r.s.p.subjectCode}{r.s.test && <span className="ml-1 text-[9px]">テスト</span>}</td>
              <td className="px-2 whitespace-nowrap">{r.s.p.name}</td>
              <td className="px-2 tabular-nums whitespace-nowrap">{jstDate(r.s.takenAt)}<span className="text-stone-400 ml-1">（{r.s.count}枚）</span></td>
              <td className="px-2 text-right tabular-nums">{r.agree.length}</td>
              <td className="px-2 py-1"><div className="flex flex-wrap gap-1">
                {r.agree.length === 0 ? <span className="text-stone-400">なし（配置は揃っている）</span>
                  : r.agree.map(x => <span key={x.key} className={`rounded-full border px-2 py-0.5 ${r.s.test ? 'bg-stone-50 border-stone-200 text-stone-400' : tone(x)}`}>{item(x)}</span>)}
              </div></td>
            </tr>
          ))}
          {retake.map(x => (
            <tr key={x.p.token} className={`border-t border-stone-100 ${x.test ? 'text-stone-400' : 'text-stone-700'}`}>
              <td className="py-1.5 px-2">—</td>
              <td className="px-2 font-semibold">{x.p.subjectCode}{x.test && <span className="ml-1 text-[9px]">テスト</span>}</td>
              <td className="px-2 whitespace-nowrap">{x.p.name}</td>
              <td className="px-2" colSpan={3}><span className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 font-semibold">{x.status.label}</span><span className="ml-2 text-stone-500">{x.status.reason}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 4. 去年との比較 ────────────────────────────────────────────────

interface Row2025 { id: string; phase: 'before' | 'after'; ok: boolean; faceWidthFrac: number; [k: string]: string | number | boolean }

/** 3つの組：2026（スマホ）、2025 before（スマホ説明会）、2025 after（スタジオ）。スマホの2組は目間距離に補正を入れて黄金比と比べる */
function YearCompare({ subjects }: { subjects: Subject[] }) {
  const [y2025, setY2025] = useState<Row2025[] | null>(null);
  const refs = useRef<Record<string, SVGSVGElement | null>>({});
  useEffect(() => { import('@/data/mw2025_metrics_v2.json').then(m => setY2025(m.default as unknown as Row2025[])); }, []);
  if (!y2025) return null;
  const groups = [
    { label: '2026 今回（スマホ）', smartphone: true, vals: (id: MetricId) => subjects.map(x => x.metrics[id]) },
    { label: '2025 説明会（スマホ）', smartphone: true, vals: (id: MetricId) => y2025.filter(r => r.phase === 'before' && r.ok).map(r => r[id] as number) },
    { label: '2025 スタジオ', smartphone: false, vals: (id: MetricId) => y2025.filter(r => r.phase === 'after' && r.ok).map(r => r[id] as number) },
  ];
  const save = (d: MetricDef) => saveSvgPng(refs.current[d.id] ?? null, `分析_去年比較_${d.label.replace(/（.*?）/g, '')}.png`);
  return (
    <Panel title="4. 去年との比較" sub={`同じ指標を3つの組で並べる。去年の値は今のアプリの計算で測り直したもの（同じ定義）。青の点線＝その組の中央値、赤線＝黄金比、灰色の帯＝許容幅。スマホの2組の目間距離は${SMARTPHONE_NOTE}つき（スタジオは補正なし）`}
      onSave={async () => { for (const d of METRIC_DEFS) await save(d); }} saveLabel="12枚とも保存">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {METRIC_DEFS.map(d => (
          <div key={d.id} className="space-y-1">
            <CompareChart def={d} reference={FOREHEAD_REF.has(d.id)}
              groups={groups.map(g => ({ label: g.label, vals: g.vals(d.id).filter(v => typeof v === 'number' && isFinite(v)).map(v => g.smartphone ? correctedValue(d.id, v, SMARTPHONE_CORRECTIONS) : v) }))}
              svgRef={el => { refs.current[d.id] = el; }} />
            <button type="button" onClick={() => save(d)} className="text-[10px] text-stone-500 underline">この図を保存</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

function CompareChart({ def, reference, groups, svgRef }: { def: MetricDef; reference: boolean; groups: { label: string; vals: number[] }[]; svgRef: (el: SVGSVGElement | null) => void }) {
  const all = groups.flatMap(g => g.vals);
  const lo0 = Math.min(...all, def.ideal - def.tolerance * 2), hi0 = Math.max(...all, def.ideal + def.tolerance * 2);
  const N = 14, step = (hi0 - lo0) / N || 1;
  const W = 320, L = 10, R = 10, T = 22, RH = 52, H = T + groups.length * RH + 18;
  const X = (v: number) => L + (v - lo0) / (hi0 - lo0) * (W - L - R);
  const bw = (W - L - R) / N;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: FONT, background: '#ffffff', maxWidth: W }} className="rounded-lg border border-stone-100">
      <text x={8} y={15} fontSize={11} fontWeight={700} fill={INK}>{def.label}{reference ? '（参考・額は推定）' : ''}</text>
      {groups.map((g, gi) => {
        const top = T + gi * RH, base = top + RH - 8;
        const bins = Array.from({ length: N }, () => 0);
        for (const v of g.vals) bins[Math.min(N - 1, Math.max(0, Math.floor((v - lo0) / step)))]++;
        const maxC = Math.max(1, ...bins);
        const md = median(g.vals);
        const out = g.vals.filter(v => Math.abs(v - def.ideal) > def.tolerance).length;
        return (
          <g key={g.label}>
            <rect x={X(def.ideal - def.tolerance)} y={top + 14} width={X(def.ideal + def.tolerance) - X(def.ideal - def.tolerance)} height={base - top - 14} fill="#e7e5e4" opacity={0.7} />
            {bins.map((c, i) => c > 0 && <rect key={i} x={L + i * bw + 1} y={base - c / maxC * (base - top - 16)} width={bw - 2} height={c / maxC * (base - top - 16)} fill={INK} />)}
            <line x1={X(def.ideal)} x2={X(def.ideal)} y1={top + 12} y2={base} stroke={IDEAL} strokeWidth={1.2} />
            {md != null && <line x1={X(md)} x2={X(md)} y1={top + 12} y2={base} stroke={MEDIAN} strokeWidth={1.5} strokeDasharray="4 3" />}
            <line x1={L} x2={W - R} y1={base} y2={base} stroke="#d6d3d1" />
            <text x={L} y={top + 10} fontSize={9} fill={INK}>{`${g.label}　n=${g.vals.length}　中央値 ${md != null ? formatMetric(md, def.unit) : '—'}${reference ? '' : `　範囲外 ${out}人`}`}</text>
          </g>
        );
      })}
      {[lo0, def.ideal, hi0].map((t, i) => <text key={i} x={X(t)} y={H - 5} fontSize={9} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fill={i === 1 ? IDEAL : GRAY}>{formatMetric(t, def.unit)}</text>)}
    </svg>
  );
}

// ── 5. 距離の影響 ──────────────────────────────────────────────────

function regress(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx || !syy) return null;
  const slope = sxy / sxx;
  return { n, r: sxy / Math.sqrt(sxx * syy), slope, icpt: my - slope * mx };
}

/** 横＝顔の大きさ（画像幅に対する顔幅）、縦＝目間距離 or 人中比（測ったまま・補正なし）。2026の全記録 */
function DistanceScatter({ captures, list, testMode }: { captures: CaptureRow[]; list: ParticipantSummary[]; testMode: 'gray' | 'exclude' }) {
  const [metric, setMetric] = useState<'eyeDist' | 'philtrum'>('eyeDist');
  // 横軸：顔の大きさ（カメラとの距離）か、顔の上下の傾き
  const [axis, setAxis] = useState<'face' | 'pitch'>('face');
  const svgRef = useRef<SVGSVGElement>(null);
  const codeOf = new Map(list.map(p => [p.token, p.subjectCode]));
  const pts = captures.flatMap(c => {
    const f = axis === 'face' ? c.framing?.faceWidthFrac : c.framing?.pitch;
    const v = c.metrics?.[metric];
    const code = codeOf.get(c.participant_token);
    if (typeof f !== 'number' || typeof v !== 'number' || !code) return [];
    const test = TEST_CODES.has(code.toUpperCase());
    if (test && testMode === 'exclude') return [];
    return [{ f, v, code, test }];
  });
  if (pts.length < 3) return null;
  const real = pts.filter(p => !p.test);
  const all = regress(real.map(p => p.f), real.map(p => p.v));
  // 同じ人の中での関係（人ごとの平均を引く）＝顔の違いを除いた、距離だけの効果
  const byCode = new Map<string, typeof real>();
  for (const p of real) byCode.set(p.code, [...(byCode.get(p.code) ?? []), p]);
  const multi = Array.from(byCode.values()).filter(a => a.length > 1);
  const dx: number[] = [], dy: number[] = [];
  for (const a of multi) {
    const mf = a.reduce((s, p) => s + p.f, 0) / a.length, mv = a.reduce((s, p) => s + p.v, 0) / a.length;
    for (const p of a) { dx.push(p.f - mf); dy.push(p.v - mv); }
  }
  const within = regress(dx, dy);

  const W = 760, H = 460, L = 60, R = 20, T = 30, B = 50;
  const xs = pts.map(p => p.f), ys = pts.map(p => p.v);
  const pad = (lo: number, hi: number) => { const d = (hi - lo) || 0.05; return [lo - d * 0.08, hi + d * 0.08]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const X = (v: number) => L + (v - x0) / (x1 - x0) * (W - L - R);
  const Y = (v: number) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
  const ticks = (a: number, b: number) => Array.from({ length: 7 }, (_, i) => a + (b - a) / 6 * i);
  const label = metric === 'eyeDist' ? '目間距離（顔幅比）' : '人中比';
  const xLabel = axis === 'face' ? '顔の大きさ' : '上下の傾き';
  const fr = (r: number) => `${r >= 0 ? '' : '−'}${Math.abs(r).toFixed(2)}`;
  const verdict = (r: number) => Math.abs(r) >= 0.4 ? '相関あり（レンズ距離の効果が大きい）' : Math.abs(r) >= 0.2 ? '弱い相関（一部は距離の効果）' : '相関ほぼなし（本当の特徴）';

  return (
    <Panel title="5. 距離と傾きの影響" sub="横＝顔の大きさ（大きいほどカメラが近い）または上下の傾き、縦＝測ったままの値（補正なし）。2026の全記録。相関があれば撮り方の影響、なければ本当の特徴。傾きの帯＝基準 8〜20°"
      onSave={() => saveSvgPng(svgRef.current, `分析_${xLabel}_${metric === 'eyeDist' ? '目間距離' : '人中比'}.png`)}>
      <div className="flex gap-2 flex-wrap">
      <div className="flex rounded-lg border border-stone-300 overflow-hidden divide-x divide-stone-300 w-fit text-xs">
        {([['face', '横軸：顔の大きさ'], ['pitch', '横軸：上下の傾き']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setAxis(v)} className={`px-3 py-1.5 ${axis === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>{l}</button>
        ))}
      </div>
      <div className="flex rounded-lg border border-stone-300 overflow-hidden divide-x divide-stone-300 w-fit text-xs">
        {([['eyeDist', '目間距離'], ['philtrum', '人中比']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setMetric(v)} className={`px-3 py-1.5 ${metric === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>{l}</button>
        ))}
      </div>
      </div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ fontFamily: FONT, background: '#ffffff' }}>
          <text x={L} y={18} fontSize={13} fontWeight={700} fill={INK}>{`${xLabel} × ${label}　${real.length}枚・${byCode.size}人`}</text>
          {ticks(x0, x1).map((t, i) => <g key={'x' + i}><line x1={X(t)} x2={X(t)} y1={T} y2={H - B} stroke="#f0eeec" /><text x={X(t)} y={H - B + 15} fontSize={10} textAnchor="middle" fill={GRAY}>{axis === 'face' ? t.toFixed(2) : `${t.toFixed(0)}°`}</text></g>)}
          {ticks(y0, y1).map((t, i) => <g key={'y' + i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#f0eeec" /><text x={L - 6} y={Y(t) + 3} fontSize={10} textAnchor="end" fill={GRAY}>{t.toFixed(3)}</text></g>)}
          <text x={(L + W - R) / 2} y={H - 12} fontSize={11} textAnchor="middle" fill={INK}>{axis === 'face' ? '顔の大きさ（画像幅に対する顔幅）　← 遠い　　近い →' : '上下の傾き（度）　← あおり（あごが手前）　　うつむき（スマホが顔より上） →'}</text>
          <text x={14} y={(T + H - B) / 2} fontSize={11} textAnchor="middle" fill={INK} transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{`${label}（測ったまま）`}</text>
          {axis === 'pitch' && <rect x={X(Math.max(x0, FRAMING_LIMITS.pitchMin))} y={T} width={Math.max(0, X(Math.min(x1, FRAMING_LIMITS.pitchMax)) - X(Math.max(x0, FRAMING_LIMITS.pitchMin)))} height={H - T - B} fill="#e7e5e4" opacity={0.5} />}
          {pts.map((p, i) => <circle key={i} cx={X(p.f)} cy={Y(p.v)} r={3.5} fill={p.test ? GRAY : INK} opacity={0.75} />)}
          {all && <line x1={X(x0)} x2={X(x1)} y1={Y(all.icpt + all.slope * x0)} y2={Y(all.icpt + all.slope * x1)} stroke={IDEAL} strokeWidth={2} />}
          <g transform={`translate(${L + 8}, ${T + 14})`}>
            <rect x={-6} y={-12} width={470} height={40} fill="#ffffff" opacity={0.9} rx={4} />
            {all && <text fontSize={11} fill={IDEAL}>{axis === 'face' ? `全体：r = ${fr(all.r)}、傾き ${all.slope.toFixed(3)}（顔の大きさ +0.1 で ${(all.slope * 0.1).toFixed(4)}）` : `全体：r = ${fr(all.r)}、1° あたり ${all.slope.toFixed(4)}`}</text>}
            {within && <text y={16} fontSize={11} fill={INK}>{`同じ人の中：r = ${fr(within.r)}、${axis === 'face' ? `傾き ${within.slope.toFixed(3)}` : `1° あたり ${within.slope.toFixed(4)}`}（${multi.length}人・${within.n}枚）　${axis === 'face' ? verdict(within.r) : ''}`}</text>}
          </g>
        </svg>
      </div>
      <p className="text-[11px] text-stone-500">「全体」は人ごとの顔の違いも混ざります。距離だけの効果は「同じ人の中」（同じ人を近い・遠いで撮った差）で見てください。</p>
    </Panel>
  );
}

// ── 6. 鼻の点の試算（保存写真から再検出。本番の定義は変えない） ──────────────

type NoseDef = 'alar' | 'lm2' | 'lm94';
const NOSE_DEFS: { key: NoseDef; label: string }[] = [
  { key: 'alar', label: '今（小鼻 98・327）' },
  { key: 'lm2', label: '鼻柱の付け根（目印2）' },
  { key: 'lm94', label: '鼻柱の付け根（目印94）' },
];

interface NoseRec { code: string; phase: string; takenAt: string; ok: boolean; test: boolean; v: Record<string, number> }

function noseValues(px: { brow: number; eye: number; lip: number; chin: number; faceW: number }, noses: Record<NoseDef, number>) {
  const v: Record<string, number> = {};
  for (const d of NOSE_DEFS) {
    const n = noses[d.key];
    v[`philtrum_${d.key}`] = (px.lip - n) / (px.chin - n);
    v[`midlow_${d.key}`] = (n - px.brow) / (px.chin - n);
    v[`noseFromEye_${d.key}`] = (n - px.eye) / px.faceW;
  }
  return v;
}

function summarizeNose(rows: { v: Record<string, number> }[]) {
  const out: Record<string, { n: number; ptMed: number | null; ptOut: number; mlMed: number | null; mlOut: number }> = {};
  for (const d of NOSE_DEFS) {
    const pt = rows.map(r => r.v[`philtrum_${d.key}`]).filter(isFinite), ml = rows.map(r => r.v[`midlow_${d.key}`]).filter(isFinite);
    out[d.key] = { n: pt.length, ptMed: median(pt), ptOut: pt.filter(x => Math.abs(x - 1 / 3) > 0.04).length, mlMed: median(ml), mlOut: ml.filter(x => Math.abs(x - 1) > 0.10).length };
  }
  return out;
}

/** 同じ人・同じ段階・同じ日の続けて撮った写真どうしの差（小さいほど安定） */
function stabilityNose(recs: NoseRec[]) {
  const groups = new Map<string, NoseRec[]>();
  for (const r of recs) { const k = `${r.code}|${r.phase}|${jstDate(r.takenAt)}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const out: Record<string, { pairs: number; nose: number | null; pt: number | null }> = {};
  for (const d of NOSE_DEFS) {
    const dn: number[] = [], dp: number[] = [];
    for (const g of Array.from(groups.values())) for (let i = 1; i < g.length; i++) {
      dn.push(Math.abs(g[i].v[`noseFromEye_${d.key}`] - g[i - 1].v[`noseFromEye_${d.key}`]));
      dp.push(Math.abs(g[i].v[`philtrum_${d.key}`] - g[i - 1].v[`philtrum_${d.key}`]));
    }
    out[d.key] = { pairs: dn.length, nose: median(dn), pt: median(dp) };
  }
  return out;
}

function NoseTrial({ captures, list }: { captures: CaptureRow[]; list: ParticipantSummary[] }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState('');
  const [recs, setRecs] = useState<NoseRec[] | null>(null);
  const [y2025, setY2025] = useState<Row2025[] | null>(null);
  const [saveMsg, setSaveMsg] = useState('');
  useEffect(() => { import('@/data/mw2025_metrics_v2.json').then(m => setY2025(m.default as unknown as Row2025[])); }, []);
  const codeOf = new Map(list.map(p => [p.token, p.subjectCode]));
  const targets = captures.filter(c => c.image_path && codeOf.has(c.participant_token));

  const run = async () => {
    setState('running'); setSaveMsg('');
    const out: NoseRec[] = [];
    for (let i = 0; i < targets.length; i += 40) {
      const chunk = targets.slice(i, i + 40);
      const urls = await staffMediaUrls(chunk.map(c => c.image_path!));
      for (const c of chunk) {
        setProgress(`${out.length + 1} / ${targets.length}`);
        const url = urls[c.image_path!];
        if (!url) continue;
        try {
          const r = await detectFaceLandmarksWithRaw(url, [2, 94]);
          if (!r) continue;
          const g = r.guide, w = g.imageWidth!, h = g.imageHeight!;
          const code = codeOf.get(c.participant_token)!;
          out.push({
            code, phase: c.phase, takenAt: c.taken_at, ok: c.framing?.ok === true, test: TEST_CODES.has(code.toUpperCase()),
            v: noseValues({ brow: g.eyebrowLineY * h, eye: g.eyeLineY * h, lip: g.lipLineY * h, chin: g.chinLineY * h, faceW: (g.faceRightX - g.faceLeftX) * w },
              { alar: g.noseBaseLineY * h, lm2: r.rawY[2], lm94: r.rawY[94] }),
          });
        } catch { /* 読めない写真は飛ばす */ }
      }
    }
    setRecs(out); setState('done'); setProgress(`${out.length} / ${targets.length} 枚を測りました`);
    // 数値だけを残す（写真は入れない）。名前も入れない
    const latest = latestOkBefore(out.filter(r => !r.test));
    const result = {
      version: 1, measured: out.length, total: targets.length,
      y2026_latestOkBefore: summarizeNose(latest), y2026_all: summarizeNose(out.filter(r => !r.test)), stability2026: stabilityNose(out.filter(r => !r.test)),
      records: out.map(r => ({ code: r.code, phase: r.phase, takenAt: r.takenAt, ok: r.ok, test: r.test, ...Object.fromEntries(Object.entries(r.v).map(([k, x]) => [k, Math.round(x * 1e5) / 1e5])) })),
    };
    const supabase = getSupabaseClient();
    const { error } = supabase ? await supabase.rpc('pilot_staff_save_analysis', { p_kind: 'nose_point_trial', p_result: result }) : { error: { message: 'Supabase 未設定' } };
    setSaveMsg(error ? `結果を保存できませんでした（${error.message}）` : '結果を保存しました（数値だけ）');
  };

  const rows2025 = (ph: 'before' | 'after') => (y2025 ?? []).filter(r => r.phase === ph && r.ok && typeof r.philtrum_lm2 === 'number').map(r => ({ v: r as unknown as Record<string, number> }));
  const groups = [
    ...(recs ? [{ label: '2026 今回（各自の写り○の最新のメイク前）', s: summarizeNose(latestOkBefore(recs.filter(r => !r.test))) }, { label: '2026 今回（全記録・テスト除く）', s: summarizeNose(recs.filter(r => !r.test)) }] : []),
    ...(y2025 ? [{ label: '2025 説明会（スマホ）', s: summarizeNose(rows2025('before')) }, { label: '2025 スタジオ', s: summarizeNose(rows2025('after')) }] : []),
  ];
  const stab = recs ? stabilityNose(recs.filter(r => !r.test)) : null;
  const f3 = (v: number | null) => v == null ? '—' : v.toFixed(3);

  return (
    <Panel title="6. 鼻の点の試算（保存写真から再検出）" sub="人中比と中顔面÷下顔面を、鼻の点を3通りにして測り直す。本番の定義は変えない。範囲外＝人中比は 1/3±0.04、中顔面÷下顔面は 1±0.10"
      onSave={() => {}} saveLabel="">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button type="button" onClick={run} disabled={state === 'running' || targets.length === 0} className={ghostBtn}>{state === 'running' ? '測っています…' : `試算する（${targets.length}枚）`}</button>
        <span className="text-stone-500">{progress}</span>
        {saveMsg && <span className="text-stone-600">{saveMsg}</span>}
      </div>
      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs min-w-full">
            <thead><tr className="text-stone-400 text-[10px] text-left"><th className="py-1 px-2">組</th>{NOSE_DEFS.map(d => <th key={d.key} className="px-2">{d.label}<br />人中比（範囲外）／中顔面÷下顔面（範囲外）</th>)}</tr></thead>
            <tbody>{groups.map(g => (
              <tr key={g.label} className="border-t border-stone-100">
                <td className="py-1.5 px-2 whitespace-nowrap text-stone-700">{g.label}<span className="text-stone-400 ml-1">n={g.s.alar.n}</span></td>
                {NOSE_DEFS.map(d => <td key={d.key} className="px-2 tabular-nums whitespace-nowrap">{f3(g.s[d.key].ptMed)}（{g.s[d.key].ptOut}）／{f3(g.s[d.key].mlMed)}（{g.s[d.key].mlOut}）</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {stab && (
        <p className="text-[11px] text-stone-500">安定性（同じ人・同じ日に続けて撮った写真どうしの差の中央値、{stab.alar.pairs}組）：
          {NOSE_DEFS.map(d => ` ${d.label} 鼻の位置 ${stab[d.key].nose?.toFixed(4) ?? '—'}・人中比 ${stab[d.key].pt?.toFixed(4) ?? '—'}`).join('／')}</p>
      )}
    </Panel>
  );
}

function latestOkBefore(recs: NoseRec[]) {
  const by = new Map<string, NoseRec>();
  for (const r of recs) if (r.phase === 'before' && r.ok) { const cur = by.get(r.code); if (!cur || cur.takenAt < r.takenAt) by.set(r.code, r); }
  return Array.from(by.values());
}

// ── 7. 顔の上下の傾きの試算（保存写真から再検出） ─────────────────────────

interface PitchRec { code: string; phase: string; takenAt: string; ok: boolean; test: boolean; pitch: number; philtrum: number; midlow: number; faceWidthFrac: number }

function corrWithin(recs: { code: string; x: number; y: number }[]) {
  const by = new Map<string, { x: number; y: number }[]>();
  for (const r of recs) by.set(r.code, [...(by.get(r.code) ?? []), r]);
  const dx: number[] = [], dy: number[] = [];
  let people = 0;
  for (const a of Array.from(by.values())) {
    if (a.length < 2) continue;
    people++;
    const mx = a.reduce((s, p) => s + p.x, 0) / a.length, my = a.reduce((s, p) => s + p.y, 0) / a.length;
    for (const p of a) { dx.push(p.x - mx); dy.push(p.y - my); }
  }
  const r = regress(dx, dy);
  return r ? { ...r, people } : null;
}

function PitchTrial({ captures, list }: { captures: CaptureRow[]; list: ParticipantSummary[] }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState('');
  const [recs, setRecs] = useState<PitchRec[] | null>(null);
  const [y2025, setY2025] = useState<Row2025[] | null>(null);
  const [saveMsg, setSaveMsg] = useState('');
  useEffect(() => { import('@/data/mw2025_metrics_v2.json').then(m => setY2025(m.default as unknown as Row2025[])); }, []);
  const codeOf = new Map(list.map(p => [p.token, p.subjectCode]));
  const targets = captures.filter(c => c.image_path && codeOf.has(c.participant_token));

  const summarize = (rs: PitchRec[]) => {
    const real = rs.filter(r => !r.test);
    const latest = Array.from(real.filter(r => r.phase === 'before' && r.ok).reduce((m, r) => { const c = m.get(r.code); if (!c || c.takenAt < r.takenAt) m.set(r.code, r); return m; }, new Map<string, PitchRec>()).values());
    const all = (k: 'philtrum' | 'midlow') => regress(real.map(r => r.pitch), real.map(r => r[k]));
    const within = (k: 'philtrum' | 'midlow') => corrWithin(real.map(r => ({ code: r.code, x: r.pitch, y: r[k] })));
    return {
      latestN: latest.length, latestPitchMed: median(latest.map(r => r.pitch)), allN: real.length, allPitchMed: median(real.map(r => r.pitch)),
      allPitchMin: Math.min(...real.map(r => r.pitch)), allPitchMax: Math.max(...real.map(r => r.pitch)),
      rAll: { philtrum: all('philtrum'), midlow: all('midlow') }, rWithin: { philtrum: within('philtrum'), midlow: within('midlow') },
      pitchVsDistance: regress(real.map(r => r.faceWidthFrac), real.map(r => r.pitch)),
    };
  };

  const run = async () => {
    setState('running'); setSaveMsg('');
    const out: PitchRec[] = [];
    for (let i = 0; i < targets.length; i += 40) {
      const chunk = targets.slice(i, i + 40);
      const urls = await staffMediaUrls(chunk.map(c => c.image_path!));
      for (const c of chunk) {
        setProgress(`${out.length + 1} / ${targets.length}`);
        const url = urls[c.image_path!];
        if (!url) continue;
        try {
          const r = await detectFaceLandmarksWithRaw(url, [10, 152]);
          if (!r) continue;
          const g = r.guide, m = computePilotMetrics(g, g.imageWidth!, g.imageHeight!);
          const code = codeOf.get(c.participant_token)!;
          out.push({ code, phase: c.phase, takenAt: c.taken_at, ok: c.framing?.ok === true, test: TEST_CODES.has(code.toUpperCase()),
            pitch: estimatePitchDeg(r.rawPts[10], r.rawPts[152]), philtrum: m.philtrum, midlow: m.zone2 / m.zone3, faceWidthFrac: g.faceRightX - g.faceLeftX });
        } catch { /* 読めない写真は飛ばす */ }
      }
    }
    setRecs(out); setState('done'); setProgress(`${out.length} / ${targets.length} 枚を測りました`);
    const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
    const result = { version: 1, measured: out.length, total: targets.length, summary2026: summarize(out),
      records: out.map(r => ({ code: r.code, phase: r.phase, takenAt: r.takenAt, ok: r.ok, test: r.test, pitch: r4(r.pitch), philtrum: r4(r.philtrum), midlow: r4(r.midlow), faceWidthFrac: r4(r.faceWidthFrac) })) };
    const supabase = getSupabaseClient();
    const { error } = supabase ? await supabase.rpc('pilot_staff_save_analysis', { p_kind: 'pitch_trial', p_result: result }) : { error: { message: 'Supabase 未設定' } };
    setSaveMsg(error ? `結果を保存できませんでした（${error.message}）` : '結果を保存しました（数値だけ）');
  };

  const s26 = recs ? summarize(recs) : null;
  const p25 = (ph: 'before' | 'after') => (y2025 ?? []).filter(r => r.phase === ph && typeof r.pitch === 'number').map(r => r.pitch as number);
  const f1 = (v: number | null | undefined) => v == null ? '—' : `${v.toFixed(1)}°`;
  const fr = (x: { r: number } | null) => x ? x.r.toFixed(2) : '—';

  return (
    <Panel title="7. 顔の上下の傾きの試算（保存写真から再検出）" sub="額の上端（目印10）とあご先（目印152）の奥行きの差から上下の角度を推定。大きいほど、あご先が奥（うつむき／スマホが顔より上）。本番の判定には使っていない" onSave={() => {}} saveLabel="">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <button type="button" onClick={run} disabled={state === 'running' || targets.length === 0} className={ghostBtn}>{state === 'running' ? '測っています…' : `試算する（${targets.length}枚）`}</button>
        <span className="text-stone-500">{progress}</span>
        {saveMsg && <span className="text-stone-600">{saveMsg}</span>}
      </div>
      <table className="text-xs">
        <thead><tr className="text-stone-400 text-[10px] text-left"><th className="py-1 px-2">組</th><th className="px-2">傾きの中央値</th><th className="px-2">人中比との相関 r（全体／同じ人の中）</th><th className="px-2">中顔面÷下顔面との相関 r（全体／同じ人の中）</th></tr></thead>
        <tbody>
          {s26 && <tr className="border-t border-stone-100"><td className="py-1.5 px-2">2026 今回（全記録 {s26.allN}枚）</td><td className="px-2 tabular-nums">{f1(s26.allPitchMed)}（{f1(s26.allPitchMin)}〜{f1(s26.allPitchMax)}）／最新メイク前 {f1(s26.latestPitchMed)}</td>
            <td className="px-2 tabular-nums">{fr(s26.rAll.philtrum)}／{fr(s26.rWithin.philtrum)}</td><td className="px-2 tabular-nums">{fr(s26.rAll.midlow)}／{fr(s26.rWithin.midlow)}</td></tr>}
          {y2025 && (['before', 'after'] as const).map(ph => (
            <tr key={ph} className="border-t border-stone-100"><td className="py-1.5 px-2">{ph === 'before' ? '2025 説明会（スマホ）' : '2025 スタジオ'}</td><td className="px-2 tabular-nums">{f1(median(p25(ph)))}</td><td className="px-2 text-stone-400" colSpan={2}>（去年の値は手元で計算済み）</td></tr>
          ))}
        </tbody>
      </table>
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
        {saveLabel && <button type="button" onClick={onSave} className={ghostBtn}><Download className="w-3.5 h-3.5" /> {saveLabel}</button>}
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
