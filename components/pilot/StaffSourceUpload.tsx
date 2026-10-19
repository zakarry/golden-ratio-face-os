'use client';

// 運営が本人の写真を1枚アップロードする（撮影の場で撮り直したとき、本人のスマホで送ってもらわなくて済むように）
// 寄せ方欄・完成イメージ欄の両方に置く。上がったら pilot-staff-source-added を出し、両方の欄が読み直す。
// 進み具合とエラーはボタンのすぐ横に出す。

import React, { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { uploadStaffSource, type StaffSourceRow } from '@/lib/pilot/render';

export const STAFF_SOURCE_EVENT = 'pilot-staff-source-added';

export default function StaffSourceUpload({ token, code, onUploaded }: { token: string; code: string; onUploaded?: (row: StaffSourceRow) => void }) {
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const busy = !!step;
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setStep('写真を読み込んでいます…');
    try {
      const row = await uploadStaffSource(token, code, file, setStep);
      window.dispatchEvent(new CustomEvent(STAFF_SOURCE_EVENT, { detail: row.id }));
      onUploaded?.(row);
    } catch (e) {
      console.error('[staff source upload]', e);
      setError(e instanceof Error ? e.message : String(e));
    }
    setStep('');
  };
  return (
    <span className="inline-flex flex-col gap-0.5">
      <label className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs px-3 py-1.5 cursor-pointer whitespace-nowrap ${busy ? 'opacity-40 pointer-events-none' : ''}`}>
        <ImagePlus className="w-3.5 h-3.5" /> {busy ? step : '運営がアップロード'}
        <input type="file" accept="image/*,.heic,.heif" className="hidden" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      </label>
      {error && <span className="text-[11px] text-rose-700 max-w-xs">{error}</span>}
    </span>
  );
}
