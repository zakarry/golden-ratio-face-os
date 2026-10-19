'use client';

// 運営ページの参加者詳細：「寄せ方」欄
// 本人（写り○の最新のメイク前）と、目標（黄金比＋測定済みの似ている人）を計算で比べる。生成AIは使わない。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Copy, RefreshCw, Save } from 'lucide-react';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { PilotHistoryItem } from '@/lib/pilot/pilotStorage';
import { STRENGTH_LABEL } from '@/lib/pilot/prescription';
import { staffMediaUrls } from '@/lib/pilot/staff';
import { fetchSurveyForStaff, REFERENCE_KIND_LABEL, type StaffReferenceRow } from '@/lib/pilot/survey';
import type { YosePurpose, YoseResult, YoseRow } from '@/lib/pilot/yosekata';
import { PILOT_PURPOSE, YOSE_PURPOSES, YOSEKATA_VERSION } from '@/lib/pilot/yosekata';
import { buildGeminiPrompt } from '@/lib/pilot/geminiPrompt';
import { SMARTPHONE_NOTE } from '@/lib/pilot/targetCard';
import { TRI_COLOR, TriangleLegend, TriangleSvg } from './RefCompare';
import { buildYoseBundle, fetchRecordGuide, listSavedYosekata, yoseSubjectFromRecords, saveYosekata, saveYosekataFromStaffSource, type SavedYoseRow } from '@/lib/pilot/yosekataStaff';
import { listStaffSources, type StaffSourceRow } from '@/lib/pilot/render';
import StaffSourceUpload, { STAFF_SOURCE_EVENT } from './StaffSourceUpload';

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
const COLOR = TRI_COLOR;

export default function StaffYosekata({ code, token, history }: { code: string; token: string; history: PilotHistoryItem[] }) {
  const { subject: recSubject, retake } = useMemo(() => yoseSubjectFromRecords(history), [history]);
  const [refs, setRefs] = useState<StaffReferenceRow[] | null>(null);
  const [saved, setSaved] = useState<SavedYoseRow[] | null>(null);
  // 運営がアップロードした写真（撮影の場で撮り直したもの）。選んだときだけ本人として使う
  const [staffSources, setStaffSources] = useState<StaffSourceRow[]>([]);
  // 本人：'records'＝記録の中央値、'staff:<id>'＝運営の写真
  const [subjSel, setSubjSel] = useState<string>('');
  const [sel, setSel] = useState(0);
  // 目的（宣材／舞台／日常）。パイロットの既定は宣材
  const [purpose, setPurpose] = useState<YosePurpose>(PILOT_PURPOSE);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, s, ss] = await Promise.all([fetchSurveyForStaff(token), listSavedYosekata(code), listStaffSources(token)]);
      setRefs(d.refs); setSaved(s); setStaffSources(ss);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [token, code]);
  useEffect(() => { load(); }, [load]);
  // アンケート欄で似ている人を追加・測定したら計算し直す。運営の写真が上がったら読み直す
  useEffect(() => {
    window.addEventListener('pilot-refs-updated', load);
    window.addEventListener(STAFF_SOURCE_EVENT, load);
    return () => { window.removeEventListener('pilot-refs-updated', load); window.removeEventListener(STAFF_SOURCE_EVENT, load); };
  }, [load]);

  // 既定：記録の中央値があればそれ、無ければ最新の運営の写真
  useEffect(() => {
    if (subjSel === 'records' && recSubject) return;
    if (subjSel.startsWith('staff:') && staffSources.some(x => `staff:${x.id}` === subjSel)) return;
    setSubjSel(recSubject ? 'records' : staffSources[0] ? `staff:${staffSources[0].id}` : '');
  }, [recSubject, staffSources, subjSel]);

  const staffSubject = subjSel.startsWith('staff:') ? staffSources.find(x => `staff:${x.id}` === subjSel) ?? null : null;
  const subjectMetrics = staffSubject?.metrics ?? (subjSel === 'records' ? recSubject?.metrics : null) ?? null;

  const bundle = useMemo(() => subjectMetrics && refs ? buildYoseBundle(code, subjectMetrics, refs, purpose) : null, [code, subjectMetrics, refs, purpose]);
  const current = bundle?.results[Math.min(sel, bundle.results.length - 1)]?.result ?? null;

  const save = async () => {
    if (!bundle) return;
    setBusy(true); setMsg('');
    const err = staffSubject
      ? await saveYosekataFromStaffSource(staffSubject.id, bundle.results)
      : recSubject ? await saveYosekata(recSubject.id, bundle.results) : '本人の写真がありません';
    setBusy(false);
    setMsg(err ? `保存できませんでした（${err}）` : `保存しました（${bundle.results.length}件）。下の「完成イメージ」の寄せ先で選べます`);
    if (!err) {
      listSavedYosekata(code).then(setSaved).catch(() => {});
      // 完成イメージ欄の「寄せ先」を読み直させる
      window.dispatchEvent(new Event('pilot-yosekata-saved'));
    }
  };

  const hasAnySubject = !!recSubject || staffSources.length > 0;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><Compass className="w-4 h-4" /> 寄せ方</p>
        <span className="text-[10px] text-stone-400">計算の版 {YOSEKATA_VERSION}</span>
        <div className="ml-auto flex gap-2">
          <div className="flex rounded-lg border border-stone-300 overflow-hidden divide-x divide-stone-300 text-xs" title="目的：形の判定は変わらず、強度と言葉だけが変わる">
            {YOSE_PURPOSES.map(v => (
              <button key={v} type="button" onClick={() => setPurpose(v)} className={`px-3 py-1.5 ${purpose === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>{v}</button>
            ))}
          </div>
          <button type="button" onClick={() => { setMsg(''); load(); }} className={btn}><RefreshCw className="w-3.5 h-3.5" /> 再計算</button>
          {bundle && <button type="button" onClick={save} disabled={busy} className={saveBtn}><Save className="w-3.5 h-3.5" /> {busy ? '保存中…' : '保存'}</button>}
        </div>
      </div>

      {/* 本人：記録の中央値か、運営がアップロードした写真か */}
      <div className="flex flex-wrap items-start gap-2 text-xs">
        <span className="text-stone-600 pt-1.5">本人</span>
        <select value={subjSel} onChange={e => { setSubjSel(e.target.value); setMsg(''); }} className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-800 bg-white min-w-[16rem]" disabled={!hasAnySubject}>
          {!hasAnySubject && <option value="">本人の写真がありません</option>}
          {recSubject && <option value="records">記録（写り○のメイク前 {recSubject.count}枚の中央値・最新 {fmtDate(recSubject.takenAt)}）</option>}
          {staffSources.map(x => <option key={x.id} value={`staff:${x.id}`}>運営の写真 {fmtDate(x.created_at)}{x.framing?.ok ? '' : '（写り×）'}</option>)}
        </select>
        <StaffSourceUpload token={token} code={code} onUploaded={row => { setSubjSel(`staff:${row.id}`); setMsg(''); }} />
      </div>
      {staffSubject && (
        <p className="text-[11px] text-stone-500">
          運営の写真を本人にして計算しています。記録の中央値・要撮り直しの判定には入りません。
          {staffSubject.framing && !staffSubject.framing.ok && <span className="text-rose-700">　写り×：{staffSubject.framing.warnings?.join('／')}</span>}
        </p>
      )}

      {msg && <p className="text-xs text-stone-600">{msg}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!recSubject && retake && (
        <p className="text-xs font-semibold text-amber-700">
          {retake.label}：{retake.reason}。
          {staffSources.length ? '下の計算は運営の写真を本人にしています。' : '写り○・傾き 8〜20°・近すぎないメイク前が1枚入るか、「運営がアップロード」で本人の写真を1枚入れると、寄せ方が出ます。'}
        </p>
      )}
      {!recSubject && !retake && !staffSources.length && <p className="text-xs text-stone-500">まだ撮影がないので、寄せ方は出せません（「運営がアップロード」で本人の写真を入れると出せます）。</p>}
      {subjectMetrics && !refs && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}

      {bundle && (
        <>
          {staffSubject
            ? <SubjectPhoto path={staffSubject.image_path} guide={staffSubject.guide} />
            : recSubject && <SubjectPhoto recordId={recSubject.id} />}

          {bundle.summary.length > 0 && <SummaryTable bundle={bundle} />}
          {bundle.results.length === 1 && <p className="text-xs text-stone-500">測定済みの「似ている人」がまだいないので、黄金比だけで出しています（アンケート欄で測定・保存すると増えます）。</p>}

          <div className="flex flex-wrap gap-1.5">
            {bundle.results.map(({ result }, i) => (
              <button key={i} type="button" onClick={() => setSel(i)}
                className={`rounded-full px-3 py-1 text-xs border ${i === sel ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-700 border-stone-200'}`}>
                {result.targetKind === 'ideal' ? '黄金比' : result.targetName}
                {result.targetKind !== 'ideal' && <span className="opacity-60 ml-1 text-[10px]">{REFERENCE_KIND_LABEL[result.targetKind]}</span>}
              </button>
            ))}
          </div>
          {current && <TargetView r={current} />}
        </>
      )}

      {saved && saved.length > 0 && <SavedList saved={saved} />}
    </div>
  );
}

// ── 1目標ぶん：三角形・ずれ地図・判定・文章
/** 画像生成AI（Gemini）への指示文をコピー（運営・メイクさん向けの内部資料。本人には出さない） */
function GeminiCopy({ r }: { r: YoseResult }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const prompt = useMemo(() => buildGeminiPrompt(r), [r]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(prompt); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setOpen(true); }
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={copy} className={btn}><Copy className="w-3.5 h-3.5" /> {done ? 'コピーしました' : 'Geminiへの指示文をコピー'}</button>
        <button type="button" onClick={() => setOpen(v => !v)} className="text-[11px] text-stone-500 underline">{open ? '指示文を閉じる' : '指示文を見る'}</button>
      </div>
      {open && <pre className="whitespace-pre-wrap text-[11px] text-stone-700 bg-white border border-stone-200 rounded-lg p-3 font-sans leading-relaxed">{prompt}</pre>}
    </div>
  );
}

function TargetView({ r }: { r: YoseResult }) {
  const tn = r.targetKind === 'ideal' ? '黄金比' : r.targetName;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-stone-600">逆三角形（両目と口・単位は顔幅）</p>
          <TriangleSvg tri={r.triangle} showTarget={r.targetKind !== 'ideal'} />
          <TriangleLegend targetLabel={tn} showTarget={r.targetKind !== 'ideal'} />
        </div>
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-semibold text-stone-600">ずれ地図（中央＝本人、灰色＝許容幅、横軸は許容幅の何倍か）</p>
          <GapMap rows={r.rows} />
        </div>
      </div>
      <JudgeTable rows={r.rows} tn={tn} showIdeal={r.targetKind !== 'ideal'} />
      {r.config.selfCorrection?.eyeDist != null && <p className="text-[10px] text-stone-500">目間距離は{SMARTPHONE_NOTE}を入れて黄金比と比べています{r.targetKind !== 'ideal' && '（この人との差には入れていません）'}。</p>}
      <pre className="whitespace-pre-wrap text-xs text-stone-800 bg-stone-50 rounded-lg p-3 font-sans leading-relaxed">{r.text}</pre>
      <GeminiCopy r={r} />
    </div>
  );
}

/** 指標ごとの横線。横軸 = (値−本人)/許容幅。±6倍で端に寄せる */
function GapMap({ rows }: { rows: YoseRow[] }) {
  const LW = 150, W = 520, RH = 28, MAX = 6;
  const u = (W - LW - 16) / (2 * MAX);
  const cx = LW + (W - LW) / 2;
  const X = (v: number) => cx + Math.max(-MAX, Math.min(MAX, v)) * u;
  const H = rows.length * RH + 20;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[520px] bg-stone-50 rounded-lg">
      {[-MAX, -3, -2, -1, 0, 1, 2, 3, MAX].map(t => (
        <text key={t} x={X(t)} y={H - 5} fontSize={9} textAnchor="middle" fill="#a8a29e">{t === 0 ? '本人' : (t > 0 ? '+' : '') + t}</text>
      ))}
      {rows.map((r, i) => {
        const y = 14 + i * RH;
        const t = r.gap / r.tolerance;
        const g = (r.ideal - r.self) / r.tolerance;
        return (
          <g key={r.id}>
            <text x={4} y={y + 4} fontSize={10} fill="#44403c">{r.label}</text>
            <line x1={LW} x2={W - 8} y1={y} y2={y} stroke="#d6d3d1" />
            <rect x={X(-1)} y={y - 7} width={X(1) - X(-1)} height={14} fill="#e7e5e4" />
            <line x1={X(g)} x2={X(g)} y1={y - 10} y2={y + 10} stroke={COLOR.ideal} strokeWidth={1.5} strokeDasharray="3 2" />
            <circle cx={cx} cy={y} r={4} fill={COLOR.self} />
            <text x={X(t)} y={y + 5} fontSize={14} textAnchor="middle" fill={COLOR.target}>★</text>
            {Math.abs(t) > MAX && <text x={X(t) + (t > 0 ? -12 : 12)} y={y - 6} fontSize={8} textAnchor="middle" fill={COLOR.target}>{t.toFixed(1)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function judgeLabel(x: YoseRow): string {
  if (x.relation === 'same') return '似ている・触らない';
  if (x.relation === 'keep') return '追わない';
  if (x.relation === 'conflict') return `${x.direction}？ 黄金比と逆`;
  return `${x.direction}（${STRENGTH_LABEL[x.strength!]}）`;
}

const fv = (v: number, unit: '' | '°') => unit === '°' ? `${v.toFixed(1)}°` : v.toFixed(3);

// 目標が黄金比のときは「黄金比」の列が重なるので出さない
function JudgeTable({ rows, tn, showIdeal }: { rows: YoseRow[]; tn: string; showIdeal: boolean }) {
  const tone = (x: YoseRow) => x.relation === 'same' ? 'text-emerald-700' : x.relation === 'conflict' ? 'text-amber-700' : x.relation === 'keep' ? 'text-stone-400' : 'text-blue-700';
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-stone-400 text-[10px]"><th className="text-left py-1 px-2">指標</th><th className="text-right px-2">本人</th><th className="text-right px-2">{tn}</th>{showIdeal && <th className="text-right px-2">黄金比</th>}<th className="text-right px-2">差</th><th className="text-left px-2">判定</th></tr></thead>
      <tbody>{rows.map(x => (
        <tr key={x.id} className="border-t border-stone-100">
          <td className="py-1 px-2 text-stone-700">{x.label}</td>
          <td className="text-right px-2 tabular-nums">{fv(x.self, x.unit)}</td>
          <td className="text-right px-2 tabular-nums">{fv(x.target, x.unit)}</td>
          {showIdeal && <td className="text-right px-2 tabular-nums text-stone-400">{fv(x.ideal, x.unit)}</td>}
          <td className="text-right px-2 tabular-nums">{(x.gap >= 0 ? '+' : '') + fv(x.gap, x.unit)}</td>
          <td className={`px-2 font-semibold ${tone(x)}`}>{judgeLabel(x)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** 似ている人どうしの束ね（指標ごとに全員同じ方向／割れる） */
function SummaryTable({ bundle }: { bundle: NonNullable<ReturnType<typeof buildYoseBundle>> }) {
  const names = bundle.results.slice(1).map(x => x.result.targetName);
  const ideal = bundle.results[0].result;
  const tone: Record<string, string> = { '全員が似ている': 'text-emerald-700', '全員同じ方向': 'text-blue-700', '割れる': 'text-amber-700', '追わない': 'text-stone-400' };
  return (
    <div className="space-y-1 overflow-x-auto">
      <p className="text-xs font-semibold text-stone-600">似ている人の束ね</p>
      <table className="text-xs min-w-full">
        <thead><tr className="text-stone-400 text-[10px]">
          <th className="text-left py-1 px-2">指標</th><th className="text-left px-2">まとめ</th>
          {names.map((n, i) => <th key={i} className="text-left px-2 whitespace-nowrap">{n}</th>)}
          <th className="text-left px-2" style={{ color: COLOR.ideal }}>黄金比</th>
        </tr></thead>
        <tbody>{bundle.summary.map(s => {
          const ir = ideal.rows.find(x => x.id === s.id);
          return (
            <tr key={s.id} className="border-t border-stone-100">
              <td className="py-1 px-2 text-stone-700 whitespace-nowrap">{s.label}</td>
              <td className={`px-2 font-semibold whitespace-nowrap ${tone[s.verdict]}`}>{s.verdict}{s.direction && `：${s.direction}`}</td>
              {bundle.results.slice(1).map((x, i) => {
                const row = x.result.rows.find(r => r.id === s.id)!;
                return <td key={i} className="px-2 whitespace-nowrap text-stone-600">{row.relation === 'same' ? '似ている' : row.relation === 'keep' ? '追わない' : row.relation === 'conflict' ? `${row.direction}？` : row.direction}</td>;
              })}
              <td className="px-2 whitespace-nowrap text-stone-500">{ir ? (ir.relation === 'same' ? '範囲内' : ir.direction) : ''}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

/** 本人の素顔に三角形（本人＝黒、黄金比＝赤点線）。写真の縦横比は変えない */
// 記録（recordId）か、運営の写真（path＋guide）のどちらか
function SubjectPhoto({ recordId, path, guide: staffGuide }: { recordId?: string; path?: string; guide?: DetectedGuide | null }) {
  const [guide, setGuide] = useState<DetectedGuide | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading'); setSize(null);
    const fetchGuide = path
      ? Promise.resolve({ guide: staffGuide ?? null, image_path: path })
      : fetchRecordGuide(recordId!);
    fetchGuide.then(async d => {
      if (!alive) return;
      if (!d?.guide || !d.image_path) { setState('none'); return; }
      const urls = await staffMediaUrls([d.image_path]);
      if (!alive) return;
      setGuide(d.guide); setUrl(urls[d.image_path] ?? null); setState(urls[d.image_path] ? 'ok' : 'none');
    }).catch(() => { if (alive) setState('none'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, path]);

  if (state === 'loading') return <p className="text-xs text-stone-400">写真を読み込んでいます…</p>;
  if (state === 'none' || !guide || !url) return <p className="text-xs text-stone-400">写真がないため、三角形の重ね描きは出せません。</p>;

  let overlay: React.ReactNode = null;
  if (size) {
    const { w, h } = size;
    const L = { x: guide.leftEyeX * w, y: guide.leftEyeY * h };
    const R = { x: guide.rightEyeX * w, y: guide.rightEyeY * h };
    const M = { x: guide.mouthCenterX * w, y: guide.lipLineY * h };
    const mid = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
    const fw = (guide.faceRightX - guide.faceLeftX) * w;
    const fh = (guide.chinLineY - guide.foreheadY) * h;
    const ib = 0.46 * fw / 2, ih = 0.36 * fh;
    const sw = Math.max(2, w / 250);
    overlay = (
      <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full pointer-events-none">
        <polygon points={`${mid.x - ib},${mid.y} ${mid.x + ib},${mid.y} ${mid.x},${mid.y + ih}`} fill="none" stroke={COLOR.ideal} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />
        <polygon points={`${L.x},${L.y} ${R.x},${R.y} ${M.x},${M.y}`} fill="none" stroke="#ffffff" strokeWidth={sw * 2.2} opacity={0.7} />
        <polygon points={`${L.x},${L.y} ${R.x},${R.y} ${M.x},${M.y}`} fill="none" stroke={COLOR.self} strokeWidth={sw} />
        <circle cx={mid.x} cy={mid.y} r={sw * 1.5} fill={COLOR.self} />
      </svg>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-stone-600">素顔に三角形（本人＝黒、黄金比＝赤点線。底辺の中点と目の高さを揃える）</p>
      <div className="relative inline-block w-56 max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="本人の素顔" className="block w-full h-auto rounded-lg" onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {overlay}
      </div>
    </div>
  );
}

/** 保存済み（日付つき・新しい順）。版が違うものは別の行で残っている */
function SavedList({ saved }: { saved: SavedYoseRow[] }) {
  const groups = new Map<string, SavedYoseRow[]>();
  for (const s of saved) {
    const key = `${fmtDate(s.created_at).slice(0, -3)}｜${s.version}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-stone-600">保存済み（{saved.length}件）</p>
      {Array.from(groups.entries()).map(([key, rows]) => (
        <details key={key} className="rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-stone-700">
            {fmtDate(rows[0].created_at)}　{rows.map(r => r.target_kind === 'ideal' ? '黄金比' : r.target_name).join('・')}
            <span className="text-[10px] text-stone-400 ml-2">{rows[0].version}{rows[0].version !== YOSEKATA_VERSION && '（前の版）'}{rows[0].created_by && `・${rows[0].created_by}`}</span>
          </summary>
          <div className="space-y-2 pt-2">
            {rows.map(r => <pre key={r.id} className="whitespace-pre-wrap font-sans text-stone-700 leading-relaxed">{r.text}</pre>)}
          </div>
        </details>
      ))}
    </div>
  );
}

const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5 disabled:opacity-40';
const saveBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-800 text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-40';
