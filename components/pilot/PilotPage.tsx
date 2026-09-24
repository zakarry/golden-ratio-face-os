'use client';

// ミス・ワールドJAPAN パイロット（本人撮影）
// 運営から届いた専用URL（?p=<token>）で開き、自分のスマホで
// 「メイク前（素顔）」→ 処方 → メイク → 「メイク後」の順に撮って保存する。
// トークンが唯一の鍵。他の人の記録や写真は、読むことも上書きすることもできない。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, AlertTriangle, RefreshCw, Copy, Save, ClipboardList, Database, Lock } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';
import { detectFaceLandmarks, type DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics, buildTargetCard, formatMetric, type TargetCard, type PilotMetrics } from '@/lib/pilot/targetCard';
import { buildPrescription, prescriptionToText, STRENGTH_LABEL, type Prescription, type Strength } from '@/lib/pilot/prescription';
import {
  checkFraming, forgetPilotToken, getPilotRecords, lookupParticipant, newPilotId, readPilotToken, resyncPending,
  savePilotToken, syncPilotRecord, upsertLocal, PILOT_APP_VERSION, type FramingCheck, type ParticipantInfo, type PilotPhase, type PilotRecord,
} from '@/lib/pilot/pilotStorage';

type DetectState = 'idle' | 'detecting' | 'done' | 'error';
type Age = 'adult' | 'minor' | null;
type InfoState = { kind: 'loading' } | { kind: 'none' } | { kind: 'invalid' } | { kind: 'offline' } | { kind: 'ok'; info: ParticipantInfo };

interface ConsentState { age: Age; selfConsent: boolean; guardianName: string; guardianConsent: boolean }
const EMPTY_CONSENT: ConsentState = { age: null, selfConsent: false, guardianName: '', guardianConsent: false };
const consentKey = (token: string) => `face_os_pilot_consent_${token}`;

async function toDataUrl(src: string, maxSide = 1600): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = src; });
  const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
}

/** 入力されたURLまたはコードからトークンを取り出す */
function parseToken(input: string): string {
  const s = input.trim();
  try { const p = new URL(s).searchParams.get('p'); if (p) return p.trim(); } catch { /* not a URL */ }
  return s.replace(/^.*[?&]p=/, '').trim();
}

export default function PilotPage() {
  // ── 本人の特定（専用URLのトークン）
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<InfoState>({ kind: 'loading' });

  // quiet: 保存後の再取得。表示中の画面を消さず、失敗しても今の状態を保つ
  const load = useCallback(async (t: string | null, quiet = false) => {
    if (!t) { setState({ kind: 'none' }); return; }
    if (!quiet) setState({ kind: 'loading' });
    const r = await lookupParticipant(t);
    if (quiet && (r === 'offline' || r === null)) return;
    if (r === 'offline') setState({ kind: 'offline' });
    else if (r === null) setState({ kind: 'invalid' });
    else setState({ kind: 'ok', info: r });
  }, []);

  useEffect(() => { const t = readPilotToken(); setToken(t); load(t); }, [load]);

  const enterCode = useCallback((raw: string) => {
    const t = parseToken(raw); if (!t) return;
    savePilotToken(t); setToken(t); load(t);
  }, [load]);

  const switchPerson = useCallback(() => { forgetPilotToken(); setToken(null); setState({ kind: 'none' }); }, []);

  return (
    <div className="space-y-5 max-w-2xl">
      <Header />
      {state.kind === 'loading' && <Card><p className="text-sm text-stone-500 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> 読み込んでいます…</p></Card>}
      {state.kind === 'none' && <CodeEntry onSubmit={enterCode} />}
      {state.kind === 'invalid' && <CodeEntry onSubmit={enterCode} error="このリンク（コード）は見つかりませんでした。運営から届いたリンクをもう一度開いてください。" />}
      {state.kind === 'offline' && (
        <Card>
          <p className="text-sm text-rose-700">通信できませんでした。電波の良い場所で、もう一度お試しください。</p>
          <button type="button" onClick={() => load(token)} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 再読み込み</button>
        </Card>
      )}
      {state.kind === 'ok' && token && <Session token={token} info={state.info} onReload={() => load(token, true)} onSwitch={switchPerson} />}
    </div>
  );
}

function Session({ token, info, onReload, onSwitch }: { token: string; info: ParticipantInfo; onReload: () => void; onSwitch: () => void }) {
  // ── 同意（端末に記憶して「後」で入れ直さなくてよいようにする）
  const [consent, setConsentState] = useState<ConsentState>(EMPTY_CONSENT);
  useEffect(() => {
    try { const o = JSON.parse(localStorage.getItem(consentKey(token)) || 'null'); if (o) setConsentState({ ...EMPTY_CONSENT, ...o }); } catch { /* noop */ }
  }, [token]);
  const setConsent = useCallback((patch: Partial<ConsentState>) => {
    setConsentState(prev => { const next = { ...prev, ...patch }; try { localStorage.setItem(consentKey(token), JSON.stringify(next)); } catch { /* noop */ } return next; });
  }, [token]);

  const forcedMinor = info.isMinor === true;
  const minor = forcedMinor || consent.age === 'minor';
  const consentOk = (forcedMinor || consent.age !== null) && consent.selfConsent && (!minor || (consent.guardianConsent && consent.guardianName.trim().length > 0));

  // ── 記録（この端末）
  const [records, setRecords] = useState<PilotRecord[]>([]);
  useEffect(() => {
    const loadLocal = () => setRecords(getPilotRecords(token));
    loadLocal(); window.addEventListener('face-os-pilot-updated', loadLocal);
    return () => window.removeEventListener('face-os-pilot-updated', loadLocal);
  }, [token]);
  const localBefore = useMemo(() => records.find(r => r.phase === 'before') ?? null, [records]);
  const hasBefore = !!info.before || !!localBefore;
  const hasAfter = info.hasAfter || records.some(r => r.phase === 'after');

  // 開いたときだけ次に撮る段階を自動で選ぶ（保存直後の結果表示中に切り替わらないように）
  const [phase, setPhase] = useState<PilotPhase>('before');
  const [phaseTouched, setPhaseTouched] = useState(false);
  useEffect(() => { if (!phaseTouched) setPhase(hasBefore && !hasAfter ? 'after' : 'before'); }, [hasBefore, hasAfter, phaseTouched]);
  const choosePhase = useCallback((p: PilotPhase) => { setPhaseTouched(true); setPhase(p); }, []);

  // ── 撮影・解析
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detect, setDetect]     = useState<DetectState>('idle');
  const [guide, setGuide]       = useState<DetectedGuide | null>(null);
  const [imgSize, setImgSize]   = useState<{ w: number; h: number } | null>(null);
  const [dataUrl, setDataUrl]   = useState<string | null>(null);
  const [framing, setFraming]   = useState<FramingCheck | null>(null);
  const [strength, setStrength] = useState<Strength>('standard');

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
      setGuide(g); setFraming(checkFraming(g, w, h)); setDetect('done');
    } catch (e) { console.error(e); setDetect('error'); }
  }, []);

  const reset = useCallback(() => {
    setImageSrc(null); setGuide(null); setDataUrl(null); setImgSize(null); setFraming(null); setDetect('idle'); setSaveState('idle'); setSaveMsg('');
  }, []);

  // ── 保存
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMsg, setSaveMsg]     = useState('');

  const handleSave = useCallback(async () => {
    if (!guide || !metrics || !card || !rx || !imgSize || !dataUrl || !framing) return;
    if (!consentOk) { setSaveMsg('上の「同意」をすべて入力してください'); return; }
    setPhaseTouched(true); setSaveState('saving'); setSaveMsg('');
    const rec: PilotRecord = {
      id: newPilotId(info.subjectCode, phase), token, subjectCode: info.subjectCode, phase, takenAt: new Date().toISOString(), event: info.event,
      consent: true, isMinor: minor, guardianName: minor ? consent.guardianName.trim() : undefined,
      imageDataUrl: dataUrl, imageWidth: imgSize.w, imageHeight: imgSize.h, guide, metrics, targetCard: card, prescription: rx, framing,
      appVersion: PILOT_APP_VERSION, syncState: 'local',
    };
    upsertLocal(rec);
    const synced = await syncPilotRecord(rec);
    upsertLocal(synced);
    if (synced.syncState === 'synced') { setSaveState('saved'); setSaveMsg('送信しました'); onReload(); }
    else { setSaveState('error'); setSaveMsg(`この端末には保存しました。送信は失敗しました（${synced.syncError}）。電波の良い場所で下の「再送」を押してください`); }
  }, [guide, metrics, card, rx, imgSize, dataUrl, framing, consentOk, info, phase, token, minor, consent.guardianName, onReload]);

  const rxText = useMemo(() => (card && rx) ? prescriptionToText(info.subjectCode, card, rx) : '', [card, rx, info.subjectCode]);
  const copyRx = useCallback(async () => { try { await navigator.clipboard.writeText(rxText); setSaveMsg('処方をコピーしました'); } catch { setSaveMsg('コピーできませんでした'); } }, [rxText]);

  const [resyncMsg, setResyncMsg] = useState('');
  const handleResync = useCallback(async () => { setResyncMsg('再送中…'); const r = await resyncPending(token); setResyncMsg(`成功 ${r.ok}／失敗 ${r.ng}`); if (r.ok) onReload(); }, [token, onReload]);
  const pendingCount = records.filter(r => r.syncState !== 'synced').length;

  const phaseLabel = phase === 'before' ? 'メイク前（素顔）' : 'メイク後';
  const beforeRx = localBefore?.prescription ?? null;

  return (
    <>
      {/* ── 本人 */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-stone-700">あなたのコード <span className="font-semibold text-stone-900">{info.subjectCode}</span></p>
          <button type="button" onClick={onSwitch} className="text-[11px] text-stone-400 underline">別の人のリンクで開く</button>
        </div>
        <Steps hasBefore={hasBefore} hasAfter={hasAfter} />
      </Card>

      {/* ── 同意 */}
      <Card>
        <p className="text-sm font-semibold text-stone-800">同意</p>
        {!forcedMinor && (
          <Field label="撮影する日の年齢">
            <div className="flex rounded-lg border border-stone-200 overflow-hidden">
              {([['adult', '18歳以上'], ['minor', '18歳未満']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setConsent({ age: v })} className={`flex-1 py-2 text-sm ${consent.age === v ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>{l}</button>
              ))}
            </div>
          </Field>
        )}
        <label className="flex items-start gap-3 text-xs text-stone-600 leading-relaxed">
          <input type="checkbox" checked={consent.selfConsent} onChange={e => setConsent({ selfConsent: e.target.checked })} className="mt-0.5" />
          <span>撮影した顔写真と測定値を、ミス・ワールドJAPAN運営と「黄金比 Face OS」の研究開発（メイク前後の比較を含む）に使うことに同意します。写真は運営だけが扱い、公開や第三者への提供はしません。同意の取り消しは運営にご連絡ください。</span>
        </label>
        {minor && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-xs text-amber-900">18歳未満の方は、保護者の方の同意が必要です。保護者の方が入力してください。</p>
            <Field label="保護者の氏名"><input value={consent.guardianName} onChange={e => setConsent({ guardianName: e.target.value })} className={inputCls} autoComplete="off" /></Field>
            <label className="flex items-start gap-3 text-xs text-stone-700 leading-relaxed">
              <input type="checkbox" checked={consent.guardianConsent} onChange={e => setConsent({ guardianConsent: e.target.checked })} className="mt-0.5" />
              <span>保護者として、上記の内容で本人の顔写真と測定値を使うことに同意します。</span>
            </label>
          </div>
        )}
        {consentOk && <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> 同意を確認しました</p>}
      </Card>

      {/* ── 撮影 */}
      {consentOk && !guide && (
        <Card>
          <div className="flex rounded-lg border border-stone-200 overflow-hidden">
            {(['before', 'after'] as PilotPhase[]).map(p => (
              <button key={p} type="button" disabled={p === 'after' && !hasBefore} onClick={() => { choosePhase(p); reset(); }}
                className={`flex-1 py-2 text-sm disabled:opacity-40 ${phase === p ? 'bg-stone-800 text-white' : 'bg-white text-stone-600'}`}>
                {p === 'before' ? 'メイク前（素顔）' : 'メイク後'}
              </button>
            ))}
          </div>
          {!hasBefore && <p className="text-[11px] text-stone-500">先に「メイク前（素顔）」を撮ってください。メイク後はそのあとで撮れます。</p>}
          <p className="text-sm font-semibold text-stone-800">{phaseLabel}を撮る</p>
          <ul className="text-xs text-stone-600 space-y-1 list-disc pl-5">
            {phase === 'before' ? <>
              <li>スキンケアだけの素顔で撮ります（日焼け止め・下地もなし）</li>
              <li>昼間、窓に向かって立ちます。逆光や、真上からの照明は避けてください</li>
              <li>前髪を上げて額を出します。眼鏡・カラーコンタクトは外してください</li>
              <li>できれば家族や友人に撮ってもらいます。自撮りのときは、スマホを目の高さで、腕をいっぱいに伸ばします</li>
              <li>まっすぐ前を見て、口を閉じ、無表情で撮ります</li>
            </> : <>
              <li>「メイク前」と同じ場所・同じ明かり・同じ距離で撮ってください</li>
              <li>前髪を上げて額を出します。眼鏡・カラーコンタクトは外してください</li>
              <li>まっすぐ前を見て、口を閉じ、無表情で撮ります</li>
            </>}
          </ul>
          {phase === 'after' && beforeRx && (
            <details className="text-xs text-stone-600"><summary className="cursor-pointer">メイク前に出た処方をもう一度見る</summary><RxList rx={beforeRx} /></details>
          )}
          <ImageUploader onImageSelected={handleImage} privacyNote="写真は送信すると運営だけが見られる場所に保存されます" />
          {detect === 'detecting' && <p className="text-xs text-amber-700 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 顔を検出しています…</p>}
          {detect === 'error' && <p className="text-xs text-rose-700">顔を検出できませんでした。正面・明るい場所でもう一度撮ってください</p>}
        </Card>
      )}

      {/* ── 結果 */}
      {consentOk && guide && metrics && card && rx && framing && (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-800">写りのチェック　<span className="text-xs font-normal text-stone-500">{phaseLabel}</span></p>
                <p className="text-[11px] text-stone-400">向き {framing.yaw >= 0 ? '+' : ''}{(framing.yaw * 100).toFixed(1)}%・傾き {framing.roll.toFixed(1)}°・顔の大きさ {(framing.faceWidthFrac * 100).toFixed(0)}%</p>
              </div>
              <button type="button" onClick={reset} className={ghostBtn}><RefreshCw className="w-3.5 h-3.5" /> 撮り直す</button>
            </div>
            {framing.ok ? (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> よく撮れています</p>
            ) : (
              <>
                <ul className="text-xs text-amber-800 space-y-1">{framing.warnings.map(w => <li key={w} className="flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{w}</li>)}</ul>
                <p className="text-[11px] text-stone-500">できれば撮り直してください。このまま送ることもできます。</p>
              </>
            )}
            {imageSrc && <img src={imageSrc} alt="" className="w-40 rounded-lg border border-stone-200" />}
          </Card>

          {phase === 'before' && (
            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-stone-800">あなたの処方</p>
                <div className="flex rounded-lg border border-stone-200 overflow-hidden text-xs">
                  {(['weak', 'standard', 'strong'] as Strength[]).map(s => (
                    <button key={s} type="button" onClick={() => setStrength(s)} className={`px-3 py-1.5 ${strength === s ? 'bg-amber-500 text-white' : 'bg-white text-stone-600'}`}>{STRENGTH_LABEL[s]}</button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-stone-700 leading-relaxed">{rx.headline}</p>
              {rx.items.length === 0 && <p className="text-xs text-stone-500">特に直すところはありません。いつものメイクで大丈夫です。</p>}
              <RxList rx={rx} />
              <p className="text-[11px] text-stone-500">顔そのものは変わりません。「黄金比に近づいて見える」ためのメイクの目安です。</p>
              <details className="text-xs text-stone-500">
                <summary className="cursor-pointer">詳しい数値</summary>
                <table className="w-full text-xs mt-2">
                  <thead><tr className="text-stone-400 text-[10px]"><th className="text-left py-1">指標</th><th className="text-right">現在</th><th className="text-right">目標</th><th className="text-right">方向</th></tr></thead>
                  <tbody>{card.items.map(t => (
                    <tr key={t.id} className={`border-t border-stone-100 ${t.actionable ? 'text-stone-800' : 'text-stone-400'}`}>
                      <td className="py-1">{t.label}</td><td className="text-right tabular-nums">{formatMetric(t.current, t.unit)}</td><td className="text-right tabular-nums">{formatMetric(t.ideal, t.unit)}</td><td className="text-right">{t.direction}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </details>
              <button type="button" onClick={copyRx} className={ghostBtn}><Copy className="w-3.5 h-3.5" /> 処方をコピー</button>
            </Card>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saveState === 'saving' || saveState === 'saved'} className={primaryBtn}>
                <Save className="w-4 h-4" /> {saveState === 'saved' ? '送信済み' : saveState === 'saving' ? '送信中…' : `${phaseLabel}を送信`}
              </button>
              {saveMsg && <span className={`text-xs ${saveState === 'error' ? 'text-rose-700' : 'text-stone-600'}`}>{saveMsg}</span>}
            </div>
            {saveState === 'saved' && phase === 'before' && (
              <div className="rounded-xl bg-stone-50 border border-stone-200 p-3 space-y-2 text-xs text-stone-700">
                <p>次は、上の処方を参考にメイクをしてから「メイク後」を撮ってください。同じ場所・同じ明かりで撮ると、比べやすくなります。</p>
                <button type="button" onClick={() => { choosePhase('after'); reset(); }} className={ghostBtn}><Camera className="w-3.5 h-3.5" /> メイク後を撮る</button>
              </div>
            )}
            {saveState === 'saved' && phase === 'after' && <p className="text-sm text-emerald-700">2枚とも届きました。ご協力ありがとうございました。</p>}
          </Card>
        </>
      )}

      {/* ── この端末の記録 */}
      {records.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-stone-800 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> この端末から撮った記録</p>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && <button type="button" onClick={handleResync} className={ghostBtn}><Database className="w-3.5 h-3.5" /> 再送（{pendingCount}件）</button>}
              {resyncMsg && <span className="text-xs text-stone-500">{resyncMsg}</span>}
            </div>
          </div>
          <ul className="text-xs text-stone-600 space-y-1">
            {records.map(r => (
              <li key={r.id} className="flex justify-between border-t border-stone-100 pt-1">
                <span>{new Date(r.takenAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}　{r.phase === 'before' ? 'メイク前' : 'メイク後'}</span>
                <span className={r.syncState === 'synced' ? 'text-emerald-700' : 'text-rose-700'}>{r.syncState === 'synced' ? '送信済み' : '未送信'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Steps({ hasBefore, hasAfter }: { hasBefore: boolean; hasAfter: boolean }) {
  const items: Array<[string, boolean]> = [['① メイク前（素顔）を撮る', hasBefore], ['② 処方を見てメイクする', hasBefore && hasAfter], ['③ メイク後を撮る', hasAfter]];
  return (
    <ol className="text-xs space-y-1">
      {items.map(([l, done]) => <li key={l} className={`flex items-center gap-1.5 ${done ? 'text-emerald-700' : 'text-stone-500'}`}>{done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-stone-300 inline-block" />}{l}</li>)}
    </ol>
  );
}

function RxList({ rx }: { rx: Prescription }) {
  return (
    <ol className="space-y-2 mt-2">
      {rx.items.map((i, idx) => (
        <li key={i.techniqueId} className="rounded-xl border border-stone-200 p-3 text-xs space-y-1">
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

function CodeEntry({ onSubmit, error }: { onSubmit: (v: string) => void; error?: string }) {
  const [v, setV] = useState('');
  return (
    <Card>
      <p className="text-sm text-stone-700">運営から届いた<strong>あなた専用のリンク</strong>から開いてください。リンクが開けないときは、リンクの文字をそのまま貼り付けても続けられます。</p>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <input value={v} onChange={e => setV(e.target.value)} placeholder="リンクまたはコード" className={`${inputCls} flex-1`} autoComplete="off" />
        <button type="button" disabled={!v.trim()} onClick={() => onSubmit(v)} className={primaryBtn}>開く</button>
      </div>
      <p className="text-[11px] text-stone-400 flex items-center gap-1"><Lock className="w-3 h-3" /> リンクは他の人に教えないでください</p>
    </Card>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-base font-semibold text-stone-900">ミス・ワールドJAPAN 顔の撮影</h2>
        <p className="text-xs text-stone-500">メイク前（素顔）とメイク後を、ご自身のスマホで撮って送ってください。</p>
      </div>
      <span className="text-[10px] text-stone-400">{PILOT_APP_VERSION}</span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl shadow-sm border border-stone-200/60 p-5 space-y-3">{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-stone-500">{label}{children}</label>;
}

const inputCls = 'rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800 bg-white';
const primaryBtn = 'inline-flex items-center gap-2 rounded-lg bg-stone-800 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-40';
const ghostBtn = 'inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5';
