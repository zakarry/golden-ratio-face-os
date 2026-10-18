'use client';

// 運営ページの参加者詳細：「完成イメージ」欄（寄せ方の下）
// 素顔＋保存済みの寄せ方 → 指示文 → Gemini と ChatGPT で1枚ずつ生成 → ブラウザで測って骨格の差を出す → 採否と症例一行を記録。
// 参加者のページには出さない。生成画像の縦横比は変えて表示しない（object-fit: contain）。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ImagePlus, RefreshCw, Sparkles, X, Zap } from 'lucide-react';
import type { PilotHistoryItem } from '@/lib/pilot/pilotStorage';
import { usableBefore } from '@/lib/pilot/pilotStorage';
import { staffMediaUrls } from '@/lib/pilot/staff';
import { fetchSurveyForStaff, type SurveyAnswers } from '@/lib/pilot/survey';
import { YOSE_METRICS } from '@/lib/pilot/yosekata';
import { listSavedYosekataResults, type SavedYoseRow } from '@/lib/pilot/yosekataStaff';
import type { YoseResult } from '@/lib/pilot/yosekata';
import { buildStrengthenPrompt, ENGINE_NOTES, type RenderEngine, type RenderPurpose } from '@/lib/pilot/renderPrompt';
import {
  buildPrompt, fetchRenderStatus, generateRender, listRenders, measureSource, promptOptionsFromSurvey, setRenderDecision,
  RENDER_ENGINE_LABEL, RENDER_PURPOSE_LABEL, type RenderDecision, type RenderRow, type RenderSource, type RenderStatus,
} from '@/lib/pilot/render';

const ENGINES: RenderEngine[] = ['gemini', 'openai'];
const PURPOSES: RenderPurpose[] = ['hp', 'portrait', 'stage'];
const fmtDate = (iso: string) => new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
const PURPOSE_JA: Record<string, string> = { 宣材: '宣材', 舞台: '舞台', 日常: '日常' };

type SavedYose = SavedYoseRow & { result: YoseResult };

export default function StaffRender({ code, token, history }: { code: string; token: string; history: PilotHistoryItem[] }) {
  // 素顔の候補：写り○・傾き 8〜20°・近すぎないメイク前（新しい順）
  const befores = useMemo(() => history.filter(h => h.imagePath && h.metrics && usableBefore(h)).sort((a, b) => b.takenAt.localeCompare(a.takenAt)), [history]);
  const [srcId, setSrcId] = useState<string>('');
  const [source, setSource] = useState<RenderSource | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedYose[] | null>(null);
  const [yoseId, setYoseId] = useState('');
  const [purpose, setPurpose] = useState<RenderPurpose>('hp');
  const [answers, setAnswers] = useState<SurveyAnswers | null>(null);
  const [status, setStatus] = useState<RenderStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [override, setOverride] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [running, setRunning] = useState<Partial<Record<RenderEngine, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<RenderEngine, string>>>({});
  const [error, setError] = useState('');

  useEffect(() => { if (!srcId && befores[0]) setSrcId(befores[0].id); }, [befores, srcId]);

  const loadRenders = useCallback(async () => {
    const rows = await listRenders(token);
    setRenders(rows);
    const need = rows.map(r => r.image_path);
    if (need.length) setUrls(await staffMediaUrls(need));
  }, [token]);

  useEffect(() => {
    setError('');
    Promise.all([listSavedYosekataResults(code), fetchSurveyForStaff(token), loadRenders()])
      .then(([s, sv]) => { setSaved(s); setAnswers(sv.survey?.answers ?? null); if (s[0]) setYoseId(id => id || s[0].id); })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
    fetchRenderStatus().then(setStatus).catch(e => setStatusErr(e instanceof Error ? e.message : String(e)));
  }, [code, token, loadRenders]);

  // 素顔：選んだ記録の写真をブラウザで測り直す
  useEffect(() => {
    const rec = befores.find(b => b.id === srcId);
    if (!rec?.imagePath) return;
    let alive = true;
    setSource(null); setSrcUrl(null);
    (async () => {
      const u = (await staffMediaUrls([rec.imagePath!]))[rec.imagePath!];
      if (!alive || !u) return;
      setSrcUrl(u);
      const s = await measureSource(u, rec.id, rec.imagePath!, rec.metrics);
      if (alive) setSource(s);
    })().catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [srcId, befores]);

  const yose = saved?.find(s => s.id === yoseId) ?? null;
  const surveyOpts = useMemo(() => promptOptionsFromSurvey(answers), [answers]);
  const basePrompt = useMemo(() => yose ? buildPrompt(yose.result, 'gemini', purpose, surveyOpts) : '', [yose, purpose, surveyOpts]);
  const prompt = override ?? basePrompt;
  // 寄せ先・用途を変えたら編集した指示文は捨てる
  useEffect(() => { setOverride(null); }, [yoseId, purpose]);

  const ready = !!(source && yose && prompt);
  const enabled = (e: RenderEngine) => ready && !!status?.[e] && !running[e];

  // 強くして：エンジンごとに、この用途の直前の生成画像を入力にして「今より一段強く」だけを送る（ChatGPT で手でやっていた流れ）
  const run = async (strengthen: boolean) => {
    if (!source || !yose) return;
    const targets = ENGINES.filter(e => status?.[e] && (!strengthen || latest[e]));
    setErrors({});
    setRunning(Object.fromEntries(targets.map(e => [e, true])));
    await Promise.all(targets.map(async engine => {
      try {
        await generateRender({
          token, subjectCode: code, source, engine, purpose,
          prompt: strengthen ? buildStrengthenPrompt(purpose) : prompt,
          inputPath: strengthen ? latest[engine]!.image_path : undefined,
          targetName: yose.target_kind === 'ideal' ? '黄金比' : yose.target_name,
        });
      } catch (e) {
        setErrors(x => ({ ...x, [engine]: e instanceof Error ? e.message : String(e) }));
      } finally {
        setRunning(x => ({ ...x, [engine]: false }));
        await loadRenders().catch(() => {});
      }
    }));
  };

  const decide = async (r: RenderRow, d: RenderDecision, note: string) => {
    try { await setRenderDecision(r, d, note); await loadRenders(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const mine = renders.filter(r => r.purpose === purpose);
  const latest = Object.fromEntries(ENGINES.map(e => [e, mine.find(r => r.engine === e) ?? null])) as Record<RenderEngine, RenderRow | null>;
  const older = mine.filter(r => r !== latest.gemini && r !== latest.openai);
  const adopted = renders.filter(r => r.decision === 'adopted');

  const firstTime = mine.length === 0;
  const anyRunning = ENGINES.some(e => running[e]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><ImagePlus className="w-4 h-4" /> 完成イメージ</p>
        <span className="text-[10px] text-stone-400">運営だけ。参加者のページには出ません</span>
        {adopted.length > 0 && <span className="text-[11px] text-emerald-700">採用済み：{adopted.map(r => RENDER_PURPOSE_LABEL[r.purpose as RenderPurpose] ?? r.purpose).join('・')}</span>}
        <div className="ml-auto flex rounded-lg border border-stone-300 overflow-hidden divide-x divide-stone-300 text-xs">
          {PURPOSES.map(v => (
            <button key={v} type="button" onClick={() => setPurpose(v)} className={`px-3 py-1.5 ${purpose === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>{RENDER_PURPOSE_LABEL[v]}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}

      {befores.length === 0 ? (
        <p className="text-xs text-amber-700">写り○・傾き 8〜20°・近すぎないメイク前の写真がないので、完成イメージは作れません。</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <label className="flex flex-col gap-1 text-stone-600">素顔
            <select value={srcId} onChange={e => setSrcId(e.target.value)} className={sel}>
              {befores.map((b, i) => <option key={b.id} value={b.id}>{fmtDate(b.takenAt)}{i === 0 ? '（最新）' : ''}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-stone-600">寄せ先（保存済みの寄せ方。名前は記録用で、指示文には入りません）
            <select value={yoseId} onChange={e => setYoseId(e.target.value)} className={sel} disabled={!saved?.length}>
              {!saved?.length && <option value="">保存済みの寄せ方がありません（上の「寄せ方」で保存）</option>}
              {saved?.map(s => (
                <option key={s.id} value={s.id}>
                  {s.target_kind === 'ideal' ? '黄金比' : s.target_name}
                  {s.result.config.purpose ? `・${PURPOSE_JA[s.result.config.purpose] ?? s.result.config.purpose}` : ''}
                  {`・${fmtDate(s.created_at)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {(surveyOpts.skinFix || surveyOpts.impression || surveyOpts.noTouch) && (
        <p className="text-[11px] text-stone-500">
          アンケートから：{[
            surveyOpts.skinFix && `肌の整え＝${surveyOpts.skinFix.join('・')}`,
            surveyOpts.impression && `印象＝${surveyOpts.impression.join('・')}`,
            surveyOpts.noTouch && `触らない＝${surveyOpts.noTouch}`,
          ].filter(Boolean).join('／')}
        </p>
      )}

      {yose && (
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => setShowPrompt(v => !v)} className="text-[11px] text-stone-500 underline">{showPrompt ? '指示文を閉じる' : '指示文を見る'}</button>
            {override !== null && <><span className="text-[11px] text-amber-700">編集した指示文で作ります</span><button type="button" onClick={() => setOverride(null)} className="text-[11px] text-stone-500 underline">元に戻す</button></>}
          </div>
          {showPrompt && <textarea value={prompt} onChange={e => setOverride(e.target.value)} rows={16} className="w-full rounded-lg border border-stone-200 p-3 text-[11px] leading-relaxed text-stone-700 font-sans" />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {firstTime
          ? <button type="button" onClick={() => run(false)} disabled={!ready || anyRunning || !ENGINES.some(enabled)} className={primary}><Sparkles className="w-3.5 h-3.5" /> 作る（各1枚）</button>
          : <>
            <button type="button" onClick={() => run(false)} disabled={!ready || anyRunning || !ENGINES.some(enabled)} className={primary}><RefreshCw className="w-3.5 h-3.5" /> もう一枚ずつ</button>
            <button type="button" onClick={() => run(true)} disabled={!ready || anyRunning || !ENGINES.some(enabled)} className={ghost}><Zap className="w-3.5 h-3.5" /> 強くしてもう一枚ずつ</button>
          </>}
        {!source && befores.length > 0 && <span className="text-[11px] text-stone-400">素顔を測っています…</span>}
        {statusErr && <span className="text-[11px] text-rose-700">生成の準備を確認できませんでした（{statusErr}）</span>}
        {status && ENGINES.filter(e => !status[e]).map(e => (
          <span key={e} className="text-[11px] text-amber-700">{RENDER_ENGINE_LABEL[e]} は使えません：API キーが未設定（Supabase の Edge Functions → Secrets）</span>
        ))}
      </div>

      {/* 左 Gemini ／ 中央 素顔 ／ 右 ChatGPT */}
      <div className="grid grid-cols-3 gap-3 items-start">
        <Slot engine="gemini" row={latest.gemini} url={latest.gemini ? urls[latest.gemini.image_path] : undefined} running={!!running.gemini} error={errors.gemini} onDecide={decide} />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-stone-600 text-center">素顔</p>
          {srcUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={srcUrl} alt="素顔" className="w-full h-72 object-contain bg-stone-50 rounded-lg" />
            : <div className="w-full h-72 bg-stone-50 rounded-lg" />}
          {source && <p className="text-[10px] text-stone-400 text-center">{source.width}×{source.height}</p>}
        </div>
        <Slot engine="openai" row={latest.openai} url={latest.openai ? urls[latest.openai.image_path] : undefined} running={!!running.openai} error={errors.openai} onDecide={decide} />
      </div>

      {older.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-600">これまでの候補（{RENDER_PURPOSE_LABEL[purpose]}・{older.length}枚）</p>
          <div className="grid grid-cols-3 gap-3 items-start">
            {older.map(r => <Slot key={r.id} engine={r.engine as RenderEngine} row={r} url={urls[r.image_path]} running={false} onDecide={decide} small />)}
          </div>
        </div>
      )}

      <details className="text-[11px] text-stone-500">
        <summary className="cursor-pointer">エンジンの癖{status?.models && `（Gemini＝${status.models.gemini}、ChatGPT＝${status.models.openai}）`}</summary>
        <div className="grid sm:grid-cols-2 gap-2 pt-1">
          {ENGINES.map(e => <ul key={e} className="list-disc pl-4"><li className="list-none font-semibold -ml-4">{RENDER_ENGINE_LABEL[e]}</li>{ENGINE_NOTES[e].map(n => <li key={n}>{n}</li>)}</ul>)}
        </div>
      </details>
    </div>
  );
}

function Slot({ engine, row, url, running, error, onDecide, small }: {
  engine: RenderEngine; row: RenderRow | null; url?: string; running: boolean; error?: string;
  onDecide: (r: RenderRow, d: RenderDecision, note: string) => Promise<void>; small?: boolean;
}) {
  const [note, setNote] = useState(row?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(row?.note ?? ''); }, [row?.id, row?.note]);
  const h = small ? 'h-48' : 'h-72';
  const act = async (d: RenderDecision) => { if (!row) return; setBusy(true); await onDecide(row, d, note); setBusy(false); };
  const badge = row?.decision === 'adopted' ? 'border-emerald-500 ring-2 ring-emerald-200' : row?.decision === 'rejected' ? 'border-stone-200 opacity-60' : 'border-stone-200';
  return (
    <div className={`space-y-1 rounded-lg border p-1.5 ${row ? badge : 'border-transparent'}`}>
      <p className="text-xs font-semibold text-stone-600 text-center">
        {RENDER_ENGINE_LABEL[engine]}
        {row && <span className="font-normal text-[10px] text-stone-400 ml-1">{fmtDate(row.created_at)}{row.input_path && '・強く'}{row.prompt_version?.endsWith('+soften') && '・言い換え'}</span>}
        {row?.decision === 'adopted' && <span className="ml-1 text-[10px] text-emerald-700 font-semibold">採用</span>}
        {row?.decision === 'rejected' && <span className="ml-1 text-[10px] text-stone-500">不採用</span>}
      </p>
      {running ? <div className={`w-full ${h} bg-stone-50 rounded-lg flex items-center justify-center text-[11px] text-stone-400`}><RefreshCw className="w-4 h-4 animate-spin mr-1" /> 作っています…</div>
        : row && url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt={`${RENDER_ENGINE_LABEL[engine]} の完成イメージ`} className={`w-full ${h} object-contain bg-stone-50 rounded-lg`} />
          : <div className={`w-full ${h} bg-stone-50 rounded-lg`} />}
      {error && <p className="text-[11px] text-rose-700 break-words">{error}</p>}
      {row && !running && (
        <>
          <Judge row={row} />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="症例一行" className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]" />
          <div className="flex gap-1.5">
            <button type="button" disabled={busy} onClick={() => act('adopted')} className={`${mini} ${row.decision === 'adopted' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-emerald-700 border-emerald-300'}`}><Check className="w-3 h-3" /> 採用</button>
            <button type="button" disabled={busy} onClick={() => act('rejected')} className={`${mini} ${row.decision === 'rejected' ? 'bg-stone-600 text-white border-stone-600' : 'text-stone-600 border-stone-300'}`}><X className="w-3 h-3" /> 不採用</button>
          </div>
        </>
      )}
    </div>
  );
}

/** 7項目の差（許容幅の倍率）、最大倍率、縦横比 */
function Judge({ row }: { row: RenderRow }) {
  if (!row.diffs) return <p className="text-[11px] text-amber-700">顔を測れませんでした（骨格の判定なし）</p>;
  const tone = (r: number) => r <= 1 ? 'text-emerald-700' : 'text-rose-700 font-semibold';
  return (
    <div className="space-y-0.5">
      <table className="w-full text-[10px]">
        <tbody>{YOSE_METRICS.map(m => {
          const d = row.diffs![m.id];
          if (!d) return null;
          return (
            <tr key={m.id}>
              <td className="text-stone-500 pr-1 truncate max-w-0 w-2/3">{m.label}</td>
              <td className="text-right tabular-nums text-stone-400">{m.unit === '°' ? d.diff.toFixed(1) : d.diff.toFixed(3)}</td>
              <td className={`text-right tabular-nums ${tone(d.ratio)}`}>{d.ratio.toFixed(2)}倍</td>
            </tr>
          );
        })}</tbody>
      </table>
      <p className={`text-[11px] ${tone(row.max_ratio ?? 0)}`}>最大 {(row.max_ratio ?? 0).toFixed(2)}倍{row.skeleton_ok ? '（骨格は許容内）' : '（許容超え）'}</p>
      {row.aspect_ok === false && <p className="text-[11px] text-rose-700 font-semibold">画面比が変わっています{row.image_width && row.image_height ? `（${row.image_width}×${row.image_height}）` : ''}</p>}
    </div>
  );
}

const sel = 'rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-800 bg-white';
const primary = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-800 text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-40';
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5 disabled:opacity-40';
const mini = 'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40';
