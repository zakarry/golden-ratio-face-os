'use client';

import React, { useState } from 'react';
import { Chrome as Home, ScanFace, Activity, Brush, BookOpen, TrendingUp, Grid3x3, User, Users, X } from 'lucide-react';
import type { UserLevel } from '@/types/userLevel';
import { USER_LEVEL_LABELS, USER_LEVEL_DESCRIPTIONS } from '@/types/userLevel';

type Gender = 'female' | 'male';
type NavId = 'home' | 'identity' | 'condition' | 'design' | 'karte' | 'insight';

interface FaceOSNavProps {
  active: NavId;
  onNavigate: (id: NavId) => void;
  gender: Gender;
  onGenderChange: (g: Gender) => void;
  level: UserLevel;
  onLevelChange: (l: UserLevel) => void;
}

const NAV_ITEMS: Array<{ id: NavId; label: string; sublabel?: string; icon: React.ReactNode }> = [
  { id: 'home',      label: 'ホーム',                     icon: <Home className="w-4 h-4" /> },
  { id: 'identity',  label: 'あなたの顔の設計図', sublabel: '黄金比・Face Identity', icon: <ScanFace className="w-4 h-4" /> },
  { id: 'condition', label: '今日のセルフケア',           icon: <Activity className="w-4 h-4" /> },
  { id: 'design',    label: '今日のメイクの目的は？',     icon: <Brush className="w-4 h-4" /> },
  { id: 'karte',     label: '顔カルテ',                   icon: <BookOpen className="w-4 h-4" /> },
  { id: 'insight',   label: '顔インサイト',               icon: <TrendingUp className="w-4 h-4" /> },
];

const MOBILE_PRIMARY: NavId[] = ['home', 'identity', 'condition', 'design'];
const MOBILE_MORE: NavId[] = ['karte', 'insight'];

export default function FaceOSNav({ active, onNavigate, gender, onGenderChange, level, onLevelChange }: FaceOSNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isMale = gender === 'male';

  const handleNavigate = (id: NavId) => {
    onNavigate(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="hidden lg:flex flex-col gap-1 sticky top-[73px] w-56 flex-shrink-0 self-start">
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? isMale
                    ? 'bg-stone-800 text-white shadow-sm'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm'
                  : 'text-stone-500 hover:bg-stone-100/80 hover:text-stone-700'
              }`}
            >
              <span className={isActive ? 'text-white' : 'text-stone-400'}>{item.icon}</span>
              <span className="flex flex-col">
                <span>{item.label}</span>
                {item.sublabel && (
                  <span className={`text-[9px] tracking-wide ${isActive ? 'text-white/60' : 'text-stone-400'}`}>{item.sublabel}</span>
                )}
              </span>
            </button>
          );
        })}

        <div className="mt-4 pt-4 border-t border-stone-200/60">
          <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase px-4 mb-2">分析タイプ</p>
          <div className="flex items-center rounded-full border border-stone-200 overflow-hidden bg-white shadow-sm mx-4">
            <button
              onClick={() => onGenderChange('female')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${gender === 'female' ? 'bg-amber-500 text-white' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <Users className="w-3 h-3" />女性
            </button>
            <button
              onClick={() => onGenderChange('male')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${gender === 'male' ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-700'}`}
            >
              <User className="w-3 h-3" />男性
            </button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-stone-200/60">
          <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase px-4 mb-2">レベル</p>
          <p className="text-[10px] text-stone-400 px-4 mb-2 leading-relaxed">近い状況を選んでください</p>
          <div className="flex flex-col gap-1.5 mx-4">
            {(Object.keys(USER_LEVEL_LABELS) as UserLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => onLevelChange(l)}
                className={`text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-200 border ${
                  level === l
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-white border-stone-200 text-stone-500 hover:border-amber-200 hover:text-stone-700'
                }`}
              >
                <span className="block font-semibold">{USER_LEVEL_LABELS[l]}</span>
                <span className={`block text-[10px] mt-0.5 leading-snug ${level === l ? 'text-white/80' : 'text-stone-400'}`}>
                  {USER_LEVEL_DESCRIPTIONS[l]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <nav className={`lg:hidden fixed bottom-0 inset-x-0 z-50 border-t bg-white/95 backdrop-blur-md ${isMale ? 'border-stone-200' : 'border-stone-200'}`}>
        <div className="flex items-stretch justify-around max-w-md mx-auto px-1">
          {MOBILE_PRIMARY.map(id => {
            const item = NAV_ITEMS.find(n => n.id === id)!;
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => handleNavigate(id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-2 flex-1 transition-colors ${isActive ? (isMale ? 'text-stone-800' : 'text-amber-600') : 'text-stone-400'}`}
              >
                <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                <span className="text-[9px] font-medium leading-none text-center leading-tight">{item.label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-0.5 py-2 px-2 flex-1 transition-colors ${MOBILE_MORE.includes(active) ? (isMale ? 'text-stone-800' : 'text-amber-600') : 'text-stone-400'}`}
          >
            <span className="w-5 h-5 flex items-center justify-center"><Grid3x3 className="w-4 h-4" /></span>
            <span className="text-[9px] font-medium leading-none">もっと</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl shadow-xl animate-in slide-in-from-bottom duration-300 pb-safe">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-sm font-semibold text-stone-700">もっと見る</p>
              <button onClick={() => setMoreOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>
            <div className="px-5 pb-6 pt-2 space-y-1">
              {MOBILE_MORE.map(id => {
                const item = NAV_ITEMS.find(n => n.id === id)!;
                const isActive = active === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleNavigate(id)}
                    className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? isMale ? 'bg-stone-100 text-stone-800' : 'bg-amber-50 text-amber-700'
                        : 'text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <span className="text-stone-400">{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}

              <div className="pt-3 mt-2 border-t border-stone-100">
                <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-2">分析タイプ</p>
                <div className="flex items-center rounded-full border border-stone-200 overflow-hidden bg-white shadow-sm">
                  <button
                    onClick={() => { onGenderChange('female'); setMoreOpen(false); }}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all ${gender === 'female' ? 'bg-amber-500 text-white' : 'text-stone-500'}`}
                  >
                    <Users className="w-3.5 h-3.5" />女性
                  </button>
                  <button
                    onClick={() => { onGenderChange('male'); setMoreOpen(false); }}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-all ${gender === 'male' ? 'bg-stone-800 text-white' : 'text-stone-500'}`}
                  >
                    <User className="w-3.5 h-3.5" />男性
                  </button>
                </div>
              </div>

              <div className="pt-3 mt-2 border-t border-stone-100">
                <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-1">レベル</p>
                <p className="text-[10px] text-stone-400 mb-2 leading-relaxed">近い状況を選んでください</p>
                <div className="flex flex-col gap-1.5">
                  {(Object.keys(USER_LEVEL_LABELS) as UserLevel[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => { onLevelChange(l); setMoreOpen(false); }}
                      className={`text-left px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-200 border ${
                        level === l
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-white border-stone-200 text-stone-500 hover:border-amber-200 hover:text-stone-700'
                      }`}
                    >
                      <span className="block font-semibold">{USER_LEVEL_LABELS[l]}</span>
                      <span className={`block text-[10px] mt-0.5 leading-snug ${level === l ? 'text-white/80' : 'text-stone-400'}`}>
                        {USER_LEVEL_DESCRIPTIONS[l]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
