// Face Designer の①②③（と④ブランドの Face Rule）を、寄せ方の計算（lib/pilot/yosekata.ts）から組み立てる。
// 固定文の出し分けではなく、利用者の設計図から毎回計算する。技法と量は処方表（prescription.ts）からだけ引く。

import type { DetectedGuide } from '@/lib/faceLandmarks';
import { computePilotMetrics } from '@/lib/pilot/targetCard';
import { STRENGTH_LABEL } from '@/lib/pilot/prescription';
import { buildYosekata, BRAND_YOSE_PRESETS, type YoseResult, type YoseRow } from '@/lib/pilot/yosekata';
import type { FaceDesignerProviderId, FaceDesignerReviewSection, YosekataKarte } from '@/types/karte';

/** Face Designer の provider → 寄せ方のブランド設定 */
const PROVIDER_PRESET: Partial<Record<FaceDesignerProviderId, keyof typeof BRAND_YOSE_PRESETS>> = {
  avance: 'avance',
  miss_world: 'missworld',
};

const SUBJECT = 'あなた';

function toKarte(r: YoseResult, providerId?: FaceDesignerProviderId): YosekataKarte {
  return { targetName: r.targetName, rows: r.rows, triangle: r.triangle, text: r.text, config: r.config, ...(providerId ? { providerId } : {}) };
}

/** 黄金比を目標にした寄せ方。画像サイズが取れない古い guide では null */
export function buildIdealYosekata(guide: DetectedGuide, opts: { providerId?: FaceDesignerProviderId } = {}): YoseResult | null {
  if (!guide.imageWidth || !guide.imageHeight) return null;
  const metrics = computePilotMetrics(guide, guide.imageWidth, guide.imageHeight);
  const presetKey = opts.providerId ? PROVIDER_PRESET[opts.providerId] : undefined;
  return buildYosekata(SUBJECT, metrics, { name: '黄金比', kind: 'ideal', metrics: null }, presetKey ? BRAND_YOSE_PRESETS[presetKey] : {});
}

const fv = (x: YoseRow, v: number) => x.unit === '°' ? `${v.toFixed(1)}°` : v.toFixed(2);

/** ①②③：すべて rows から機械的に作る（言葉を足さない） */
export function yosekataSections(r: YoseResult): FaceDesignerReviewSection[] {
  const same = r.rows.filter(x => x.relation === 'same');
  const agree = r.rows.filter(x => x.relation === 'agree' || x.relation === 'conflict').sort((a, b) => b.ratio - a.ratio);
  const t = r.triangle;

  const s1 = same.length
    ? same.map(x => `・${x.label}（${SUBJECT}${fv(x, x.self)} / 黄金比${fv(x, x.ideal)}）`).join('\n') + '\nここは触らない。'
    : '黄金比の許容幅に入っている項目はない。';

  const s2 = [
    `逆三角形：${SUBJECT} 底辺${t.self.base.toFixed(2)}・高さ${t.self.height.toFixed(2)}／黄金比 底辺${t.ideal.base.toFixed(2)}・高さ${t.ideal.height.toFixed(2)}`,
    ...(agree.length
      ? agree.map(x => `・${x.label}を${x.direction}（許容幅の${x.ratio.toFixed(1)}倍→${STRENGTH_LABEL[x.strength!]}）`)
      : ['近づける項目はない。配置はすでに揃っている。']),
  ].join('\n');

  const s3 = agree.length
    ? agree.flatMap(x => x.techniques.length
        ? x.techniques.map(tq => `・${tq.name}：${tq.where}／${STRENGTH_LABEL[x.strength!]}＝${tq.amount[x.strength!]}`)
        : [`・${x.label}：処方表に技法なし`]).join('\n')
    : '今の配置を保つ。';

  return [
    { number: '①', title: '黄金比に近いところ（触らない）', body: s1 },
    { number: '②', title: '黄金比へ近づけるところ', body: s2 },
    { number: '③', title: '使う技法と量', body: s3 },
  ];
}

/**
 * Face Designer のコメント用。①②③＝黄金比（全指標）、④＝ブランド設定があれば同じ計算をブランドの絞り込みで通したもの。
 * guide から計算できなければ null（呼び出し側で従来の文に戻す）
 */
export function buildDesignerYosekata(guide: DetectedGuide | null, providerId: FaceDesignerProviderId) {
  if (!guide) return null;
  const ideal = buildIdealYosekata(guide);
  if (!ideal) return null;
  const brand = PROVIDER_PRESET[providerId] && providerId !== 'miss_world' ? buildIdealYosekata(guide, { providerId }) : null;
  return {
    sections: yosekataSections(ideal),
    ideal: toKarte(ideal),
    brand: brand ? toKarte(brand, providerId) : undefined,
  };
}
