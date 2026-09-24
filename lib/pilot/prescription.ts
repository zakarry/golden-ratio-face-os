// 処方（5. メイク提案）
// 目標カードの「修正対象」の指標と方向から、処方表（第0.1版）の技法を「標準」の量で出す。
// 量はすべて本人の顔の単位（目幅・黒目・眉の毛）。mm・%は使わない。
// 三段階：まず標準、8. 検証で足りなければ次回は強へ。

import type { MetricId, TargetCard, TargetItem } from './targetCard';

export type Strength = 'weak' | 'standard' | 'strong';
export const STRENGTH_LABEL: Record<Strength, string> = { weak: '弱', standard: '標準', strong: '強' };

/** メイクの手順（1ベース→2シェーディング→3眉→4目→5唇→6ヘア） */
export const STEP_LABEL: Record<number, string> = { 1: 'ベース', 2: 'シェーディング', 3: '眉', 4: '目', 5: '唇', 6: 'ヘア' };

export interface Technique {
  id: string;
  metric: MetricId;
  /** どの方向のときに使うか（targetCard の direction と一致） */
  direction: string;
  name: string;
  /** ランドマーク基準の位置 */
  where: string;
  amount: Record<Strength, string>;
  color: string;
  step: number;
  /** 錯覚メークの原則 ①〜⑦ */
  principles: string;
  caution: string;
}

export const TECHNIQUES: Technique[] = [
  // ── 目間距離 外へ（求心）
  { id: 'eyeline-ext', metric: 'eyeDist', direction: '外へ', name: 'アイラインを目尻へ延長', where: '上まぶたのライン。目尻の点から外へ、目の角度の延長線上',
    amount: { weak: '目尻から目幅の1割', standard: '目幅の2割', strong: '目幅の3割' }, color: '瞼の裏の色に近い茶・ボルドー系。黒は使わない', step: 4, principles: '③⑦', caution: '上下を一周囲まない。延長線を跳ね上げない' },
  { id: 'iris-outer-point', metric: 'eyeDist', direction: '外へ', name: '黒目の外側に濃いポイント', where: '上まぶた、黒目の外縁のすぐ外側',
    amount: { weak: '黒目の半分の幅', standard: '黒目1つ分の幅', strong: '黒目1.5個分、目尻へつなげる' }, color: '締め色（瞼の裏の色を深くした色）', step: 4, principles: '①⑦', caution: '黒目の真上に置かない' },
  { id: 'brow-tail', metric: 'eyeDist', direction: '外へ', name: '眉尻を外側までしっかり', where: '小鼻と目尻を結んだ延長線と眉の交点まで',
    amount: { weak: '延長線の交点まで', standard: '交点＋眉の毛2本分', strong: '交点＋眉の毛4本分' }, color: '髪色に合わせる（眉マスカラ）', step: 3, principles: '⑤⑦③', caution: '眉尻を下げすぎない' },
  { id: 'triangle-zone', metric: 'eyeDist', direction: '外へ', name: '三角ゾーンを埋める', where: '目尻側。アイラインの延長と涙袋の上端に挟まれた三角',
    amount: { weak: '小さいブラシで薄く1回', standard: '2回重ね（一度ティッシュオフしてから）', strong: '2回重ね＋目尻へ延長' }, color: 'マットの中間色。粘膜とアイライン直下には塗らない', step: 4, principles: '②⑦', caution: '広範囲に塗ると目が小さく見える' },
  { id: 'tear-bag-outer', metric: 'eyeDist', direction: '外へ', name: '涙袋を外寄りに', where: '下まぶた。膨らみの中心を黒目より外側に',
    amount: { weak: '黒目の中心の下', standard: '黒目の外縁の下', strong: '目尻寄り' }, color: '目の下の血色に近い色。白いパールは撮影時のみ', step: 4, principles: '③⑦', caution: '白すぎるとクマに見える' },
  { id: 'nose-shadow-outer', metric: 'eyeDist', direction: '外へ', name: 'ノーズシャドーを心もち外側に', where: '眉頭の下〜鼻筋の脇。通常より眼窩側に',
    amount: { weak: '眉頭下のくぼみだけ', standard: '眉頭下〜目頭の高さまで', strong: '眉頭下〜小鼻の上まで' }, color: '肌より1トーン暗い、赤みのないベージュ', step: 2, principles: '②⑦', caution: '線にしない。必ずぼかす' },
  // ── 目間距離 内へ（離れ目）
  { id: 'orbit-shadow', metric: 'eyeDist', direction: '内へ', name: '目の穴（眼窩）を意識したシャドー', where: 'アイホールの内側〜眉頭の下のくぼみ',
    amount: { weak: '眉頭下のくぼみだけ', standard: 'アイホールの内側半分', strong: '目頭側〜鼻根まで' }, color: '肌より1トーン暗いマット', step: 4, principles: '②⑦', caution: '目頭にラインを引かず、陰影で内側の重心を作る' },
  { id: 'eyeline-full', metric: 'eyeDist', direction: '内へ', name: 'アイラインを目頭までしっかり', where: '上まぶた全長',
    amount: { weak: '黒目の内縁から目尻まで', standard: '目頭まで', strong: '目頭をわずかに切開風に' }, color: '瞼の裏の色に近い濃色', step: 4, principles: '⑦③', caution: '目尻側を延ばさない' },
  { id: 'brow-head-in', metric: 'eyeDist', direction: '内へ', name: '眉頭を目の穴を意識して近づける', where: '眉頭。目頭の真上を目安に',
    amount: { weak: '眉の毛1〜2本分内へ', standard: '目頭の真上まで', strong: '目頭より内側' }, color: '髪色。眉頭は薄く', step: 3, principles: '⑦③', caution: '眉頭同士をつなげない' },
  { id: 'nose-shadow-narrow', metric: 'eyeDist', direction: '内へ', name: 'ノーズシャドーを鼻筋細めで濃いめに', where: '眉頭〜鼻筋の脇。幅を狭く',
    amount: { weak: '細く薄く', standard: '細く標準', strong: '細く濃く' }, color: '赤みのないベージュ〜グレージュ', step: 2, principles: '②⑦', caution: '幅を広げない' },
  // ── 目幅 大きく
  { id: 'lash-lift', metric: 'eyeWidth', direction: '大きく', name: 'まつ毛をしっかり上げて瞳に光を', where: '上まつ毛の根元から',
    amount: { weak: '上げるだけ', standard: '上げる＋マスカラ1度', strong: '上げる＋重ね塗り' }, color: '黒〜ダークブラウン', step: 4, principles: '④', caution: '束にしない' },
  { id: 'liner-center', metric: 'eyeWidth', direction: '大きく', name: 'アイライナーを黒目の上で最も太く', where: '上まぶた、黒目の上',
    amount: { weak: '黒目上を細く', standard: '黒目上を眉の毛1本分太く', strong: '黒目上を2本分太く' }, color: '瞼の裏の色に近い濃色', step: 4, principles: '③', caution: '一周囲まない' },
  { id: 'lower-lid-light', metric: 'eyeWidth', direction: '大きく', name: '下まぶたの際に明るい色', where: '下まぶたの粘膜〜下まつ毛の際',
    amount: { weak: '際に明るい色のみ', standard: '際に明るい色＋外側に淡い影', strong: '際に明るい色＋影を涙袋まで' }, color: '白ではなくベージュ寄りの明るい色', step: 4, principles: '②③', caution: '白いラインは不自然' },
  { id: 'double-lid', metric: 'eyeWidth', direction: '大きく', name: '二重を影で描く', where: '二重の線。目尻側から',
    amount: { weak: '目尻側1/3だけ', standard: '目尻〜黒目の上まで', strong: '全長' }, color: '瞼の裏の色（影の色）。線にせず面で', step: 4, principles: '①③', caution: '濃い茶・黒で線を引かない' },
  // ── 目の角度
  { id: 'angle-up', metric: 'eyeAngle', direction: '上げる', name: '上ラインを目尻でわずかに上げ、目尻上に締め色', where: '上まぶたの目尻側1/3',
    amount: { weak: '締め色のみ', standard: '締め色＋ラインを目尻で水平に止める', strong: '締め色＋ラインを眉の毛1本分上げる' }, color: '瞼の裏の色に近い濃色', step: 4, principles: '⑦', caution: '下まぶたの目尻側に濃い色を置かない' },
  { id: 'angle-down', metric: 'eyeAngle', direction: '下げる', name: '下ラインを目尻でわずかに下げ、目尻下にシャドー', where: '下まぶたの目尻側1/3',
    amount: { weak: '目尻下に影のみ', standard: '影＋下ラインを目尻で水平に', strong: '影＋下ラインをわずかに下向きに' }, color: '瞼の裏の色に近い茶', step: 4, principles: '⑦', caution: '上ラインを跳ね上げない' },
  // ── 左右差
  { id: 'level-fix', metric: 'eyeLevel', direction: '揃える', name: '小さい側・低い側だけ量を足す', where: '小さい側の目・低い側の眉',
    amount: { weak: 'ラインの太さだけ足す', standard: 'ライン＋まつ毛の量', strong: 'ライン＋まつ毛＋締め色の範囲' }, color: '反対側と同じ色', step: 4, principles: '⑥', caution: '大きい側を引かない。眉は低い方に高い方を合わせる' },
  // ── 黒目の位置
  { id: 'pupil-out', metric: 'pupilPos', direction: '外へ', name: '黒目の外側に濃いポイント（視線を外へ）', where: '上まぶた、黒目の外縁のすぐ外側',
    amount: { weak: '黒目の半分の幅', standard: '黒目1つ分', strong: '黒目1.5個分' }, color: '締め色', step: 4, principles: '①⑦', caution: '黒目の真上に置かない' },
  { id: 'pupil-in', metric: 'pupilPos', direction: '内へ', name: '目頭側に締め色（視線を内へ）', where: '上まぶた、黒目の内縁のすぐ内側',
    amount: { weak: '黒目の半分の幅', standard: '黒目1つ分', strong: '目頭まで' }, color: '締め色', step: 4, principles: '①⑦', caution: '目頭にラインは引かない' },
  // ── 顔の縦横比
  { id: 'jaw-shade', metric: 'faceRatio', direction: '縦長に見せる', name: 'エラ〜顎横のシェーディング', where: '耳下〜エラ〜顎のライン',
    amount: { weak: 'エラの角だけ', standard: 'エラ〜顎横', strong: '耳下〜顎先まで' }, color: '赤みのないベージュ', step: 2, principles: '②⑤', caution: '境目を残さない' },
  { id: 'cheek-vertical', metric: 'faceRatio', direction: '縦長に見せる', name: 'チークを縦長に', where: '頬骨の高い位置から斜め上へ',
    amount: { weak: '頬骨の上に小さく', standard: '斜め上へ縦長に', strong: 'こめかみ方向へ長く' }, color: '血色に近い色', step: 2, principles: '⑤', caution: '頬骨より下に入れない' },
  { id: 'inoge', metric: 'faceRatio', direction: '縦長に見せる', name: '命毛（触覚ヘア）で輪郭を額縁に', where: '前髪の横・もみあげ。顔のラインに沿って',
    amount: { weak: '細く数本', standard: '標準の束', strong: '長め・やや太め' }, color: '―', step: 6, principles: '⑤⑥', caution: '太すぎて顔を隠さない。外側に透け感を残す' },
  { id: 'cheek-horizontal', metric: 'faceRatio', direction: '横に広げる', name: 'チークを横長に、眉を平行気味に', where: '目の下〜頬の中心を水平に／眉',
    amount: { weak: 'チーク横長のみ', standard: '横長＋眉を平行気味', strong: '横長＋平行眉＋生え際・顎先を薄く影' }, color: '血色に近い色／髪色', step: 2, principles: '⑤', caution: '顎先の影は線にしない' },
  { id: 'tear-bag', metric: 'faceRatio', direction: '横に広げる', name: '涙袋（目が離れていたら外側に）', where: '下まぶた',
    amount: { weak: '中央', standard: '黒目の外縁の下', strong: '目尻寄り' }, color: '目の下の血色に近い色', step: 4, principles: '⑦', caution: '' },
  // ── 中顔面（眉〜鼻底）
  { id: 'nose-bridge', metric: 'zone2', direction: '短く見せる', name: '眉間のシャドーと鼻根のハイライト', where: '眉間〜鼻根。両脇に影、中央に光',
    amount: { weak: '影のみ', standard: '影＋鼻根に光', strong: '影＋鼻根〜鼻筋上部に光' }, color: '影：赤みのないベージュ／光：肌より半トーン明るい', step: 2, principles: '②①', caution: '光を鼻先まで一本に引かない' },
  { id: 'brow-lower', metric: 'zone2', direction: '短く見せる', name: '眉の下側を足して眉を下げる', where: '眉の下側',
    amount: { weak: '眉の毛1本分', standard: '2本分', strong: '3本分' }, color: '髪色', step: 3, principles: '②', caution: '上側は触らない' },
  { id: 'brow-upper', metric: 'zone2', direction: '長く見せる', name: '眉の上側を足して眉を上げる', where: '眉の上側',
    amount: { weak: '眉の毛1本分', standard: '2本分', strong: '3本分' }, color: '髪色', step: 3, principles: '②', caution: '下側は絶対に足さない' },
  // ── 下顔面（鼻底〜顎）
  { id: 'chin-shade', metric: 'zone3', direction: '短く見せる', name: '顎先を薄くシェーディング', where: '顎先の下面',
    amount: { weak: '顎の下面だけ薄く', standard: '顎の下面＋顎先の輪郭', strong: '顎の下面〜輪郭をしっかり' }, color: '赤みのないベージュ', step: 2, principles: '②', caution: '線にしない' },
  { id: 'chin-light', metric: 'zone3', direction: '長く見せる', name: '顎先にハイライト', where: '顎先',
    amount: { weak: '顎先に小さく', standard: '顎先〜唇下のくぼみに小さな影', strong: '顎先に光＋顎の下面に影' }, color: '肌より半トーン明るい', step: 2, principles: '②', caution: '' },
  // ── 人中
  { id: 'philtrum-short', metric: 'philtrum', direction: '短く見せる', name: '上唇の山を上に、山の上にハイライト', where: '上唇の山（キューピッドボウ）',
    amount: { weak: '山をはっきり描く', standard: '山を輪郭の内側で上へ毛1本分', strong: '上へ2本分＋山の上に光' }, color: '唇：粘膜の色に近い色', step: 5, principles: '②③', caution: '輪郭を外側に描きすぎない' },
  { id: 'philtrum-long', metric: 'philtrum', direction: '長く見せる', name: '上唇の輪郭を内側に、山を控えめに', where: '上唇の輪郭',
    amount: { weak: '輪郭ぴったり', standard: '上唇の輪郭を毛1本分内側に', strong: '内側＋マットで体積感を減らす' }, color: '肌色に近いヌーディ', step: 5, principles: '③④', caution: '' },
  // ── 目・鼻・口の位置（額推定に依存）
  { id: 'eye-lower', metric: 'eyeY', direction: '下げる', name: '涙袋と三角ゾーンで目の重心を下げる', where: '下まぶた〜目尻下',
    amount: { weak: '涙袋のみ', standard: '涙袋＋三角ゾーン', strong: '涙袋＋三角ゾーン＋下ライン' }, color: '目の下の血色に近い色', step: 4, principles: '②⑦', caution: '' },
  { id: 'eye-raise', metric: 'eyeY', direction: '上げる', name: '上まぶたに重心（締め色を上へ、眉を下げる）', where: 'アイホール上部・眉の下側',
    amount: { weak: '締め色を上へ', standard: '締め色を上へ＋眉の下側を毛1本分', strong: '＋眉の下側2本分' }, color: '締め色／髪色', step: 4, principles: '②', caution: '下まぶたに濃い色を置かない' },
  { id: 'nose-shorter', metric: 'noseY', direction: '上げる', name: 'ハイライトを鼻筋の中ほどで止め、鼻先の下面に影', where: '鼻根〜鼻筋中ほど／鼻柱の付け根',
    amount: { weak: '光を中ほどで止める', standard: '＋鼻柱の付け根に薄い影', strong: '＋眉頭を毛1本分下げる' }, color: '影：赤みのないベージュ／光：半トーン明るい', step: 2, principles: '②①', caution: '人中が長く見える副作用に注意' },
  { id: 'nose-longer', metric: 'noseY', direction: '下げる', name: 'ハイライトを鼻先まで通す', where: '鼻根〜鼻先',
    amount: { weak: '鼻筋2/3まで', standard: '鼻先まで', strong: '鼻先まで＋眉頭を上げ気味' }, color: '肌より半トーン明るい', step: 2, principles: '②', caution: '鼻先の下に影を入れない' },
  { id: 'lip-raise', metric: 'lipY', direction: '上げる', name: '上唇の山を上に', where: '上唇の山',
    amount: { weak: '山をはっきり', standard: '山を内側で上へ毛1本分', strong: '上へ2本分' }, color: '粘膜の色に近い色', step: 5, principles: '②③', caution: '' },
  { id: 'lip-lower', metric: 'lipY', direction: '下げる', name: '下唇の下にシェーディング、下唇中央に光', where: '下唇の下・中央',
    amount: { weak: '下唇の下だけ薄く', standard: '下唇の下＋中央に光', strong: '上下＋下唇中央に光' }, color: '影：半トーン暗い', step: 5, principles: '②', caution: '' },
];

export interface PrescriptionItem {
  techniqueId: string;
  metric: MetricId;
  metricLabel: string;
  direction: string;
  step: number;
  stepLabel: string;
  name: string;
  where: string;
  strength: Strength;
  amount: string;
  color: string;
  principles: string;
  caution: string;
}

export interface Prescription {
  items: PrescriptionItem[];
  strength: Strength;
  /** 目標カードのうち、技法が見つからなかった修正対象 */
  uncovered: TargetItem[];
  /** 全レベル・全ブランドを貫く一文 */
  headline: string;
}

export function buildPrescription(card: TargetCard, strength: Strength = 'standard'): Prescription {
  const items: PrescriptionItem[] = [];
  const uncovered: TargetItem[] = [];
  for (const t of card.items) {
    if (!t.actionable) continue;
    const techs = TECHNIQUES.filter(x => x.metric === t.id && x.direction === t.direction);
    if (techs.length === 0) { uncovered.push(t); continue; }
    for (const x of techs) {
      // 同じ技法が別の指標で既に入っていれば重複させない
      if (items.some(i => i.techniqueId === x.id)) continue;
      items.push({ techniqueId: x.id, metric: t.id, metricLabel: t.label, direction: t.direction, step: x.step, stepLabel: STEP_LABEL[x.step],
        name: x.name, where: x.where, strength, amount: x.amount[strength], color: x.color, principles: x.principles, caution: x.caution });
    }
  }
  items.sort((a, b) => a.step - b.step);
  const dirs = card.items.filter(i => i.actionable).map(i => `${i.label.replace(/（.*?）/g, '')}を${i.direction}`);
  const headline = dirs.length ? `${dirs.join('、')}。顔の設計図に指標を揃える。` : 'すべての指標が範囲内。今日は触らない。';
  return { items, strength, uncovered, headline };
}

/** 本人に渡す文面（コピー用） */
export function prescriptionToText(subjectCode: string, card: TargetCard, rx: Prescription): string {
  const lines: string[] = [];
  lines.push(`黄金比 Face OS ／ 今日の処方（${subjectCode}）`);
  lines.push(rx.headline);
  lines.push('');
  lines.push('■ 目標（顔の設計図との差）');
  for (const t of card.items) {
    if (!t.actionable) continue;
    const mm = t.gapMm != null ? `（約${Math.abs(t.gapMm).toFixed(1)}mm）` : '';
    lines.push(`・${t.label}：${formatV(t.current, t.unit)} → ${formatV(t.ideal, t.unit)}　${t.direction}${mm}`);
  }
  lines.push('');
  lines.push(`■ 処方（${STRENGTH_LABEL[rx.strength]}）`);
  let lastStep = 0;
  for (const i of rx.items) {
    if (i.step !== lastStep) { lines.push(`【${i.step} ${i.stepLabel}】`); lastStep = i.step; }
    lines.push(`・${i.name}：${i.amount}`);
    lines.push(`　場所：${i.where}／色：${i.color}${i.caution ? `／注意：${i.caution}` : ''}`);
  }
  lines.push('');
  lines.push('※「黄金比になる」のではなく「黄金比に近づいて見える」ことを目指す処方です。顔そのものは変わりません。');
  return lines.join('\n');
}

function formatV(v: number, unit: '' | '°') { return unit === '°' ? `${v.toFixed(1)}°` : v.toFixed(3); }
