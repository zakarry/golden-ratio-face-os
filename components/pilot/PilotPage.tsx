'use client';

// ミス・ワールドJAPAN パイロット
// 撮影（スマホ）→ 顔の設計図 → 目標カード（4）→ 処方（5）→ 本人コードで保存
// 「前」と「後」を同じコードで保存し、後日の照合（8. 検証）に使う。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle, RefreshCw, Copy, Share2, Save, ClipboardList, Database } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';
import { detectFaceLandmarks, type DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics, buildTargetCard, formatMetric, type TargetCard, type PilotMetrics } from '@/lib/pilot/targetCard';
import { buildPrescription, prescriptionToText, STRENGTH_LABEL, type Prescription, type Strength } from '@/lib/pilot/prescription';
import {
  checkFraming, findLocalBefore, fetchBeforeFromSupabase, getPilotRecords, newPilotId, resyncPending,
  syncPilotRecord, upsertLocal, PILOT_APP_VERSION, type FramingCheck, type PilotPhase, type PilotRecord,
} from '@/lib/pilot/pilotStorage';

type Step = 'setup' | 'capture' | 'result';
type DetectState = 'idle' | 'detecting' | 'done' | 'error';

const SETTINGS_KEY = 'face_os_pilot_settings_v1';
const DEFAULT_EVENT = 'MWJ2026-pilot';

async function toDataUrl(src: string, maxSide = 1600): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = src; });
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
}

export default function PilotPage() {
  // ── 設定（端末に記憶）
  const [event, setEvent]       = useState(DEFAULT_EVENT);
  const [operator, setOperator] = useState('');
  const [subject, setSubject]   = useState('');
  const [phase, setPhase]       = useState<PilotPhase>('before');
  const [consent, setConsent]   = useState(false);
  const [strength, setStrength] = useState<Strength>('standard');

  useEffect(() => {
    try { const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (o) { if (o.event) setEvent(o.event); if (o.operator) setOperator(o.operator); if (o.phase) setPhase(o.phase); } } catch { /* noop */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ event, operator, phase })); } catch { /* noop */ } }, [event, operator, phase]);

  // ── 撮影・解析
  const [step, setStep]               = useState<Step>('setup');
  const [imageSrc, setImageSrc]       = useState<string | null>(null);
  const [detect, setDetect]           = useState<DetectState>('idle');
  const [guide, setGuide]             = useState<DetectedGuide | null>(null);
  const [imgSize, setImgSize]         = useState<{ w: number; h: number } | null>(null);
  const [dataUrl, setDataUrl]         = useState<string | null>(null);
  const [framing, setFraming]         = useState<FramingCheck | null>(null);
  const [before, setBefore]           = useState<PilotRecord | null>(null);

  const metrics: PilotMetrics | null = useMemo(() => (guide && imgSize) ? computePilotMetrics(guide, imgSize.w, imgSize.h) : null, [guide, imgSize]);
  const card: TargetCard | null = useMemo(() => (metrics && guide && imgSize) ? buildTargetCard(metrics, guide, imgSize.w, imgSize.h, { irisDiameterPx: guide.irisDiameterPx ?? null }) : null, [metrics, guide, imgSize]);
  const rx: Prescription | null = useMemo(() => card ? buildPrescription(card, strength) : null, [card, strength]);

  const handleImage = useCallback(async (url: string) => {
    setImageSrc(url); setGuide(null); setFraming(null); setDetect('detecting');
    try {
      const { dataUrl: du, w, h } = await toDataUrl(url);
      setDataUrl(du); setImgSize({ w, h });
      const g = await detectFaceLandmarks(du);
      if (!g) { setDetect('error'); return; }
      setGuide(g); setFraming(checkFraming(g, w, h)); setDetect('done'); setStep('result');
    } catch (e) { console.error(e); setDetect('error'); }
  }, []);

  // 「後」のときは同じコードの「前」を探す
  useEffect(() => {
    if (phase !== 'after' || !subject) { setBefore(null); return; }
    const local = findLocalBefore(subject);
    if (local) { setBefore(local); return; }
    let alive = true;
    fetchBeforeFromSupabase(subject, event).then(r => { if (alive) setBefore(r); });
    return () => { alive = false; };
  }, [phase, subject, event]);

  // ── 保存
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg]     = useState('');
  const [records, setRecords]     = useState<PilotRecord[]>([]);
  useEffect(() => {
    const load = () => setRecords(getPilotRecords());
    load(); window.addEventListener('face-os-pilot-updated', load);
    return () => window.removeEventListener('face-os-pilot-updated', load);
  }, []);

  const handleSave = useCallback(async () => {
    if (!guide || !metrics || !card || !rx || !imgSize || !dataUrl || !framing) return;
    if (!subject.trim()) { setSaveMsg('本人コードを入れてください'); return; }
    if (!consent) { setSaveMsg('本人の同意にチェックしてください'); return; }
    setSaveState('saving'); setSaveMsg('');
    const rec: PilotRecord = {
      id: newPilotId(subject.trim(), phase), subjectCode: subject.trim(), phase, takenAt: new Date().toISOString(), event, operator, consent,
      imageDataUrl: dataUrl, imageWidth: imgSize.w, imageHeight: imgSize.h, guide, metrics, targetCard: card, prescription: rx, framing,
      appVersion: PILOT_APP_VERSION, syncState: 'local',
    };
    upsertLocal(rec);
    const synced = await syncPilotRecord(rec);
    upsertLocal(synced);
    if (synced.syncState === 'synced') { setSaveState('saved'); setSaveMsg('端末とサーバーに保存しました'); }
    else { setSaveState('error'); setSaveMsg(`端末には保存。サーバー保存は失敗（${synced.syncError}）。後で「再送」できます`); }
  }, [guide, metrics, card, rx, imgSize, dataUrl, framing, subject, consent, phase, event, operator]);

  const reset = useCallback(() => {
    setImageSrc(null); setGuide(null); setDataUrl(null); setImgSize(null); setFraming(null); setDetect('idle'); setSaveState('idle'); setSaveMsg(''); setStep('capture');
  }, []);

  const nextSubject = useCallback(() => { setSubject(''); setConsent(false); reset(); setStep('setup'); }, [reset]);

  const rxText = useMemo(() => (card && rx) ? prescriptionToText(subject || '—', card, rx) : '', [card, rx, subject]);
  const copyRx = useCallback(async () => { try { await navigator.clipboard.writeText(rxText); setSaveMsg('処方をコピーしました'); } catch { setSaveMsg('コピーできませんでした'); } }, [rxText]);
  const shareRx = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
      if (nav.share) await nav.share({ title: `今日の処方（${subject}）`, text: rxText }); else await copyRx();
    } catch { /* cancelled */ }
  }, [rxText, subject, copyRx]);

  const [resyncMsg, setResyncMsg] = useState('');
  const handleResync = useCallback(async () => { setResyncMsg('再送中…'); const r = await resyncPending(); setResyncMsg(`再送 成功${r.ok}／失敗${r.ng}`); }, []);

  const pendingCount = records.filter(r => r.syncState !== 'synced').length;

  return (
    <div className="space-y-5">
      <Header />

      {/* ── 設定 */}
      <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="本人コード（例: F01）"><input value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} placeholder="F01" className={inputCls} /></Field>
          <Field label="段階">
            <div className="flex rounded-lg border border-stone-200 overflow-hidden">
              {(['before', 'after'] as PilotPhase[]).map(p => (
                <button key={p} type="button" onClick={() => setPhase(p)} className={`flex-1 py-2 text-sm ${phase === p ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>{p === 'before' ? 'メイク前' : 'メイク後'}</button>
              ))}
            </div>
          </Field>
          <Field label="イベント"><input value={event} onChange={e => setEvent(e.target.value)} className={inputCls} /></Field>
          <Field label="担当者"><input value={operator} onChange={e => setOperator(e.target.value)} placeholder="大橋" className={inputCls} /></Field>
        </div>
        <label className="flex items-start gap-3 text-xs text-stone-600 leading-relaxed">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
          <span>本人に説明し、写真と測定値を「黄金比 Face OS」の研究開発（後日のメイク後撮影との照合を含む）に使うことへの同意を得ました。写真は本人と運営のみが扱い、公開しません。</span>
        </label>
        {phase === 'after' && subject && (
          <p className="text-xs rounded-lg px-3 py-2 bg-stone-50 border border-stone-200 text-stone-600">
            {before ? `「前」の記録が見つかりました（${new Date(before.takenAt).toLocaleString('ja-JP')}）。保存すると照合できます。` : `「前」の記録が見つかりません（コード ${subject}）。コードを確認してください。前が無くても保存はできます。`}
          </p>
        )}
        {step === 'setup' && (
          <button type="button" disabled={!subject.trim()} onClick={() => setStep('capture')} className={primaryBtn}>
            <Camera className="w-4 h-4" /> 撮影へ
          </button>
        )}
      </section>

      {/* ── 撮影 */}
      {step !== 'setup' && !guide && (
        <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
          <p className="text-sm font-semibold text-stone-800">撮影　<span className="text-xs font-normal text-stone-500">{subject}・{phase === 'before' ? 'メイク前' : 'メイク後'}</span></p>
          <ul className="text-xs text-stone-600 space-y-1 list-disc pl-5">
            <li>正面。カメラは目の高さ。顔が画面幅の1/3〜1/2になる距離</li>
            <li>前髪は上げるかピンで留めて額を出す。眼鏡は外す</li>
            <li>無表情、口を閉じる。同じ場所・同じ明かりで「後」も撮る</li>
          </ul>
          <ImageUploader onImageSelected={handleImage} />
          {detect === 'detecting' && <p className="text-xs text-amber-700 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 顔を検出しています…</p>}
          {detect === 'error' && <p className="text-xs text-rose-700">顔を検出できませんでした。正面・明るい場所でもう一度</p>}
        </section>
      )}

      {/* ── 結果 */}
      {guide && metrics && card && rx && framing && (
        <>
          <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-800">撮影チェック</p>
                <p className="text-xs text-stone-500">向き {framing.yaw >= 0 ? '+' : ''}{(framing.yaw * 100).toFixed(1)}%・傾き {framing.roll.toFixed(1)}°・顔幅 {(framing.faceWidthFrac * 100).toFixed(0)}%{card.faceWidthMm ? `・顔幅 約${card.faceWidthMm.toFixed(0)}mm` : ''}</p>
              </div>
              <button type="button" onClick={reset} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 撮り直す</button>
            </div>
            {framing.ok ? (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> 条件OK。後日も同じ条件で撮ってください</p>
            ) : (
              <ul className="text-xs text-amber-800 space-y-1">{framing.warnings.map(w => <li key={w} className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{w}</li>)}</ul>
            )}
            {imageSrc && <img src={imageSrc} alt="" className="w-40 rounded-lg border border-stone-200" />}
          </section>

          {/* 目標カード */}
          <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-800">目標カード　<span className="text-xs font-normal text-stone-500">修正対象 {card.actionableCount} ／ {card.items.length}</span></p>
              <span className="text-[10px] text-stone-400">許容幅：初期値（校正で更新）／額推定の指標は参考</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-stone-400 text-[10px] tracking-wide"><th className="text-left py-1">指標</th><th className="text-right">現在</th><th className="text-right">目標</th><th className="text-right">差</th><th className="text-right">方向</th></tr></thead>
                <tbody>
                  {card.items.map(t => (
                    <tr key={t.id} className={`border-t border-stone-100 ${t.actionable ? 'text-stone-800' : 'text-stone-400'}`}>
                      <td className="py-1.5">{t.label}{t.dependsOnForehead && <span className="text-[9px] text-stone-400 ml-1">額推定</span>}</td>
                      <td className="text-right tabular-nums">{formatMetric(t.current, t.unit)}</td>
                      <td className="text-right tabular-nums">{formatMetric(t.ideal, t.unit)}</td>
                      <td className="text-right tabular-nums">{(t.gap >= 0 ? '+' : '') + formatMetric(t.gap, t.unit)}{t.gapMm != null && t.actionable ? <span className="text-stone-400"> ({Math.abs(t.gapMm).toFixed(1)}mm)</span> : ''}</td>
                      <td className={`text-right font-medium ${t.actionable ? 'text-amber-700' : ''}`}>{t.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {before && phase === 'after' && <BeforeAfterTable before={before.metrics} after={metrics} />}
          </section>

          {/* 処方 */}
          <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-semibold text-stone-800">今日の処方</p>
              <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs">
                {(['weak', 'standard', 'strong'] as Strength[]).map(s => (
                  <button key={s} type="button" onClick={() => setStrength(s)} className={`px-3 py-1.5 ${strength === s ? 'bg-amber-500 text-white' : 'bg-white text-stone-600'}`}>{STRENGTH_LABEL[s]}</button>
                ))}
              </div>
            </div>
            <p className="text-sm text-stone-700 leading-relaxed">{rx.headline}</p>
            {rx.items.length === 0 && <p className="text-xs text-stone-500">修正対象がありません。</p>}
            <ol className="space-y-2">
              {rx.items.map((i, idx) => (
                <li key={i.techniqueId} className="rounded-xl border border-stone-200 p-3 text-xs space-y-1">
                  <div className="flex items-center gap-2"><span className="inline-flex w-5 h-5 rounded-full bg-stone-800 text-white items-center justify-center text-[10px]">{idx + 1}</span><span className="text-[10px] text-stone-400">{i.step} {i.stepLabel}</span><span className="text-[10px] text-amber-700">{i.metricLabel.replace(/（.*?）/g, '')}→{i.direction}</span></div>
                  <p className="text-sm font-semibold text-stone-800">{i.name}</p>
                  <p><span className="text-stone-400">量：</span><span className="font-medium">{i.amount}</span></p>
                  <p><span className="text-stone-400">場所：</span>{i.where}</p>
                  <p><span className="text-stone-400">色：</span>{i.color}</p>
                  {i.caution && <p className="text-rose-700"><span className="text-stone-400">注意：</span>{i.caution}</p>}
                </li>
              ))}
            </ol>
            {rx.uncovered.length > 0 && <p className="text-[11px] text-stone-500">技法未定義：{rx.uncovered.map(u => `${u.label}（${u.direction}）`).join('、')}</p>}
            <p className="text-[11px] text-stone-500">「黄金比になる」のではなく「黄金比に近づいて見える」ことを目指す処方です。顔そのものは変わりません。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyRx} className={ghostBtn}><Copy className="w-3.5 h-3.5" /> 文面をコピー</button>
              <button type="button" onClick={shareRx} className={ghostBtn}><Share2 className="w-3.5 h-3.5" /> 本人に送る</button>
            </div>
          </section>

          {/* 保存 */}
          <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saveState === 'saving' || saveState === 'saved'} className={primaryBtn}>
                <Save className="w-4 h-4" /> {saveState === 'saved' ? '保存済み' : `${phase === 'before' ? 'メイク前' : 'メイク後'}として保存`}
              </button>
              {saveState === 'saved' && <button type="button" onClick={nextSubject} className={ghostBtn}>次の人へ</button>}
              {saveMsg && <span className={`text-xs ${saveState === 'error' ? 'text-rose-700' : 'text-stone-600'}`}>{saveMsg}</span>}
            </div>
          </section>
        </>
      )}

      {/* ── 記録 */}
      <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> この端末の記録　<span className="text-xs font-normal text-stone-500">{records.length}件・未同期 {pendingCount}</span></p>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <button type="button" onClick={handleResync} className={ghostBtn}><Database className="w-3.5 h-3.5" /> 再送</button>}
            <button type="button" onClick={() => downloadCsv(records)} className={ghostBtn}>CSV</button>
            {resyncMsg && <span className="text-xs text-stone-500">{resyncMsg}</span>}
          </div>
        </div>
        {records.length === 0 ? <p className="text-xs text-stone-400">まだ記録はありません</p> : (
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead><tr className="text-stone-400 text-[10px]"><th className="text-left">日時</th><th className="text-left">コード</th><th>段階</th><th>目間距離</th><th>目幅</th><th>修正対象</th><th>同期</th></tr></thead>
            <tbody>{records.map(r => (
              <tr key={r.id} className="border-t border-stone-100">
                <td className="py-1">{new Date(r.takenAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{r.subjectCode}</td><td className="text-center">{r.phase === 'before' ? '前' : '後'}</td>
                <td className="text-right tabular-nums">{r.metrics.eyeDist.toFixed(3)}</td><td className="text-right tabular-nums">{r.metrics.eyeWidth.toFixed(3)}</td>
                <td className="text-center">{r.targetCard.actionableCount}</td>
                <td className={`text-center ${r.syncState === 'synced' ? 'text-emerald-700' : 'text-rose-700'}`}>{r.syncState === 'synced' ? '済' : r.syncState === 'error' ? '失敗' : '未'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

function BeforeAfterTable({ before, after }: { before: PilotMetrics; after: PilotMetrics }) {
  const keys: Array<keyof PilotMetrics> = ['eyeDist', 'eyeWidth', 'eyeAngle', 'faceRatio', 'zone2', 'zone3', 'philtrum'];
  return (
    <div className="rounded-xl bg-stone-50 border border-stone-200 p-3">
      <p className="text-xs font-semibold text-stone-700 mb-1">前後の物理測定（機械はメイクに騙されないので、差は撮影条件の違い）</p>
      <table className="w-full text-xs"><thead><tr className="text-stone-400 text-[10px]"><th className="text-left">指標</th><th className="text-right">前</th><th className="text-right">後</th><th className="text-right">差</th></tr></thead>
        <tbody>{keys.map(k => (
          <tr key={k} className="border-t border-stone-100"><td className="py-0.5">{k}</td><td className="text-right tabular-nums">{before[k].toFixed(3)}</td><td className="text-right tabular-nums">{after[k].toFixed(3)}</td><td className="text-right tabular-nums">{(after[k] - before[k] >= 0 ? '+' : '') + (after[k] - before[k]).toFixed(3)}</td></tr>
        ))}</tbody></table>
      <p className="text-[10px] text-stone-500 mt-1">錯覚の判定は「二枚比較（達成度）」で行います。この表は撮影条件が揃っているかの確認用です。</p>
    </div>
  );
}

function downloadCsv(records: PilotRecord[]) {
  const mk = ['eyeDist', 'eyeWidth', 'eyeAngle', 'eyeLevel', 'pupilPos', 'faceRatio', 'zone2', 'zone3', 'eyeY', 'noseY', 'lipY', 'philtrum'] as const;
  const head = ['id', 'subject', 'phase', 'takenAt', 'event', 'operator', 'consent', 'imagePath', 'sync', 'yaw', 'roll', 'faceWidthFrac', 'faceWidthMm', 'actionable', ...mk, 'prescription'];
  const rows = records.map(r => [r.id, r.subjectCode, r.phase, r.takenAt, r.event, r.operator, r.consent, r.imagePath ?? '', r.syncState, r.framing.yaw, r.framing.roll, r.framing.faceWidthFrac, r.targetCard.faceWidthMm ?? '', r.targetCard.actionableCount, ...mk.map(k => r.metrics[k]), r.prescription.items.map(i => `${i.name}:${i.amount}`).join(' / ')]);
  const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `pilot_records_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-base font-semibold text-stone-900">ミス・ワールドJAPAN パイロット</h2>
        <p className="text-xs text-stone-500">撮影 → 顔の設計図 → 目標カード → 処方 → 保存。「前」と「後」を同じコードで残し、後日照合します。</p>
      </div>
      <span className="text-[10px] text-stone-400">{PILOT_APP_VERSION}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-stone-500">{label}{children}</label>;
}

const inputCls = 'rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 bg-white';
const primaryBtn = 'inline-flex items-center gap-2 rounded-lg bg-stone-800 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-40';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
