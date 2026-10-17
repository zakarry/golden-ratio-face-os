// 寄せ方（本人 → 目標）
// 本人の設計図と目標（黄金比、または「似ている人」の設計図）から、
//   似ているところ／近づけるところ／判断が要るところ／追わないところ
// を指標ごとに判定し、処方表の技法と強さをつけ、文章にする。
// 生成AIは使わない。数値→判定→技法→文章がすべて決まった計算で出る（AIメイクの計算層）。
//
// 逆三角形（両目と口）を分析の中心に置く：
//   底辺 = 目間距離（顔幅比）、高さ = 目→口の距離（顔幅比）。どちらも額（生え際）の推定に依存しない。
//   理想の高さ = 顔高の36%（2025ファイナリスト28名の平均と一致。「目0.50・口0.75」から出る0.40は実在しないので使わない）

import { SMARTPHONE_CORRECTIONS, SMARTPHONE_NOTE, type PilotMetrics, type MetricId } from './targetCard';
import { TECHNIQUES, STRENGTH_LABEL, type Strength, type Technique } from './prescription';

/** 寄せ方で見る指標（12指標のうち額に依存しないもの＋三角形） */
export type YoseMetricId = 'eyeDist' | 'triH' | 'eyeWidth' | 'eyeAngle' | 'pupilPos' | 'philtrum' | 'midlow';

export interface YoseMetricDef {
  id: YoseMetricId;
  label: string;
  /** 許容幅（校正前の初期値。撮り直しのぶれ実測：目間±0.010、目幅±0.002、人中±0.013、角度±3.7°） */
  tolerance: number;
  unit: '' | '°';
  /** 値が増える方向のラベル / 減る方向のラベル */
  dirUp: string;
  dirDown: string;
  /** 技法を引くときの (metric, direction) の組。triH・midlow は複数の指標の技法を束ねる */
  techKeysUp: [MetricId, string][];
  techKeysDown: [MetricId, string][];
}

export const YOSE_METRICS: YoseMetricDef[] = [
  { id: 'eyeDist',  label: '目間距離（三角の底辺）', tolerance: 0.015, unit: '',  dirUp: '外へ', dirDown: '内へ',
    techKeysUp: [['eyeDist', '外へ']], techKeysDown: [['eyeDist', '内へ']] },
  { id: 'triH',     label: '目→口の高さ（三角の高さ）', tolerance: 0.02, unit: '', dirUp: '口を下げる', dirDown: '口を上げる・人中を短く',
    techKeysUp: [['lipY', '下げる']], techKeysDown: [['lipY', '上げる'], ['noseY', '上げる']] },
  { id: 'eyeWidth', label: '目幅', tolerance: 0.015, unit: '', dirUp: '大きく', dirDown: '小さく',
    techKeysUp: [['eyeWidth', '大きく']], techKeysDown: [['eyeWidth', '小さく']] },
  { id: 'eyeAngle', label: '目の角度', tolerance: 4, unit: '°', dirUp: '上げる', dirDown: '下げる',
    techKeysUp: [['eyeAngle', '上げる']], techKeysDown: [['eyeAngle', '下げる']] },
  { id: 'pupilPos', label: '黒目の位置', tolerance: 0.05, unit: '', dirUp: '外へ', dirDown: '内へ',
    techKeysUp: [['pupilPos', '外へ']], techKeysDown: [['pupilPos', '内へ']] },
  { id: 'philtrum', label: '人中比', tolerance: 0.04, unit: '', dirUp: '長く見せる', dirDown: '短く見せる',
    techKeysUp: [['philtrum', '長く見せる']], techKeysDown: [['philtrum', '短く見せる']] },
  { id: 'midlow',   label: '中顔面÷下顔面', tolerance: 0.10, unit: '', dirUp: '中顔面を長く', dirDown: '中顔面を短く・下顔面を長く',
    techKeysUp: [['zone2', '長く見せる'], ['zone3', '短く見せる']], techKeysDown: [['zone2', '短く見せる'], ['zone3', '長く見せる']] },
];

export interface YoseValues extends Record<YoseMetricId, number> {}

/** スマホ撮影（パイロットの記録）で理想と比べるときの補正 */
export const SMARTPHONE_YOSE_CORRECTION: Partial<Record<YoseMetricId, number>> = { eyeDist: SMARTPHONE_CORRECTIONS.eyeDist };

/** 12指標から寄せ方用の7値を作る。triH と midlow は額に依存しない（H が約分で消える） */
export function deriveYoseValues(m: PilotMetrics): YoseValues {
  return {
    eyeDist: m.eyeDist,
    triH: (m.lipY - m.eyeY) * m.faceRatio,
    eyeWidth: m.eyeWidth,
    eyeAngle: m.eyeAngle,
    pupilPos: m.pupilPos,
    philtrum: m.philtrum,
    midlow: m.zone3 > 0 ? m.zone2 / m.zone3 : 1,
  };
}

/** 黄金比の目標値（triH は本人の顔高に対して36%） */
export function idealYoseValues(self: PilotMetrics): YoseValues {
  return { eyeDist: 0.46, triH: 0.36 * self.faceRatio, eyeWidth: 0.20, eyeAngle: 7.5, pupilPos: 0.5, philtrum: 1 / 3, midlow: 1 };
}

export type YoseRelation =
  | 'same'            // 似ている（許容幅内）→ 触らない
  | 'agree'           // 目標へ寄せる方向が黄金比とも一致 → 一番強い根拠
  | 'conflict'        // 目標へ寄せると黄金比から離れる → 打ち合わせで判断
  | 'keep';           // 本人は黄金比内で目標がずれている → 追わない

export interface YoseRow {
  id: YoseMetricId;
  label: string;
  self: number;
  target: number;
  ideal: number;
  /** target − self */
  gap: number;
  tolerance: number;
  unit: '' | '°';
  /** |gap| / tolerance */
  ratio: number;
  relation: YoseRelation;
  /** 寄せる方向の言葉（same のときは '' ） */
  direction: string;
  strength: Strength | null;
  techniques: Technique[];
}

export interface YoseResult {
  subjectCode: string;
  targetName: string;
  /** 'ideal' = 黄金比のみ、それ以外は参照人物の kind */
  targetKind: 'ideal' | 'self_happy' | 'others_say' | 'dislike' | 'staff_say';
  rows: YoseRow[];
  triangle: { self: Tri; target: Tri; ideal: Tri };
  text: string;
  /** 計算の設定（校正で変わるので保存しておく） */
  config: { tolerances: Record<YoseMetricId, number>; strengthRule: string; version: string; selfCorrection?: Partial<Record<YoseMetricId, number>>; purpose?: YosePurpose };
}

export interface Tri { base: number; height: number; shape: number }

// 2026-10-13：目幅の理想 0.25→0.20、スマホ補正（目間距離 −0.014）を理想との比較に追加
// 2026-10-13b：中顔面÷下顔面・人中比・目→口の高さを「下顔面」として1件にまとめる（文章・束ね表）
// 2026-10-17：目的（宣材／舞台／日常）を config に持ち、近づける項目がないときの文を目的で変える
export const YOSEKATA_VERSION = 'yosekata-2026-10-17';

/** 目的。パイロット（ミス・ワールドの公式写真）の既定は「宣材」 */
export type YosePurpose = '宣材' | '舞台' | '日常';
export const YOSE_PURPOSES: YosePurpose[] = ['宣材', '舞台', '日常'];
export const PILOT_PURPOSE: YosePurpose = '宣材';

/** 強さの規則（仮）：差が許容幅の2倍まで弱、3倍まで標準、それ以上は強。打ち合わせで直す前提 */
export function strengthFromRatio(ratio: number): Strength {
  return ratio <= 2 ? 'weak' : ratio <= 3 ? 'standard' : 'strong';
}

export interface YoseOptions {
  /** 見る指標を絞る（ブランド別：AVANCE なら目の指標だけ） */
  metrics?: YoseMetricId[];
  /** 技法を絞る（ブランド別：id の集合。未指定なら処方表の全技法） */
  techniqueIds?: Set<string>;
  tolerances?: Partial<Record<YoseMetricId, number>>;
  /** 本人の値を理想と比べるときだけ足す補正（スマホ撮影の目間距離 −0.014 など）。参照人物との差には入れない */
  selfCorrection?: Partial<Record<YoseMetricId, number>>;
  /** 目的（宣材／舞台／日常）。形（位置・大きさ・角度）の判定には使わず、強度と言葉だけを変える */
  purpose?: YosePurpose;
}

export function buildYosekata(
  subjectCode: string,
  self: PilotMetrics,
  target: { name: string; kind: YoseResult['targetKind']; metrics: PilotMetrics | null },
  opts: YoseOptions = {},
): YoseResult {
  const raw = deriveYoseValues(self);
  const corr = opts.selfCorrection ?? {};
  // 理想と比べる本人の値（補正つき）。三角の底辺＝目間距離なので triH は補正しない
  const sIdeal = { ...raw } as YoseValues;
  for (const k of Object.keys(corr) as YoseMetricId[]) sIdeal[k] = raw[k] + (corr[k] ?? 0);
  const ideal = idealYoseValues(self);
  const isIdeal = !target.metrics;
  const s = isIdeal ? sIdeal : raw;
  const t = target.metrics ? deriveYoseValues(target.metrics) : ideal;
  const defs = YOSE_METRICS.filter(d => !opts.metrics || opts.metrics.includes(d.id));
  const tolerances = {} as Record<YoseMetricId, number>;

  const rows: YoseRow[] = defs.map(def => {
    const tol = opts.tolerances?.[def.id] ?? def.tolerance;
    tolerances[def.id] = tol;
    const gap = t[def.id] - s[def.id];
    const gi = ideal[def.id] - sIdeal[def.id];
    const same = Math.abs(gap) <= tol;
    let relation: YoseRelation;
    if (same) relation = 'same';
    else if (Math.abs(gi) <= tol) relation = 'keep';
    else if ((gi > 0) === (gap > 0)) relation = 'agree';
    else relation = 'conflict';
    const direction = same ? '' : (gap > 0 ? def.dirUp : def.dirDown);
    const keys = same ? [] : (gap > 0 ? def.techKeysUp : def.techKeysDown);
    const techniques = keys.flatMap(([m, d]) => TECHNIQUES.filter(x => x.metric === m && x.direction === d))
      .filter(x => !opts.techniqueIds || opts.techniqueIds.has(x.id));
    const ratio = Math.abs(gap) / tol;
    return { id: def.id, label: def.label, self: s[def.id], target: t[def.id], ideal: ideal[def.id], gap, tolerance: tol, unit: def.unit,
      ratio, relation, direction, strength: same ? null : strengthFromRatio(ratio), techniques };
  });

  const tri = (v: YoseValues): Tri => ({ base: v.eyeDist, height: v.triH, shape: v.triH / v.eyeDist });
  const result: YoseResult = {
    subjectCode, targetName: target.name, targetKind: target.kind, rows,
    triangle: { self: tri(s), target: tri(t), ideal: tri(ideal) },
    // 黄金比が目標のときの本人の値は補正つき
    text: '',
    config: { tolerances, strengthRule: '≤2倍=弱, ≤3倍=標準, >3倍=強（仮）', version: YOSEKATA_VERSION, ...(Object.keys(corr).length ? { selfCorrection: corr } : {}), ...(opts.purpose ? { purpose: opts.purpose } : {}) },
  };
  result.text = yosekataToText(result);
  return result;
}

const KIND_LABEL: Record<YoseResult['targetKind'], string> = { ideal: '黄金比', self_happy: '言われると嬉しい人', others_say: '周りが言う人', dislike: '言われて嫌だった人', staff_say: '運営が見る人' };

function fmt(v: number, unit: '' | '°') { return unit === '°' ? `${v.toFixed(1)}°` : v.toFixed(2); }
function fmtGap(v: number, unit: '' | '°') { return unit === '°' ? `${v > 0 ? '+' : ''}${v.toFixed(1)}°` : `${v > 0 ? '+' : ''}${v.toFixed(3)}`; }

/**
 * 下顔面：中顔面÷下顔面・人中比・目→口の高さは、どれも「鼻から下で口が下寄り（または顎が短い）」と同時に動くので、
 * 別々に数えると同じことを3回数えてしまう。近づけるところでは1件にまとめ、技法は重ねずに1回ずつ。
 */
export const LOWER_FACE_IDS: YoseMetricId[] = ['midlow', 'philtrum', 'triH'];
export const LOWER_FACE_LABEL = '下顔面';

export interface YoseAgreeItem {
  /** 指標の id、または 'lower'（下顔面のまとめ） */
  key: YoseMetricId | 'lower';
  label: string;
  rows: YoseRow[];
  /** まとめの強さ＝いちばん大きくずれている指標の強さ */
  strength: Strength;
  ratio: number;
  /** 重なりを除いた技法 */
  techniques: Technique[];
}

/** 近づけるところ（agree）を、下顔面の3指標だけ1件にまとめて返す。大きい順 */
export function groupAgreeRows(rows: YoseRow[]): YoseAgreeItem[] {
  const agree = rows.filter(x => x.relation === 'agree');
  const lower = agree.filter(x => LOWER_FACE_IDS.includes(x.id));
  const items: YoseAgreeItem[] = agree.filter(x => !LOWER_FACE_IDS.includes(x.id))
    .map(x => ({ key: x.id, label: x.label, rows: [x], strength: x.strength!, ratio: x.ratio, techniques: x.techniques }));
  if (lower.length) {
    const top = lower.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    const techniques = Array.from(new Map(lower.flatMap(x => x.techniques).map(t => [t.id, t])).values());
    items.push({ key: 'lower', label: LOWER_FACE_LABEL, rows: [...lower].sort((a, b) => b.ratio - a.ratio), strength: top.strength!, ratio: top.ratio, techniques });
  }
  return items.sort((a, b) => b.ratio - a.ratio);
}

/** 文章化。すべて rows から機械的に出す（言葉を足さない） */
export function yosekataToText(r: YoseResult): string {
  const L: string[] = [];
  const tn = r.targetKind === 'ideal' ? '黄金比' : r.targetName;
  L.push(`【${r.subjectCode} → ${tn}（${KIND_LABEL[r.targetKind]}）】`);
  const same = r.rows.filter(x => x.relation === 'same');
  const agree = r.rows.filter(x => x.relation === 'agree');
  const conflict = r.rows.filter(x => x.relation === 'conflict');
  const keep = r.rows.filter(x => x.relation === 'keep');
  const tri = r.triangle;
  L.push(`逆三角形：本人 底辺${tri.self.base.toFixed(2)}・高さ${tri.self.height.toFixed(2)}・形${tri.self.shape.toFixed(2)}／${tn} 底辺${tri.target.base.toFixed(2)}・高さ${tri.target.height.toFixed(2)}・形${tri.target.shape.toFixed(2)}`);
  if (same.length) L.push('似ているところ：' + same.map(x => `${x.label}（本人${fmt(x.self, x.unit)} / ${tn}${fmt(x.target, x.unit)}）`).join('、') + '。ここは触らない。');
  if (agree.length) {
    L.push(r.targetKind === 'ideal' ? '近づけるところ：' : '近づけるところ（黄金比も同じ方向）：');
    for (const g of groupAgreeRows(r.rows)) {
      const tech = g.techniques.length ? g.techniques.map(y => y.name).join('／') : '処方表に技法なし';
      if (g.key !== 'lower') {
        const x = g.rows[0];
        L.push(`　・${x.label}を${x.direction}　差${fmtGap(x.gap, x.unit)}（許容幅の${x.ratio.toFixed(1)}倍→${STRENGTH_LABEL[x.strength!]}）　技法：${tech}`);
        continue;
      }
      L.push(`　・${LOWER_FACE_LABEL}（${g.rows.map(x => x.label.replace(/（.*?）/g, '')).join('・')}をまとめて1件）→${STRENGTH_LABEL[g.strength]}`);
      for (const x of g.rows) L.push(`　　${x.label}を${x.direction}　差${fmtGap(x.gap, x.unit)}（許容幅の${x.ratio.toFixed(1)}倍）`);
      L.push(`　　技法：${tech}`);
    }
  }
  if (conflict.length) {
    L.push('判断が要るところ（寄せると黄金比から離れる）：');
    for (const x of conflict) L.push(`　・${x.label}を${x.direction}　差${fmtGap(x.gap, x.unit)}　→寄せるか、黄金比を優先するか打ち合わせで決める`);
  }
  if (keep.length) L.push('追わないところ（本人の方が黄金比に近い）：' + keep.map(x => x.label).join('、'));
  if (!agree.length && !conflict.length) {
    L.push('近づける項目はない。配置はすでに揃っている。');
    // 宣材は写真で弱く見えないよう、形は触らずに強度だけ上げる（位置・大きさ・角度の指示は出さない）
    if (r.config.purpose === '宣材') L.push('形は触らず、目・眉・唇の強度を標準以上に上げる（宣材）。');
  }
  if (r.config.purpose) L.push(`目的：${r.config.purpose}`);
  if (r.config.selfCorrection?.eyeDist) L.push(`※目間距離は${SMARTPHONE_NOTE}を入れて黄金比と比べている`);
  return L.join('\n');
}

/** 目標が複数あるとき：指標ごとに「全員同じ方向」「割れる」をまとめる（打ち合わせ用の一覧） */
export interface YoseSummaryRow {
  id: YoseMetricId; label: string;
  /** 目標名 → 方向（'' は似ている） */
  byTarget: Record<string, string>;
  verdict: '全員が似ている' | '全員同じ方向' | '割れる' | '追わない';
  direction: string;
}
export function summarizeYosekata(results: YoseResult[]): YoseSummaryRow[] {
  const ids = results[0]?.rows.map(r => r.id) ?? [];
  return ids.map(id => {
    const byTarget: Record<string, string> = {};
    const rels: string[] = [];
    for (const r of results) { const row = r.rows.find(x => x.id === id)!; rels.push(row.relation); byTarget[r.targetName] = row.relation === 'same' ? '' : (row.relation === 'keep' ? '追わない' : row.direction); }
    const dirs = Array.from(new Set(Object.values(byTarget).filter(v => v && v !== '追わない')));
    const label = results[0].rows.find(x => x.id === id)!.label;
    if (rels.every(x => x === 'same')) return { id, label, byTarget, verdict: '全員が似ている', direction: '' };
    if (rels.every(x => x === 'same' || x === 'keep')) return { id, label, byTarget, verdict: '追わない', direction: '' };
    if (dirs.length === 1 && Object.values(byTarget).every(Boolean)) return { id, label, byTarget, verdict: '全員同じ方向', direction: dirs[0] };
    return { id, label, byTarget, verdict: '割れる', direction: dirs.join('／') };
  });
}

/** ブランド設定の例（全方位が基本、部分特化は例外） */
export const BRAND_YOSE_PRESETS: Record<string, YoseOptions> = {
  missworld: {},                                                   // 全指標・全技法
  avance:    { metrics: ['eyeDist', 'eyeWidth', 'eyeAngle', 'pupilPos'] },  // 目だけ（技法は目の指標の行だけが引かれる）
};
