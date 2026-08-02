'use client';

import React from 'react';
import { Shield, Database } from 'lucide-react';

interface ConsentBoxProps {
  consented: boolean;
  onConsentChange: (value: boolean) => void;
  onSave: () => void;
  saved: boolean;
}

export default function ConsentBox({ consented, onConsentChange, onSave, saved }: ConsentBoxProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-champagne/40 p-6 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-gold" strokeWidth={1.5} />
        <p className="text-xs font-semibold text-stone-400 tracking-widest uppercase">
          匿名データ利用について
        </p>
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        本ツールで算出された顔バランスの数値データは、顔バランス研究の統計分析に活用される場合があります。
        画像は一切保存されません。数値データのみが対象です。
      </p>

      <label className="flex items-start gap-3 cursor-pointer group">
        <div className="relative mt-0.5">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => onConsentChange(e.target.checked)}
            className="sr-only"
          />
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-200 ${
              consented
                ? 'bg-gold border-gold'
                : 'border-stone-300 bg-white group-hover:border-gold/60'
            }`}
          >
            {consented && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                <path
                  d="M1 4l3 3 5-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </div>
        <span className="text-xs text-stone-600 leading-relaxed">
          分析結果の数値データを匿名で統計分析に利用することに同意する
        </span>
      </label>

      <button
        onClick={onSave}
        disabled={!consented || saved}
        className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 ${
          consented && !saved
            ? 'bg-stone-900 text-white hover:bg-stone-700 shadow-sm'
            : 'bg-stone-100 text-stone-400 cursor-not-allowed'
        }`}
      >
        <Database className="w-3.5 h-3.5" strokeWidth={1.8} />
        {saved ? '保存済み' : '匿名データとして保存'}
      </button>

      {saved && (
        <p className="text-xs text-emerald-600 text-center font-medium">
          データが匿名で保存されました。ご協力ありがとうございます。
        </p>
      )}
    </div>
  );
}
