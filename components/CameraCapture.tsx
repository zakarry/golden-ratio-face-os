'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Camera, X, RefreshCw, CircleAlert as AlertCircle, Upload, FlipHorizontal } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  onFallbackUpload: () => void;
}

type CameraState = 'idle' | 'starting' | 'live' | 'captured' | 'error';

export default function CameraCapture({ onCapture, onClose, onFallbackUpload }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<CameraState>('idle');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [errorName, setErrorName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Track which device index we are on for manual camera switching
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const startWithConstraints = useCallback(async (constraints: MediaStreamConstraints) => {
    stopStream();
    const video = videoRef.current;
    if (!video) return false;

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;
    video.srcObject = stream;
    await video.play();
    return true;
  }, [stopStream]);

  // Called only from an explicit user click
  const handleStartCamera = useCallback(async () => {
    setErrorName(null);
    setErrorMessage(null);
    setState('starting');

    try {
      // Step 1: simplest possible constraint for maximum compatibility
      await startWithConstraints({ video: true, audio: false });

      // Step 2: enumerate devices now that permission is granted
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
        setDevices(videoDevices);
        setDeviceIndex(0);
      } catch {
        // enumeration failure is non-fatal
      }

      setState('live');
    } catch (err) {
      const e = err as DOMException;
      setErrorName(e.name ?? 'UnknownError');
      setErrorMessage(e.message ?? '');
      setState('error');
    }
  }, [startWithConstraints]);

  // Switch to next available camera device
  const handleSwitchCamera = useCallback(async () => {
    if (devices.length < 2) return;
    const nextIndex = (deviceIndex + 1) % devices.length;
    const deviceId = devices[nextIndex].deviceId;
    try {
      await startWithConstraints({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      setDeviceIndex(nextIndex);
    } catch (err) {
      const e = err as DOMException;
      setErrorName(e.name ?? 'UnknownError');
      setErrorMessage(e.message ?? '');
      setState('error');
    }
  }, [devices, deviceIndex, startWithConstraints]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d')!;
    // Mirror to match what user saw in the selfie preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedDataUrl(dataUrl);
    stopStream();
    setState('captured');
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    setCapturedDataUrl(null);
    setDevices([]);
    setDeviceIndex(0);
    setState('idle');
  }, []);

  const handleUse = useCallback(() => {
    if (capturedDataUrl) onCapture(capturedDataUrl);
  }, [capturedDataUrl, onCapture]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar — always visible when not idle/captured */}
      {(state === 'starting' || state === 'error') && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
          state === 'error'
            ? 'bg-amber-50 border border-amber-200 text-amber-700'
            : 'bg-stone-100 border border-stone-200 text-stone-500'
        }`}>
          {state === 'starting' && (
            <>
              <div className="w-3 h-3 border border-stone-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              カメラ起動中...
            </>
          )}
          {state === 'error' && (
            <>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              カメラ起動失敗
            </>
          )}
        </div>
      )}

      {/* Video / preview area */}
      <div
        className="relative rounded-xl overflow-hidden bg-stone-900 w-full"
        style={{ aspectRatio: '4/3' }}
      >
        {/* Video — always mounted so ref is ready before play() */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: 'scaleX(-1)',
            display: state === 'live' ? 'block' : 'none',
          }}
        />

        {/* Captured still */}
        {state === 'captured' && capturedDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedDataUrl}
            alt="撮影した画像"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Idle: prompt user to start */}
        {state === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
            <div className="w-14 h-14 rounded-full bg-stone-800 flex items-center justify-center">
              <Camera className="w-7 h-7 text-champagne" strokeWidth={1.5} />
            </div>
            <button
              onClick={handleStartCamera}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 shadow-lg active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C9A96E 0%, #A07840 100%)' }}
            >
              <Camera className="w-4 h-4" />
              カメラを起動する
            </button>
            <p className="text-[10px] text-stone-500 text-center leading-relaxed">
              ブラウザがカメラへのアクセス許可を求める場合は「許可」を選択してください
            </p>
          </div>
        )}

        {/* Starting spinner */}
        {state === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-champagne border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-stone-400">カメラ起動中...</p>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center overflow-y-auto py-4">
            <AlertCircle className="w-8 h-8 text-amber-400 flex-shrink-0" strokeWidth={1.5} />
            <p className="text-xs text-stone-300 leading-relaxed">
              カメラを起動できませんでした。
              <br />
              ブラウザのカメラ許可、HTTPS接続、Safari/Chromeの設定を確認してください。
            </p>
            {/* Android Edge specific guidance */}
            <p className="text-[10px] text-stone-400 leading-relaxed bg-stone-800 rounded-lg px-3 py-2">
              Android Edgeではカメラが起動しない場合があります。Chromeブラウザでの利用を推奨します。
            </p>
            {/* Raw error for debugging */}
            {(errorName || errorMessage) && (
              <div className="w-full bg-stone-800 rounded px-2 py-1.5 text-left">
                {errorName && (
                  <p className="text-[10px] text-amber-400 font-mono break-all">{errorName}</p>
                )}
                {errorMessage && (
                  <p className="text-[10px] text-stone-400 font-mono break-all">{errorMessage}</p>
                )}
              </div>
            )}
            {/* Retry */}
            <button
              onClick={handleStartCamera}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-stone-700 text-stone-200 hover:bg-stone-600 transition-all duration-200 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              再試行
            </button>
          </div>
        )}

        {/* Live viewfinder overlay */}
        {state === 'live' && (
          <div className="absolute inset-0 pointer-events-none">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
            >
              <ellipse
                cx="50" cy="48" rx="28" ry="36"
                fill="none"
                stroke="rgba(230,207,167,0.55)"
                strokeWidth="0.6"
                strokeDasharray="3 2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <span className="text-[10px] text-champagne/80 bg-black/35 backdrop-blur-sm px-3 py-1 rounded-full">
                顔を枠に合わせてください
              </span>
            </div>
            {/* Camera switch button — only when multiple cameras available */}
            {devices.length > 1 && (
              <button
                onClick={handleSwitchCamera}
                className="pointer-events-auto absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-all active:scale-95"
                title="カメラを切り替える"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={handleClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 bg-white transition-all duration-200"
        >
          <X className="w-3.5 h-3.5" />
          カメラを閉じる
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Prominent upload fallback on error */}
          {state === 'error' && (
            <button
              onClick={onFallbackUpload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-200 shadow-sm active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C9A96E 0%, #A07840 100%)' }}
            >
              <Upload className="w-3.5 h-3.5" />
              写真をアップロードする
            </button>
          )}

          {state === 'captured' && (
            <button
              onClick={handleRetake}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700 bg-white transition-all duration-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              撮り直す
            </button>
          )}

          {state === 'live' && (
            <button
              onClick={handleCapture}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 transition-all duration-200 shadow-sm active:scale-95"
            >
              <Camera className="w-4 h-4" />
              撮影する
            </button>
          )}

          {state === 'captured' && (
            <button
              onClick={handleUse}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-200 shadow-sm active:scale-95"
              style={{ background: 'linear-gradient(135deg, #C9A96E 0%, #A07840 100%)' }}
            >
              この写真を使う
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
