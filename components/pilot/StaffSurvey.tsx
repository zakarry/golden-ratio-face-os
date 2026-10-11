'use client';

// 運営ページの参加者詳細：「アンケート」欄
// 回答（質問→答え）と、挙がった「似ている人」を種類ごとに表示。参照写真を測って本人と並べ、保存できる。

import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Ruler, Save, ImageOff } from 'lucide-react';
import { flattenAnswers, fetchSurveyForStaff, REFERENCE_KIND_LABEL, type ReferenceKind, type StaffReferenceRow, type StaffSurveyRow } from '@/lib/pilot/survey';
import { compareMetrics, measureReferenceImage, saveReferenceMetrics, signedUrl, type ReferenceMeasurement } from '@/lib/pilot/referenceMeasure';
import { formatMetric, type PilotMetrics } from '@/lib/pilot/targetCard';

const KINDS: ReferenceKind[] = ['self_happy', 'others_say', 'dislike'];
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '';

/** subjectMetrics：本人のいちばん新しい「メイク前」の測定値（比較に使う） */
export default function StaffSurvey({ token, subjectMetrics }: { token: string; subjectMetrics: PilotMetrics | null }) {
  const [survey, setSurvey] = useState<StaffSurveyRow | null>(null);
  const [refs, setRefs] = useState<StaffReferenceRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { const d = await fetchSurveyForStaff(token); setSurvey(d.survey); setRefs(d.refs); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
      <p className="text-sm font-semibold text-stone-800 flex items-center gap-2">
        <ClipboardList className="w-4 h-4" /> アンケート
        <span className="text-xs font-normal text-stone-500">{survey ? `回答 ${fmt(survey.updated_at)}` : '未回答'}</span>
      </p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      {!refs && !error && <p className="text-xs text-stone-400">読み込んでいます…</p>}

      {survey && (
        <table className="w-full text-xs">
          <tbody>{flattenAnswers(survey.answers).map((r, i) => (
            <tr key={i} className="border-t border-stone-100 align-top">
              <td className="py-1.5 pr-2 text-stone-400 w-6">{r.no}</td>
              <td className="py-1.5 pr-3 text-stone-500 w-[40%]">{r.title}</td>
              <td className="py-1.5 text-stone-800 whitespace-pre-wrap">{r.answer || <span className="text-stone-300">—</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {refs && KINDS.map(kind => {
        const list = refs.filter(r => r.kind === kind);
        return (
          <div key={kind} className="space-y-2">
            <p className="text-xs font-semibold text-stone-600">{REFERENCE_KIND_LABEL[kind]}（{list.length}人）</p>
            {list.length === 0 && <p className="text-xs text-stone-300">なし</p>}
            {list.map(r => <ReferenceRow key={r.id} r={r} subjectMetrics={subjectMetrics} onSaved={load} />)}
          </div>
        );
      })}
    </div>
  );
}

function ReferenceRow({ r, subjectMetrics, onSaved }: { r: StaffReferenceRow; subjectMetrics: PilotMetrics | null; onSaved: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<ReferenceMeasurement | null>(null);
  const [note, setNote] = useState(r.source_note ?? '');
  const [clearImage, setClearImage] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    if (r.image_path) signedUrl(r.image_path).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [r.image_path]);

  const measure = async () => {
    if (!url) return;
    setBusy(true); setMsg(''); setResult(null);
    const m = await measureReferenceImage(url);
    setBusy(false);
    if (!m) { setMsg('顔を検出できませんでした（正面の写真か確認してください）'); return; }
    setResult(m);
  };
  const save = async () => {
    if (!result) return;
    setBusy(true);
    const res = await saveReferenceMetrics(r.id, result, note, clearImage);
    setBusy(false);
    if (!res.ok) { setMsg(`保存できませんでした（${res.error}）`); return; }
    setMsg(res.error ?? '保存しました'); setResult(null); onSaved();
  };

  const stored = r.metrics as PilotMetrics | null;
  const status = r.measured_at ? `測定済み（${fmt(r.measured_at)}${r.measured_by ? `・${r.measured_by}` : ''}）` : r.image_path ? '未測定' : '写真なし';

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3 text-xs space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-20 shrink-0">
          {url
            // eslint-disable-next-line @next/next/no-img-element
            ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={r.person_name} className="w-20 max-w-none rounded-lg border border-stone-200" /></a>
            : <div className="w-20 h-24 rounded-lg border border-dashed border-stone-200 flex items-center justify-center text-stone-300"><ImageOff className="w-4 h-4" /></div>}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-stone-800">{r.person_name}</p>
          {r.source_note && <p className="text-stone-500">メモ：{r.source_note}</p>}
          <p className={r.measured_at ? 'text-emerald-700' : 'text-stone-500'}>{status}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {url && <button type="button" onClick={measure} disabled={busy} className={btn}><Ruler className="w-3.5 h-3.5" /> {busy && !result ? '測定中…' : '測定'}</button>}
            {stored && <button type="button" onClick={() => setShowSaved(v => !v)} className={btn}>{showSaved ? '比較を閉じる' : '保存済みの値で比較'}</button>}
          </div>
          {msg && <p className="text-stone-600">{msg}</p>}
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          {Math.abs(result.framing.yaw) > 0.06 && <p className="font-semibold text-rose-700">正面でないので参考値（向き {(result.framing.yaw * 100).toFixed(1)}%）</p>}
          <CompareTable subject={subjectMetrics} ref_={result.metrics} />
          <div className="flex flex-wrap items-center gap-2">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="写真の出典・年（例：2024年 雑誌）" className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs w-64" />
            <label className="flex items-center gap-1 text-stone-600"><input type="checkbox" checked={clearImage} onChange={e => setClearImage(e.target.checked)} /> 保存したら写真を消す</label>
            <button type="button" onClick={save} disabled={busy} className={saveBtn}><Save className="w-3.5 h-3.5" /> {busy ? '保存中…' : '保存'}</button>
          </div>
        </div>
      )}
      {!result && showSaved && stored && <CompareTable subject={subjectMetrics} ref_={stored} />}
    </div>
  );
}

/** 本人と参照を並べた表（差＝本人−参照） */
function CompareTable({ subject, ref_ }: { subject: PilotMetrics | null; ref_: PilotMetrics }) {
  if (!subject) {
    return <p className="text-stone-500">本人の「メイク前」の撮影がまだないので、比較できません（参照の値だけ保存できます）。</p>;
  }
  const rows = compareMetrics(subject, ref_);
  return (
    <table className="w-full text-xs bg-white rounded-lg">
      <thead><tr className="text-stone-400 text-[10px]"><th className="text-left py-1 px-2">指標</th><th className="text-right px-2">本人</th><th className="text-right px-2">この人</th><th className="text-right px-2">差</th><th className="text-right px-2">黄金比</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id} className={`border-t border-stone-100 ${r.close ? 'text-emerald-700' : 'text-stone-700'}`}>
          <td className="py-1 px-2">{r.label}{r.forehead && <span className="text-[9px] text-stone-400 ml-1">額推定</span>}</td>
          <td className="text-right px-2 tabular-nums">{formatMetric(r.subject, r.unit)}</td>
          <td className="text-right px-2 tabular-nums">{formatMetric(r.ref, r.unit)}</td>
          <td className="text-right px-2 tabular-nums">{(r.diff >= 0 ? '+' : '') + formatMetric(r.diff, r.unit)}</td>
          <td className="text-right px-2 tabular-nums text-stone-400">{formatMetric(r.ideal, r.unit)}</td>
        </tr>
      ))}</tbody>
      <tfoot><tr><td colSpan={5} className="px-2 py-1 text-[10px] text-stone-400">緑＝本人とこの人がほぼ同じ（差が 0.02 以内、角度は 2° 以内）</td></tr></tfoot>
    </table>
  );
}

const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5 disabled:opacity-40';
// 白地のボタンの色を上書きすると文字が消えるので、保存ボタンは別に定義する
const saveBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-800 text-white text-xs font-semibold px-4 py-1.5 disabled:opacity-40';
