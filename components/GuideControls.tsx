'use client';

import React from 'react';
import { RotateCcw } from 'lucide-react';
import type { GuideSettings } from '@/types/analysis';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}

function SliderRow({ label, value, min, max, step = 1, onChange, unit = 'px' }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-[11px] text-stone-500 shrink-0 text-right">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer accent-stone-700"
        style={{ accentColor: '#C9A96E' }}
      />
      <span className="w-14 text-[11px] text-stone-400 font-mono text-right shrink-0">
        {Math.round(value)}{unit}
      </span>
    </div>
  );
}

interface GuideControlsProps {
  guide: GuideSettings;
  imgW: number;
  imgH: number;
  onChange: (key: keyof GuideSettings, value: number) => void;
  onReset: () => void;
}

export default function GuideControls({ guide, imgW, imgH, onChange, onReset }: GuideControlsProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/30 overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-stone-50">
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
          ガイド位置の手動調整
        </p>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-600 bg-white transition-all duration-200"
        >
          <RotateCcw className="w-3 h-3" />
          ガイド位置をリセット
        </button>
      </div>

      <div className="p-4 space-y-1">
        <p className="text-[10px] text-stone-400 mb-3">顔枠</p>
        <SliderRow
          label="横位置"
          value={guide.faceBoxX}
          min={0}
          max={imgW * 0.5}
          onChange={(v) => onChange('faceBoxX', v)}
        />
        <SliderRow
          label="縦位置"
          value={guide.faceBoxY}
          min={0}
          max={imgH * 0.4}
          onChange={(v) => onChange('faceBoxY', v)}
        />
        <SliderRow
          label="幅"
          value={guide.faceBoxWidth}
          min={imgW * 0.2}
          max={imgW}
          onChange={(v) => onChange('faceBoxWidth', v)}
        />
        <SliderRow
          label="高さ"
          value={guide.faceBoxHeight}
          min={imgH * 0.3}
          max={imgH}
          onChange={(v) => onChange('faceBoxHeight', v)}
        />

        <p className="text-[10px] text-stone-400 pt-3 pb-1">基準線</p>
        <SliderRow
          label="中心線"
          value={guide.centerLineX}
          min={imgW * 0.1}
          max={imgW * 0.9}
          onChange={(v) => onChange('centerLineX', v)}
        />

        <p className="text-[10px] text-stone-400 pt-3 pb-1">顔パーツライン</p>
        <SliderRow
          label="眉ライン"
          value={guide.eyebrowLineY}
          min={imgH * 0.05}
          max={imgH * 0.6}
          onChange={(v) => onChange('eyebrowLineY', v)}
        />
        <SliderRow
          label="目ライン"
          value={guide.eyeLineY}
          min={imgH * 0.1}
          max={imgH * 0.65}
          onChange={(v) => onChange('eyeLineY', v)}
        />
        <SliderRow
          label="鼻下ライン"
          value={guide.noseBaseLineY}
          min={imgH * 0.3}
          max={imgH * 0.8}
          onChange={(v) => onChange('noseBaseLineY', v)}
        />
        <SliderRow
          label="唇ライン"
          value={guide.lipLineY}
          min={imgH * 0.4}
          max={imgH * 0.9}
          onChange={(v) => onChange('lipLineY', v)}
        />
        <SliderRow
          label="顎ライン"
          value={guide.chinLineY}
          min={imgH * 0.5}
          max={imgH * 0.99}
          onChange={(v) => onChange('chinLineY', v)}
        />
      </div>
    </div>
  );
}
