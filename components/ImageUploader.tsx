'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Upload, Camera, Image as ImageIcon, Lock } from 'lucide-react';
import CameraCapture from './CameraCapture';

interface ImageUploaderProps {
  onImageSelected: (url: string) => void;
  /** 下部の注記を差し替える（写真を保存する画面では既定の「保存されません」を出さない） */
  privacyNote?: string;
}

type Mode = 'choose' | 'camera';

export default function ImageUploader({ onImageSelected, privacyNote }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<Mode>('choose');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      onImageSelected(URL.createObjectURL(file));
    },
    [onImageSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleCameraCapture = useCallback(
    (dataUrl: string) => {
      onImageSelected(dataUrl);
    },
    [onImageSelected]
  );

  // ── Camera mode ────────────────────────────────────────────────────────
  if (mode === 'camera') {
    return (
      <div className="w-full rounded-2xl border border-champagne/40 bg-stone-50 p-4">
        <CameraCapture
          onCapture={(dataUrl) => {
            setMode('choose');
            handleCameraCapture(dataUrl);
          }}
          onClose={() => setMode('choose')}
          onFallbackUpload={() => {
            setMode('choose');
            // brief timeout so state resets before triggering file picker
            setTimeout(() => fileInputRef.current?.click(), 50);
          }}
        />
      </div>
    );
  }

  // ── Default: upload + camera choice ───────────────────────────────────
  return (
    <div className="w-full space-y-3">
      {/* Two option cards side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Upload card */}
        <div
          className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer min-h-[200px] p-5 text-center
            ${isDragging
              ? 'border-gold bg-gold/10 scale-[1.01]'
              : 'border-champagne bg-beige/50 hover:border-gold hover:bg-gold/5'
            }`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-champagne/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-gold" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-700 mb-0.5">
                写真をアップロード
              </p>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                クリックまたは<br />ドラッグ＆ドロップ
              </p>
              <p className="text-[10px] text-stone-300 mt-1.5">
                JPG · PNG · WEBP
              </p>
            </div>
          </div>
        </div>

        {/* Camera card */}
        <div
          className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-champagne bg-beige/50 hover:border-gold hover:bg-gold/5 transition-all duration-300 cursor-pointer min-h-[200px] p-5 text-center"
          onClick={() => setMode('camera')}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-champagne/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-gold" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-700 mb-0.5">
                カメラで撮影
              </p>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                フロントカメラで<br />リアルタイム撮影
              </p>
              <p className="text-[10px] text-stone-300 mt-1.5">
                スマートフォン対応
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3 text-stone-300" />
        <span className="text-[10px] text-stone-300">
          {privacyNote ?? '画像はデバイス上のみで処理され、一切保存されません'}
        </span>
        <ImageIcon className="w-3 h-3 text-stone-300" />
      </div>
    </div>
  );
}
