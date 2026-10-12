// 「強み」＝寄せ方（黄金比が目標）で範囲内（許容幅の中）に入った指標。固定文は使わない。

import type { PilotMetrics } from './targetCard';
import { buildYosekata, SMARTPHONE_YOSE_CORRECTION } from './yosekata';

/** smartphone：スマホ撮影（パイロットの記録）なら目間距離に −0.014 の補正を入れて黄金比と比べる */
export function yoseStrengths(m: PilotMetrics | Record<string, number> | null | undefined, opts: { smartphone?: boolean } = {}): string[] {
  if (!m) return [];
  return buildYosekata('', m as PilotMetrics, { name: '黄金比', kind: 'ideal', metrics: null }, opts.smartphone ? { selfCorrection: SMARTPHONE_YOSE_CORRECTION } : {})
    .rows.filter(r => r.relation === 'same').map(r => r.label);
}
