'use client';

// 本人と「似ている人」の比較（運営ページと参加者ページで共通）
// 数字の表（compareMetrics）と、逆三角形の重ね描き（本人＝黒、その人＝青、黄金比＝赤点線）。

import React from 'react';
import { compareMetrics } from '@/lib/pilot/referenceMeasure';
import { formatMetric, type PilotMetrics } from '@/lib/pilot/targetCard';
import { buildYosekata, type Tri, type YoseResult } from '@/lib/pilot/yosekata';

export const TRI_COLOR = { self: '#1c1917', target: '#2563eb', ideal: '#dc2626' };

/** 本人とその人の数字を並べた表（差＝本人−その人）。selfLabel は「本人」「あなた」など */
export function CompareTable({ subject, ref_, selfLabel = '本人', otherLabel = 'この人' }: { subject: PilotMetrics | null; ref_: PilotMetrics; selfLabel?: string; otherLabel?: string }) {
  if (!subject) {
    return <p className="text-xs text-stone-500">{selfLabel}の「メイク前」の写真がまだないので、比較できません。</p>;
  }
  const rows = compareMetrics(subject, ref_);
  return (
    <table className="w-full text-xs bg-white rounded-lg">
      <thead><tr className="text-stone-400 text-[10px]"><th className="text-left py-1 px-2">指標</th><th className="text-right px-2">{selfLabel}</th><th className="text-right px-2">{otherLabel}</th><th className="text-right px-2">差</th><th className="text-right px-2">黄金比</th></tr></thead>
      <tbody>{rows.map(r => (
        <tr key={r.id} className={`border-t border-stone-100 ${r.close ? 'text-emerald-700' : 'text-stone-700'}`}>
          <td className="py-1 px-2">{r.label}{r.forehead && <span className="text-[9px] text-stone-400 ml-1">額推定</span>}</td>
          <td className="text-right px-2 tabular-nums">{formatMetric(r.subject, r.unit)}</td>
          <td className="text-right px-2 tabular-nums">{formatMetric(r.ref, r.unit)}</td>
          <td className="text-right px-2 tabular-nums">{(r.diff >= 0 ? '+' : '') + formatMetric(r.diff, r.unit)}</td>
          <td className="text-right px-2 tabular-nums text-stone-400">{formatMetric(r.ideal, r.unit)}</td>
        </tr>
      ))}</tbody>
      <tfoot><tr><td colSpan={5} className="px-2 py-1 text-[10px] text-stone-400">緑＝{selfLabel}と{otherLabel}がほぼ同じ（差が 0.02 以内、角度は 2° 以内）</td></tr></tfoot>
    </table>
  );
}

export function TriangleLegend({ selfLabel = '本人', targetLabel, showTarget }: { selfLabel?: string; targetLabel: string; showTarget: boolean }) {
  return (
    <p className="text-[10px] text-stone-500 flex gap-3 flex-wrap">
      <span><span style={{ color: TRI_COLOR.self }}>━</span> {selfLabel}</span>
      {showTarget && <span><span style={{ color: TRI_COLOR.target }}>━</span> {targetLabel}</span>}
      <span><span style={{ color: TRI_COLOR.ideal }}>┅</span> 黄金比</span>
    </p>
  );
}

/** 両目と口の逆三角形。底辺の中点と目の高さを揃えて重ねる（単位は顔幅） */
export function TriangleSvg({ tri, showTarget }: { tri: YoseResult['triangle']; showTarget: boolean }) {
  const S = 300, W = 0.7 * S, H = Math.max(tri.self.height, tri.target.height, tri.ideal.height) * S + 30;
  const pts = (t: Tri) => `${W / 2 - t.base / 2 * S},15 ${W / 2 + t.base / 2 * S},15 ${W / 2},${15 + t.height * S}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="bg-stone-50 rounded-lg max-w-full h-auto">
      <line x1={0} x2={W} y1={15} y2={15} stroke="#e7e5e4" />
      <polygon points={pts(tri.ideal)} fill="none" stroke={TRI_COLOR.ideal} strokeWidth={1.5} strokeDasharray="4 3" />
      {showTarget && <polygon points={pts(tri.target)} fill="none" stroke={TRI_COLOR.target} strokeWidth={2} />}
      <polygon points={pts(tri.self)} fill="none" stroke={TRI_COLOR.self} strokeWidth={2} />
      <circle cx={W / 2} cy={15} r={2.5} fill={TRI_COLOR.self} />
    </svg>
  );
}

/** 本人とその人の三角形（判定や技法は出さない、見比べるだけ） */
export function RefTriangle({ subject, ref_, selfLabel, targetLabel }: { subject: PilotMetrics; ref_: PilotMetrics; selfLabel: string; targetLabel: string }) {
  const tri = buildYosekata('', subject, { name: targetLabel, kind: 'self_happy', metrics: ref_ }).triangle;
  return (
    <div className="space-y-1">
      <TriangleSvg tri={tri} showTarget />
      <TriangleLegend selfLabel={selfLabel} targetLabel={targetLabel} showTarget />
    </div>
  );
}
