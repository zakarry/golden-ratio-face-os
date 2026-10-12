// 「強み」＝寄せ方（黄金比が目標）で範囲内（許容幅の中）に入った指標。固定文は使わない。

import type { PilotMetrics } from './targetCard';
import { buildYosekata } from './yosekata';

export function yoseStrengths(m: PilotMetrics | Record<string, number> | null | undefined): string[] {
  if (!m) return [];
  return buildYosekata('', m as PilotMetrics, { name: '黄金比', kind: 'ideal', metrics: null })
    .rows.filter(r => r.relation === 'same').map(r => r.label);
}
