'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, ChevronDown, BookOpen, Clock, Stethoscope, Brush, Activity, Flame } from 'lucide-react';
import { getFaceKarteRecords, deleteFaceKarteRecord, getBaselineRecord } from '@/lib/karteStorage';
import type { FaceKarteRecord, KarteRecordType } from '@/types/karte';
import FaceIdentityLink from '@/components/FaceIdentityLink';

const TYPE_CONFIG: Record<KarteRecordType, { label: string; icon: React.ReactNode; badge: string; dot: string }> = {
  baseline:    { label: '初回カルテ',     icon: <Stethoscope className="w-3.5 h-3.5" />, badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-400' },
  monthly:     { label: '月次チェック',   icon: <Clock className="w-3.5 h-3.5" />,       badge: 'bg-sky-50 border-sky-200 text-sky-700',             dot: 'bg-sky-400'     },
  dailyMakeup:    { label: '今日のメイク',   icon: <Brush className="w-3.5 h-3.5" />,       badge: 'bg-amber-50 border-amber-200 text-amber-700',       dot: 'bg-amber-400'   },
  dailyCondition: { label: '今日の顔',       icon: <Activity className="w-3.5 h-3.5" />,     badge: 'bg-sky-50 border-sky-200 text-sky-700',             dot: 'bg-sky-400'     },
};

export default function TabHistory({ onNavigate }: { onNavigate?: (nav: string) => void }) {
  const [records, setRecords] = useState<FaceKarteRecord[]>([]);
  const [filter, setFilter]   = useState<KarteRecordType | 'all'>('all');

  const reload = useCallback(() => setRecords(getFaceKarteRecords()), []);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('このカルテを削除しますか？')) return;
    deleteFaceKarteRecord(id);
    reload();
  }, [reload]);

  const filtered = filter === 'all' ? records : records.filter(r => r.recordType === filter);

  // ── Face yoga streak: consecutive days with completed face yoga ──
  const streak = useMemo(() => {
    const yogaDays = records
      .filter(r => r.faceYogaPlan?.completed)
      .map(r => new Date(r.date).toDateString())
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    if (yogaDays.length === 0) return 0;
    let count = 1;
    for (let i = 1; i < yogaDays.length; i++) {
      const prev = new Date(yogaDays[i - 1]);
      const curr = new Date(yogaDays[i]);
      const diff = Math.round((prev.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) count++; else break;
    }
    return count;
  }, [records]);

  const yogaCount = useMemo(
    () => records.filter(r => r.faceYogaPlan?.completed).length,
    [records],
  );

  return (
    <div className="space-y-4">
      {/* Face Identity persistent access */}
      {getBaselineRecord() && (
        <FaceIdentityLink onClick={() => onNavigate?.('identity')} variant="card" />
      )}

      {/* Streak summary */}
      {yogaCount > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-200/50 rounded-2xl px-5 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-emerald-600" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">顔ヨガ継続 {streak}日</p>
            <p className="text-[10px] text-emerald-600/80 mt-0.5">
              記録上の変化・本人の実感・コンディションの推移として記録しています（顔ヨガによる骨格や黄金比の変化を主張するものではありません）
            </p>
          </div>
          <span className="text-[10px] text-emerald-600 font-medium">通算 {yogaCount}回</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'baseline', 'dailyCondition', 'monthly', 'dailyMakeup'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all duration-200 ${filter === f ? 'bg-stone-800 border-stone-800 text-white' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-400'}`}
          >
            {f === 'all' ? (
              <><BookOpen className="w-3 h-3" />すべて</>
            ) : (
              <>{TYPE_CONFIG[f].icon}{TYPE_CONFIG[f].label}</>
            )}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-stone-400">{filtered.length}件</span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-stone-300" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">カルテが見つかりません</p>
            <p className="text-xs text-stone-400 mt-1">
              {filter === 'all' ? '各タブで診断後にカルテを保存すると、ここに記録が表示されます' : `${TYPE_CONFIG[filter].label}のカルテがまだありません`}
            </p>
          </div>
        </div>
      )}

      {/* Record cards */}
      <div className="space-y-3">
        {filtered.map(record => (
          <KarteCard key={record.id} record={record} onDelete={handleDelete} />
        ))}
      </div>

      {records.length > 0 && (
        <p className="text-center text-[10px] text-stone-300 pt-2">
          データはこのデバイスのローカルストレージに保存されています
        </p>
      )}
    </div>
  );
}

// ─── Single karte card ────────────────────────────────────────────────────────

function KarteCard({ record, onDelete }: { record: FaceKarteRecord; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = TYPE_CONFIG[record.recordType];
  const date = new Date(record.date);

  const triangleLabel = record.triangleAnalysis.label;
  const grRatio = record.goldenRatio.faceRatio.toFixed(3);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 overflow-hidden">
      {/* Header — always visible */}
      <div className="px-5 py-4 flex items-center gap-3">
        {/* Type dot */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
          {cfg.icon}
        </div>

        {/* Date + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
              {cfg.label}
            </span>
            <span className="text-[10px] text-stone-400">
              {date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 truncate">
            {triangleLabel} · 縦横比 {grRatio}
            {record.diagnosisSummary.length > 0 && ` · ${record.diagnosisSummary.length}件の調整ポイント`}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => onDelete(record.id)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors group"
          >
            <Trash2 className="w-3.5 h-3.5 text-stone-300 group-hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-stone-100 px-5 py-4 space-y-4">
          {/* Strengths */}
          {record.strengths.length > 0 && (
            <Section title="強み">
              <ul className="space-y-1">
                {record.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    <span className="text-xs text-stone-600">{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Diagnosis summary */}
          {record.diagnosisSummary.length > 0 && (
            <Section title="調整ポイント">
              <div className="flex flex-wrap gap-1.5">
                {record.diagnosisSummary.map((s, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 border border-sky-100 text-sky-700">{s}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Golden ratio */}
          <Section title="黄金比参考値">
            <div className="grid grid-cols-3 gap-2">
              <MetricChip label="縦横比" value={record.goldenRatio.faceRatio.toFixed(3)} ref_={1.618} />
              <MetricChip label="目位置" value={record.goldenRatio.eyePosition.toFixed(3)} ref_={0.50} />
              <MetricChip label="口位置" value={record.goldenRatio.mouthPosition.toFixed(3)} ref_={0.75} />
            </div>
          </Section>

          {/* Before/after summary */}
          {record.beforeAfter && (
            <Section title="Before / After">
              <ul className="space-y-1">
                {record.beforeAfter.changeSummary.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <span className="text-xs text-stone-600">{s}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Face yoga plan */}
          {record.faceYogaPlan && record.faceYogaPlan.recommendedExercises.length > 0 && (
            <Section title="実施した顔ヨガ">
              <div className="space-y-2">
                {record.faceYogaPlan.recommendedExercises.map((ex, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Activity className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-stone-600 font-medium">{ex.title}</p>
                      <p className="text-[10px] text-stone-400">{ex.targetArea} · {ex.durationOrRepetitions}</p>
                    </div>
                  </div>
                ))}
                {record.faceYogaPlan.selectedConditions.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[10px] text-stone-400 mb-1">実施前の顔コンディション</p>
                    <div className="flex flex-wrap gap-1">
                      {record.faceYogaPlan.selectedConditions.map((c, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {record.faceYogaPlan.completed && (
                  <p className="text-[10px] text-emerald-600 font-medium">実施済み</p>
                )}
                {record.faceYogaPlan.userNote && (
                  <div className="pt-1">
                    <p className="text-[10px] text-stone-400 mb-0.5">実施後のメモ</p>
                    <p className="text-xs text-stone-600">{record.faceYogaPlan.userNote}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Note */}
          {record.note && (
            <Section title="メモ">
              <p className="text-xs text-stone-500">{record.note}</p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-stone-400 tracking-widest uppercase mb-2">{title}</p>
      {children}
    </div>
  );
}

function MetricChip({ label, value, ref_ }: { label: string; value: string; ref_: number }) {
  const diff = Math.abs(parseFloat(value) - ref_);
  const close = diff < 0.05;
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${close ? 'bg-emerald-50/40 border-emerald-100' : 'bg-stone-50 border-stone-100'}`}>
      <p className="text-[9px] text-stone-400 tracking-wide">{label}</p>
      <p className="text-sm font-bold text-stone-700 mt-0.5">{value}</p>
      <p className="text-[9px] text-stone-300">参考 {ref_}</p>
    </div>
  );
}
