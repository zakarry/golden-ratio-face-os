// 寄せ方の結果 → 画像生成AI（Gemini など）への指示文
// 完成イメージを描かせるためのもの。処方表の技法IDごとに言い回しを持ち、強さで言葉を変える。
// 言葉はここにあるものだけを使う（AIが勝手に技法や量を足さないため）。
// 用途は運営・メイクさん向けの内部資料。本人には見せない。

import type { YosePurpose, YoseResult, YoseRow } from './yosekata';
import type { Strength } from './prescription';

type Phrase = Record<Strength, string>;

/** 技法ID → 指示文（弱／標準／強） */
const PHRASES: Record<string, Phrase> = {
  // 目間 内へ
  'orbit-shadow':      { weak: 'アイホールの内側（眉頭の下のくぼみ）にごく薄い影', standard: 'アイホールの内側（眉頭の下のくぼみ）に薄い影', strong: 'アイホールの内側（眉頭の下のくぼみ）にはっきりした影' },
  'eyeline-full':      { weak: 'アイラインを目頭近くまで細く', standard: 'アイラインを目頭までしっかり', strong: 'アイラインを目頭まで太めに、目頭側を強く' },
  'brow-head-in':      { weak: '眉頭をわずかに内側へ足す', standard: '眉頭を目頭の真上まで足す', strong: '眉頭を目頭の真上より内側まで足す' },
  'nose-shadow-narrow':{ weak: 'ノーズシャドーを細く薄く', standard: 'ノーズシャドーを細く、やや濃く', strong: 'ノーズシャドーを細く濃く、眉頭から鼻筋の脇まで' },
  // 目間 外へ
  'eyeline-ext':       { weak: 'アイラインを目尻からわずかに延長', standard: 'アイラインを目尻から目の角度の延長線上に延長', strong: 'アイラインを目尻からしっかり延長' },
  'iris-outer-point':  { weak: '黒目の外側の上まぶたに薄い締め色', standard: '黒目の外側の上まぶたに締め色', strong: '黒目の外側の上まぶたに濃い締め色' },
  'brow-tail':         { weak: '眉尻をわずかに外へ', standard: '眉尻を小鼻と目尻の延長線まで', strong: '眉尻を延長線までしっかり描き足す' },
  'triangle-zone':     { weak: '目尻側の三角ゾーンに薄い中間色', standard: '目尻側の三角ゾーン（アイラインと涙袋の間）に中間色', strong: '目尻側の三角ゾーンに中間色を重ね、目尻へ延長' },
  'tear-bag-outer':    { weak: '涙袋の影をわずかに外寄りに', standard: '涙袋の膨らみの中心を黒目より外側に', strong: '涙袋を外寄りにはっきり' },
  'nose-shadow-outer': { weak: 'ノーズシャドーを心もち外側に薄く', standard: 'ノーズシャドーを眼窩側（外側）に', strong: 'ノーズシャドーを眼窩側にしっかり' },
  // 目幅 大きく
  'lash-lift':         { weak: 'まつ毛を軽く上げる', standard: 'まつ毛をしっかり上げて瞳に光を', strong: 'まつ毛を根元から強く上げ、瞳に光を' },
  'liner-center':      { weak: 'アイラインを黒目の上だけわずかに太く', standard: 'アイラインを黒目の上で最も太く', strong: 'アイラインを黒目の上でしっかり太く' },
  'lower-lid-light':   { weak: '下まぶたの際にごく薄い明るい色', standard: '下まぶたの際に明るい色', strong: '下まぶたの際に明るい色をはっきり' },
  'double-lid':        { weak: '二重の線を目尻側だけ薄い影で', standard: '二重の線を影で描く（目尻側から）', strong: '二重の線を影でしっかり描く' },
  // 目の角度
  'angle-up':          { weak: '上ラインを目尻でわずかに上げ、目尻の上に薄い締め色', standard: '上ラインを目尻で上げ、目尻の上に締め色', strong: '上ラインを目尻でしっかり上げ、目尻の上に濃い締め色' },
  'angle-down':        { weak: '目尻の下にごく薄い影を置き、目尻がわずかに下がって見えるように', standard: '下ラインを目尻でわずかに下げ、目尻の下に影', strong: '下ラインを目尻で下げ、目尻の下にしっかり影' },
  // 左右差・黒目
  'level-fix':         { weak: '小さい側の目・低い側の眉にだけ量をわずかに足す', standard: '小さい側の目・低い側の眉にだけ量を足す', strong: '小さい側の目・低い側の眉にしっかり量を足す' },
  'pupil-out':         { weak: '黒目の外側の上まぶたに薄い締め色', standard: '黒目の外側の上まぶたに締め色（視線を外へ）', strong: '黒目の外側に濃い締め色' },
  'pupil-in':          { weak: '目頭側の上まぶたに薄い締め色', standard: '目頭側の上まぶたに締め色（視線を内へ）', strong: '目頭側に濃い締め色' },
  // 輪郭
  'jaw-shade':         { weak: 'エラから顎横に薄いシェーディング', standard: 'エラから顎横にシェーディング', strong: 'エラから顎横にしっかりシェーディング' },
  'cheek-vertical':    { weak: 'チークを頬骨の高い位置から斜め上へ、薄く', standard: 'チークを縦長に、頬骨の高い位置から斜め上へ', strong: 'チークを縦長にはっきり' },
  'inoge':             { weak: '前髪の横に細い触覚ヘアを一筋', standard: '前髪の横・もみあげに触覚ヘアを顔のラインに沿わせる', strong: '触覚ヘアで輪郭をしっかり額縁に' },
  'cheek-horizontal':  { weak: 'チークを横長に薄く、眉をやや平行に', standard: 'チークを横長に、眉を平行気味に', strong: 'チークを横長にはっきり、眉を平行に' },
  'tear-bag':          { weak: '涙袋に薄い影', standard: '涙袋を影で描く', strong: '涙袋をはっきり描く' },
  // 中顔面・下顔面
  'nose-bridge':       { weak: '眉間の両脇にごく薄い影、鼻根に小さなハイライト', standard: '眉間の両脇に薄い影、鼻根から鼻筋の中ほどまで細いハイライト（鼻先には入れない）', strong: '眉間の両脇にはっきりした影、鼻根から鼻筋の中ほどまでハイライト（鼻先には入れない）' },
  'brow-lower':        { weak: '眉の下側をわずかに足して眉を少し下げる', standard: '眉の下側を足して眉を下げる', strong: '眉の下側をしっかり足して眉全体を下げ、太めで平行に近い眉に' },
  'brow-upper':        { weak: '眉の上側をわずかに足す', standard: '眉の上側を足して眉を上げる', strong: '眉の上側をしっかり足して眉を上げる' },
  'chin-shade':        { weak: '顎先の下面にごく薄い影', standard: '顎先の下面に薄い影', strong: '顎先の下面にしっかり影' },
  'chin-light':        { weak: '顎先に小さなハイライト', standard: '顎先にハイライト', strong: '顎先に明るいハイライトを入れ、顎を少し長く見せる' },
  // 人中・口・鼻の長さ
  'philtrum-short':    { weak: '上唇の山を少し上に取り、山の上に小さなハイライト', standard: '上唇の山を上に取り、山の上にハイライト', strong: '上唇の山を今より明らかに高い位置に取り、山の上にハイライト' },
  'philtrum-long':     { weak: '上唇の輪郭をわずかに内側に', standard: '上唇の輪郭を内側に、山を控えめに', strong: '上唇の輪郭をはっきり内側に、山を作らない' },
  'eye-lower':         { weak: '涙袋に薄い影', standard: '涙袋と三角ゾーンで目の重心を下げる', strong: '涙袋と三角ゾーンをはっきり' },
  'eye-raise':         { weak: '締め色をわずかに上へ', standard: '上まぶたに重心（締め色を上へ、眉を下げる）', strong: '上まぶたに重心をしっかり' },
  'nose-shorter':      { weak: '鼻筋のハイライトを中ほどで止め、鼻先の下面にごく薄い影', standard: '鼻筋のハイライトを中ほどで止め、鼻先の下面に薄い影', strong: '鼻筋のハイライトを中ほどで止め、鼻先の下面と鼻柱の付け根にはっきりした影' },
  'nose-longer':       { weak: 'ハイライトを鼻先近くまで', standard: 'ハイライトを鼻先まで通す', strong: 'ハイライトを鼻先までしっかり通す' },
  'lip-raise':         { weak: '上唇の山をわずかに上に', standard: '上唇の山を上に', strong: '上唇の山を明らかに上に' },
  'lip-lower':         { weak: '下唇の下にごく薄い影', standard: '下唇の下にシェーディング、下唇中央に光', strong: '下唇の下にしっかり影、下唇中央に光' },
};

const HEADER =
  'この写真の顔の形・骨格・髪・服・背景は一切変えず、メイクだけを施してください。表情は変えない。微笑まない。正面・無表情のまま。';

/** 目的ごとの前置き（舞台・日常の言い回しは未定なので、決まるまでは出さない） */
const PURPOSE_HEAD: Partial<Record<YosePurpose, string>> = {
  宣材: '宣材写真用。撮影用のナチュラルメイクで、舞台より一段弱く。目は大きく見せない（指示にある場合を除く）。',
};

/** 近づける項目がないときの宣材用の文（形・位置・大きさ・角度は変えない） */
const SENZAI_BASE =
  '肌：セミマットで均一に。\n' +
  '眉：形のまま密度を上げる。\n' +
  '目：上まつ毛の際に細いライン（目尻は延ばさない）。まつ毛を根元から上げ、長く濃く。二重幅にミディアムブラウン。\n' +
  '口：唇は輪郭の内側まで発色の良い色。\n' +
  '頬：血色程度。';

const FOOTER =
  '肌：影は赤みのないベージュで肌より半トーン暗く、光は半トーン明るく、境目を残さない。チークは頬骨の高い位置に薄く、横に広げない。\n' +
  '唇は粘膜に近い色で、輪郭を外に描かない。\n' +
  '上記にない部分は触らない。';

/** 技法IDを部位でまとめるための順序 */
const PART_ORDER: [string, string[]][] = [
  ['眉', ['brow-lower', 'brow-upper', 'brow-head-in', 'brow-tail']],
  ['目', ['liner-center', 'eyeline-full', 'eyeline-ext', 'lash-lift', 'lower-lid-light', 'double-lid', 'iris-outer-point', 'pupil-out', 'pupil-in', 'angle-up', 'angle-down', 'orbit-shadow', 'triangle-zone', 'tear-bag', 'tear-bag-outer', 'eye-lower', 'eye-raise', 'level-fix']],
  ['鼻', ['nose-bridge', 'nose-shadow-narrow', 'nose-shadow-outer', 'nose-shorter', 'nose-longer']],
  ['口', ['philtrum-short', 'philtrum-long', 'lip-raise', 'lip-lower']],
  ['輪郭', ['chin-light', 'chin-shade', 'jaw-shade', 'cheek-vertical', 'cheek-horizontal', 'inoge']],
];

export function buildGeminiPrompt(r: YoseResult): string {
  // 技法ID → 最も強い強さ（複数の指標から同じ技法が出たら強い方）
  const order: Record<Strength, number> = { weak: 0, standard: 1, strong: 2 };
  const chosen = new Map<string, Strength>();
  for (const row of r.rows as YoseRow[]) {
    if (row.relation !== 'agree' && row.relation !== 'conflict') continue;
    if (!row.strength) continue;
    for (const t of row.techniques) {
      const cur = chosen.get(t.id);
      if (!cur || order[row.strength] > order[cur]) chosen.set(t.id, row.strength);
    }
  }
  // 同じ場所を二度言わない（上唇の山）
  if (chosen.has('philtrum-short') && chosen.has('lip-raise')) chosen.delete('lip-raise');
  if (chosen.has('philtrum-long') && chosen.has('lip-raise')) chosen.delete('lip-raise');
  const purpose = r.config.purpose;
  const lines: string[] = [HEADER];
  if (purpose && PURPOSE_HEAD[purpose]) lines.push(PURPOSE_HEAD[purpose]!);
  const target = r.targetKind === 'ideal' ? '黄金比' : r.targetName;
  lines.push(`目的：${target}に寄せる${purpose ? `（${purpose}）` : ''}。` + purposeLine(r));
  let any = false;
  for (const [part, ids] of PART_ORDER) {
    const ps = ids.filter(id => chosen.has(id)).map(id => PHRASES[id]?.[chosen.get(id)!]).filter(Boolean);
    if (ps.length) { lines.push(`${part}：${ps.join('。')}。`); any = true; }
  }
  // 近づける項目がない：宣材なら形は触らず強度だけ上げる文、それ以外は肌と色だけ
  const senzaiBase = !any && purpose === '宣材';
  if (!any) lines.push(senzaiBase ? '配置はすでに整っている。形・位置・大きさ・角度は一切変えず、目・眉・唇の強度を標準以上に上げる。\n' + SENZAI_BASE : '配置はすでに整っている。肌と色を整えるだけにし、形は一切変えない。');
  const keep = r.rows.filter(x => x.relation === 'same' || x.relation === 'keep').map(x => x.label.replace(/（.*?）/g, ''));
  if (keep.length) lines.push(`触らないところ：${keep.join('、')}。`);
  // 宣材の文と重なる肌・唇・頬の決まり文句は出さない（言い分けが食い違わないように）
  lines.push(senzaiBase ? '上記にない部分は触らない。' : FOOTER);
  return lines.join('\n');
}

function purposeLine(r: YoseResult): string {
  const agree = r.rows.filter(x => x.relation === 'agree');
  if (!agree.length) return '';
  const lower = agree.filter(x => ['triH', 'philtrum', 'midlow'].includes(x.id));
  const parts: string[] = [];
  if (lower.length) parts.push('鼻から下を短く見せて顔の下半分を引き締める');
  for (const x of agree) {
    if (['triH', 'philtrum', 'midlow'].includes(x.id)) continue;
    parts.push(`${x.label.replace(/（.*?）/g, '')}を${x.direction}`);
  }
  return parts.join('。') + '。';
}
