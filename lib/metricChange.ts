// メイク前→後の要約。12指標それぞれの差が許容幅（targetCard の tolerance）以下なら撮り方のぶれとみなして出さない。
// 超えた指標だけ「黄金比に近づいた／離れた」を出す。全部が許容幅以下なら「変化なし（撮り方の範囲内）」。

import type { DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics, METRIC_DEFS, type PilotMetrics } from '@/lib/pilot/targetCard';

export const NO_CHANGE_TEXT = '変化なし（撮り方の範囲内）';

export function metricChangeSummary(before: PilotMetrics, after: PilotMetrics): string[] {
  const lines = METRIC_DEFS.flatMap(def => {
    const b = before[def.id], a = after[def.id];
    if (typeof b !== 'number' || typeof a !== 'number' || Math.abs(a - b) <= def.tolerance) return [];
    const change = Math.abs(b - def.ideal) - Math.abs(a - def.ideal); // 正 = 黄金比に近づいた
    const amount = def.unit === '°' ? `${Math.abs(a - b).toFixed(1)}°` : Math.abs(a - b).toFixed(3);
    return [`${def.label.replace(/（.*?）/g, '')}：黄金比に${change > 0 ? '近づいた' : '離れた'}（${amount}）`];
  });
  return lines.length ? lines : [NO_CHANGE_TEXT];
}

/** 設計図2枚から。どちらかに画像サイズが無ければ null */
export function metricChangeSummaryFromGuides(before: DetectedGuide | null | undefined, after: DetectedGuide | null | undefined): string[] | null {
  if (!before?.imageWidth || !before.imageHeight || !after?.imageWidth || !after.imageHeight) return null;
  return metricChangeSummary(
    computePilotMetrics(before, before.imageWidth, before.imageHeight),
    computePilotMetrics(after, after.imageWidth, after.imageHeight),
  );
}
