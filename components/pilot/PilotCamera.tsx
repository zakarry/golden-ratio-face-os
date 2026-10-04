'use client';

// パイロットの撮影用アプリ内カメラ（components/CameraCapture.tsx をもとにガイドと写りの判定を足したもの）
// ・ライブ映像に、顔を収める楕円・目の高さの横線・中心の縦線を重ねる
// ・約5fpsで顔を検出し、写りの基準（FRAMING_LIMITS）を満たすときだけ楕円を緑にしてシャッターを押せるようにする
// ・撮った画像はそのまま onCapture に渡す（その後の解析・保存は今まで通り）

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleAlert as AlertCircle, RefreshCw, SwitchCamera } from 'lucide-react';
import { detectGuideOnCanvas } from '@/lib/faceLandmarks';
import { FRAMING_HINT, measureFraming, type FramingIssue } from '@/lib/pilot/pilotStorage';

type CamState = 'idle' | 'starting' | 'live' | 'captured' | 'error';
type Facing = 'user' | 'environment';
/** 検出の状態。preparing＝検出の準備中、unavailable＝この端末では検出が使えない */
type Check = { kind: 'preparing' } | { kind: 'unavailable' } | { kind: 'noface' } | { kind: 'face'; issues: FramingIssue[] };

const DETECT_INTERVAL_MS = 200;   // 約5fps
const DETECT_WIDTH = 360;         // 検出用に縮める幅（px）
const GREEN = '#22c55e';
const YELLOW = '#facc15';

export default function PilotCamera({ onCapture, onFallback }: { onCapture: (dataUrl: string) => void; onFallback: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('idle');
  const [facing, setFacing] = useState<Facing>('user');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [check, setCheck] = useState<Check>({ kind: 'preparing' });
  const [error, setError] = useState<{ name: string; message: string } | null>(null);
  const [still, setStill] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const start = useCallback(async (face: Facing) => {
    const video = videoRef.current;
    if (!video) return;
    stopStream();
    setError(null); setStill(null); setState('starting'); setCheck({ kind: 'preparing' });
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      } catch (e) {
        // 許可がないとき以外は、いちばん単純な指定でもう一度
        const name = (e as DOMException).name;
        if (name === 'NotAllowedError' || name === 'SecurityError') throw e;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setDims({ w: video.videoWidth || 640, h: video.videoHeight || 480 });
      setFacing(face);
      setState('live');
    } catch (e) {
      const err = e as DOMException;
      setError({ name: err.name ?? 'Error', message: err.message ?? '' });
      setState('error');
    }
  }, [stopStream]);

  // 端末を回したときなどに映像の縦横が変わる
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onResize = () => { if (video.videoWidth) setDims({ w: video.videoWidth, h: video.videoHeight }); };
    video.addEventListener('resize', onResize);
    return () => video.removeEventListener('resize', onResize);
  }, []);

  // 約5fpsで顔を検出して写りを判定する
  useEffect(() => {
    if (state !== 'live') return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    let busy = false, alive = true;
    const tick = async () => {
      if (busy || !video.videoWidth) return;
      busy = true;
      try {
        const w = DETECT_WIDTH, h = Math.round(video.videoHeight * DETECT_WIDTH / video.videoWidth);
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
        const g = await detectGuideOnCanvas(canvas);
        if (!alive) return;
        setCheck(g ? { kind: 'face', issues: measureFraming(g, w, h).issues } : { kind: 'noface' });
      } catch (e) {
        // 検出が使えない端末では、ガイドなしで撮影できるようにする
        console.warn('[pilot camera] detection unavailable', e);
        if (alive) setCheck({ kind: 'unavailable' });
      } finally { busy = false; }
    };
    const id = window.setInterval(tick, DETECT_INTERVAL_MS);
    tick();
    return () => { alive = false; window.clearInterval(id); };
  }, [state]);

  const ok = check.kind === 'face' && check.issues.length === 0;
  const canShoot = state === 'live' && (ok || check.kind === 'unavailable');

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !canShoot) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext('2d')!;
    // 自撮りは見えていた通り（左右反転）で残す
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    stopStream();
    setStill(dataUrl);
    setState('captured');
    onCapture(dataUrl);
  }, [canShoot, facing, onCapture, stopStream]);

  // ── ガイドの形（映像の画素座標）
  const vw = dims?.w ?? 3, vh = dims?.h ?? 4;
  const rx = vw * 0.32;                                   // 楕円の幅＝画面幅の64%（顔を大きめに写す）
  const ry = Math.min(rx * 1.35, vh * 0.45);
  const cy = Math.min(Math.max(vh * 0.47, ry + vh * 0.07), vh - ry - vh * 0.02);
  const cx = vw / 2;
  const eyeY = cy - ry + ry * 2 * 0.4;                    // 楕円の上から40%
  const color = state !== 'live' || check.kind === 'preparing' || check.kind === 'unavailable' ? 'rgba(255,255,255,0.85)' : ok ? GREEN : YELLOW;

  const message =
    state !== 'live' ? '' :
    check.kind === 'preparing' ? '顔の検出を準備しています…' :
    check.kind === 'unavailable' ? 'この端末ではガイドが使えません。枠に合わせて撮影してください' :
    check.kind === 'noface' ? '顔が見つかりません' :
    ok ? 'この位置でOK。撮影できます' :
    check.issues.map(i => FRAMING_HINT[i]).join('・');

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto rounded-xl overflow-hidden bg-stone-900"
        style={{ aspectRatio: `${vw} / ${vh}`, width: `min(100%, calc(68vh * ${vw / vh}))` }}
      >
        {/* video は常に置いておく（play 前に ref が必要） */}
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-fill"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined, visibility: state === 'live' ? 'visible' : 'hidden' }} />

        {state === 'captured' && still && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt="撮影した画像" className="absolute inset-0 w-full h-full object-fill" />
        )}

        {(state === 'live' || state === 'captured') && (
          <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <line x1={cx - rx * 1.15} x2={cx + rx * 1.15} y1={eyeY} y2={eyeY} stroke={color} strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
            <line x1={cx} x2={cx} y1={cy - ry} y2={cy + ry} stroke={color} strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
          </svg>
        )}

        {state === 'live' && (
          <>
            <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: `${((cy - ry) / vh) * 100}%`, transform: 'translateY(-115%)' }}>
              <span className="text-[11px] sm:text-xs text-white bg-black/45 px-3 py-1 rounded-full">前髪を上げて、首から上を枠に</span>
            </div>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none px-3">
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full text-center"
                style={{ background: 'rgba(0,0,0,0.55)', color: ok ? GREEN : check.kind === 'face' || check.kind === 'noface' ? YELLOW : '#fff' }}>
                {message}
              </span>
            </div>
            <button type="button" onClick={() => start(facing === 'user' ? 'environment' : 'user')}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/45 flex items-center justify-center text-white" title="前後のカメラを切り替える">
              <SwitchCamera className="w-5 h-5" />
            </button>
          </>
        )}

        {state === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <button type="button" onClick={() => start('user')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C9A96E 0%, #A07840 100%)' }}>
              <Camera className="w-4 h-4" /> カメラを起動する
            </button>
            <p className="text-[11px] text-stone-400 leading-relaxed">カメラの許可を聞かれたら「許可」を選んでください</p>
          </div>
        )}

        {state === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-stone-400">カメラを起動しています…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center overflow-y-auto py-4">
            <AlertCircle className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
            <p className="text-xs text-stone-200 leading-relaxed">カメラを起動できませんでした。<br />下の「スマホのカメラで撮る」を使ってください。</p>
            {error && <p className="text-[10px] text-stone-400 font-mono break-all">{error.name} {error.message}</p>}
            <button type="button" onClick={() => start(facing)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs bg-stone-700 text-stone-100">
              <RefreshCw className="w-3.5 h-3.5" /> もう一度
            </button>
          </div>
        )}
      </div>

      {state === 'live' && (
        <button type="button" onClick={capture} disabled={!canShoot}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white bg-stone-800 disabled:opacity-35 active:scale-[0.99]">
          <Camera className="w-5 h-5" /> {canShoot ? '撮影する' : '枠が緑になると撮影できます'}
        </button>
      )}
      {state === 'captured' && (
        <div className="flex items-center justify-between gap-2 text-xs text-stone-600">
          <span>撮影しました。解析しています…</span>
          <button type="button" onClick={() => start(facing)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5"><RefreshCw className="w-3.5 h-3.5" /> 撮り直す</button>
        </div>
      )}

      <button type="button" onClick={() => { stopStream(); onFallback(); }} className={`text-xs underline ${state === 'error' ? 'text-stone-800 font-semibold' : 'text-stone-500'}`}>
        カメラが開かない場合は、スマホのカメラで撮る
      </button>
    </div>
  );
}
