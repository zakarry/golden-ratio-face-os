'use client';

import React, { useState } from 'react';
import { CircleCheck as CheckCircle2, Save, Loader as Loader2 } from 'lucide-react';

interface SaveKarteButtonProps {
  label: string;
  onSave: () => void;
  saved: boolean;
  disabled?: boolean;
}

export default function SaveKarteButton({ label, onSave, saved, disabled }: SaveKarteButtonProps) {
  const [saving, setSaving] = useState(false);

  const handleClick = async () => {
    if (saved || disabled || saving) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400)); // brief visual feedback
    onSave();
    setSaving(false);
  };

  if (saved) {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
        <CheckCircle2 className="w-4 h-4" />
        <span className="text-sm font-semibold">カルテを保存しました</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || saving}
      className={`flex items-center justify-center gap-2 w-full px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
        disabled
          ? 'bg-stone-100 border border-stone-200 text-stone-300 cursor-not-allowed'
          : 'bg-stone-800 border border-stone-800 text-white hover:bg-stone-700 active:scale-[0.98] shadow-sm'
      }`}
    >
      {saving ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {label}
    </button>
  );
}
