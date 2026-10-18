// 完成イメージ用の指示文（第2版）
// 10/18 までに手作業で分かったことを型にしたもの。
//  - 手順形式（手順1〜6 → やらないこと → 完成の確認）で書く。説明文・雰囲気の前置きは入れない
//  - 寄せ先の名前は絶対に入れない（Gemini が顔を作り変える）
//  - 「人中」「短く」「寄せる」「黄金比」の語を使わない（同上）
//  - 鼻筋に線・影・光を描かせない（Gemini が鼻先まで引く）。鼻は「鼻先の下面の小さい影」と「赤みの整え」だけ
//  - 肌は「テカリを抑えてセミマット」。ツヤ・ハイライト・光は唇と頬骨の上だけ（Gemini が点や帯を置く）
//  - 強度は最初から用途強度（HP／宣材／舞台）。「ナチュラル」は本人希望として記録するだけで、指示には使わない
//  - 用途が舞台なら目尻のライン延長を許可、宣材・HPなら目の端で止める
//  - ChatGPT に「もう一段」出させる時は「今より○倍」「今より○段階」の比較で書く（別関数）

import type { YoseResult, YoseRow } from './yosekata';
import type { Strength } from './prescription';

export type RenderPurpose = 'hp' | 'portrait' | 'stage';
export type RenderEngine = 'gemini' | 'openai';

export interface RenderPromptOptions {
  purpose: RenderPurpose;
  engine: RenderEngine;
  /** アンケートの「気になるところ」などから、肌で整える箇所（例: ['そばかす','目の下の影','小鼻の赤み']） */
  skinFix?: string[];
  /** アンケートの印象（例: ['上品','知的']）。最後の一行にだけ使う */
  impression?: string[];
  /** 本人が触らないでほしい場所（アンケート no_touch） */
  noTouch?: string;
}

const ORDER: Record<Strength, number> = { weak: 0, standard: 1, strong: 2 };

/** 技法ID → 手順の中の一文。顔の形を動かす技法だけ（強度系は用途で決める） */
const TECH: Record<string, Record<Strength, string>> = {
  // 目間 内へ
  'brow-head-in':      { weak: '眉頭を毛1〜2本分だけ内側に描き足す', standard: '眉頭を目頭の真上まで内側に描き足す', strong: '眉頭を目頭の真上より少し内側まで描き足す' },
  'orbit-shadow':      { weak: '眉頭の下のくぼみにだけ、肌より半トーン暗いマットブラウン', standard: 'アイホールの内側半分に、肌より1トーン暗いマットブラウン', strong: '目頭側のアイホールから鼻根にかけて、肌より1トーン暗いマットブラウン' },
  'eyeline-full':      { weak: 'アイラインは黒目の内縁から目尻まで', standard: 'アイラインは目頭までしっかり', strong: 'アイラインは目頭まで、目頭側をやや太く' },
  'nose-shadow-narrow':{ weak: '眉頭の下に小さく薄い影（鼻筋には描かない）', standard: '眉頭の下から目頭の高さまで、細い薄い影（それより下には描かない）', strong: '眉頭の下から黒目の高さまで、細い影（それより下には描かない）' },
  // 目間 外へ
  'eyeline-ext':       { weak: 'アイラインを目尻から2ミリ延長', standard: 'アイラインを目尻から目の角度に沿って3ミリ延長', strong: 'アイラインを目尻から目の角度に沿って5ミリ延長' },
  'brow-tail':         { weak: '眉尻をわずかに外へ', standard: '眉尻を小鼻と目尻の延長線まで', strong: '眉尻を延長線までしっかり描き足す' },
  'triangle-zone':     { weak: '目尻側の下まぶたに薄いブラウン', standard: '目尻側の三角ゾーン（アイラインと涙袋の間）にブラウン', strong: '目尻側の三角ゾーンにブラウンをはっきり' },
  // 目幅
  'lash-lift':         { weak: 'まつ毛を軽く上げる', standard: 'まつ毛を根元から上向きに', strong: 'まつ毛を根元から強く上げて束感を出す' },
  'liner-center':      { weak: 'アイラインを黒目の上だけわずかに太く', standard: 'アイラインを黒目の上で最も太く', strong: 'アイラインを黒目の上で3ミリ' },
  'lower-lid-light':   { weak: '下まぶたの際に薄い明るいベージュ', standard: '下まぶたの際に明るいベージュ', strong: '下まぶたの際に明るいベージュをはっきり' },
  // 目の角度
  'angle-up':          { weak: '目尻の上に薄いブラウン', standard: 'アイラインを目尻でわずかに上げ、目尻の上にブラウン', strong: 'アイラインを目尻で上げ、目尻の上に濃いブラウン' },
  'angle-down':        { weak: '目尻の下に薄い影', standard: '目尻の下に影、上ラインは目尻で下げ気味', strong: '目尻の下にはっきり影' },
  // 黒目
  'pupil-out':         { weak: '黒目の外側の上まぶたに薄いブラウン', standard: '黒目の外側の上まぶたにブラウン', strong: '黒目の外側の上まぶたに濃いブラウン' },
  'pupil-in':          { weak: '黒目の内側の上まぶたに薄いブラウン', standard: '黒目の内側の上まぶたにブラウン', strong: '黒目の内側の上まぶたに濃いブラウン' },
  // 中顔面
  'nose-bridge':       { weak: '眉間の両脇（眉頭の下）に薄い影を小さく', standard: '眉間の両脇に薄い影、鼻根に小さくハイライト（鼻筋には描かない）', strong: '眉間の両脇にはっきりした影、鼻根に小さくハイライト（鼻筋には描かない）' },
  'brow-lower':        { weak: '眉の下側に毛1本分足して、眉をわずかに低く', standard: '眉の下側に毛2本分足して、眉をやや低く', strong: '眉の下側に毛3本分足して、眉を低く太めに' },
  'brow-upper':        { weak: '眉の上側に毛1本分足す', standard: '眉の上側に毛2本分足す', strong: '眉の上側に毛3本分足す' },
  'chin-light':        { weak: '顎先に小さくマットなハイライト', standard: '顎先にマットなハイライト、唇の下のくぼみに薄い影', strong: '顎先にマットなハイライト、顎の下面に薄い影' },
  'chin-shade':        { weak: '顎先の下面にごく薄い影', standard: '顎先の下面に薄い影', strong: '顎先の下面にはっきり影' },
  // 人中・口・鼻先（「人中」「短く」の語を使わない書き方）
  'philtrum-short':    { weak: '上唇の山の輪郭をはっきり描く', standard: '上唇の山の輪郭を、今の唇の内側で、山の頂点を1ミリだけ上に描き、山の頂点の上の肌に小さくハイライト', strong: '上唇の山の輪郭を、今の唇の内側で、山の頂点を2ミリ上に描き、山の頂点の上の肌にはっきりハイライト' },
  'philtrum-long':     { weak: '上唇の輪郭をわずかに内側に', standard: '上唇の輪郭を内側に、山を控えめに', strong: '上唇の輪郭をはっきり内側に、山を作らない' },
  'lip-raise':         { weak: '上唇の山をはっきり描く', standard: '上唇の山の頂点を1ミリ上に描く', strong: '上唇の山の頂点を2ミリ上に描く' },
  'lip-lower':         { weak: '下唇の下に薄い影', standard: '下唇の下に薄い影、下唇の中央に小さく光', strong: '下唇の下に影、下唇の中央に光' },
  'nose-shorter':      { weak: '鼻先の下面（鼻の下と人中の境目）に小さく薄い影を一つ', standard: '鼻先の下面（鼻の下と人中の境目）に小さく薄い影を一つ、鼻柱の付け根にも薄く', strong: '鼻先の下面（鼻の下と人中の境目）に小さい影を一つ、鼻柱の付け根にもはっきり' },
  'nose-longer':       { weak: '（鼻筋には描かない。鼻先の下面に影を置かない）', standard: '（鼻筋には描かない。鼻先の下面に影を置かない）', strong: '（鼻筋には描かない。鼻先の下面に影を置かない）' },
  // 輪郭（頬骨下の影は Gemini で浮くので HP/宣材では使わない。舞台のみ）
  'jaw-shade':         { weak: 'エラから顎横にごく薄い影', standard: 'エラから顎横に薄い影', strong: 'エラから顎横に影' },
  'cheek-vertical':    { weak: 'チークは頬骨の高い位置から斜め上へ', standard: 'チークは縦長に、頬骨の高い位置から斜め上へ', strong: 'チークは縦長にはっきり' },
  'cheek-horizontal':  { weak: 'チークは横長に薄く', standard: 'チークは横長に', strong: 'チークは横長にはっきり' },
  'tear-bag':          { weak: '涙袋の下に薄い影', standard: '涙袋の下に薄いブラウンの影、涙袋の上にマットベージュのハイライト', strong: '涙袋の下にブラウンの影をはっきり、涙袋の上にマットベージュのハイライトをはっきり' },
  'tear-bag-outer':    { weak: '涙袋の影をわずかに外寄りに', standard: '涙袋の膨らみの中心を黒目より外側に', strong: '涙袋を外寄りにはっきり' },
  'inoge':             { weak: '', standard: '', strong: '' }, // 髪は触らないので出さない
  'double-lid':        { weak: '', standard: '', strong: '' }, // 形を動かすので出さない
  'level-fix':         { weak: '', standard: '', strong: '' },
  'iris-outer-point':  { weak: '黒目の外側の上まぶたに薄いブラウン', standard: '黒目の外側の上まぶたにブラウン', strong: '黒目の外側の上まぶたに濃いブラウン' },
  'eye-lower':         { weak: '涙袋の下に薄い影', standard: '涙袋の下に影、目尻側の下まぶたにブラウン', strong: '涙袋の下に影をはっきり、目尻側の下まぶたにブラウン' },
  'eye-raise':         { weak: '上まぶたの際のブラウンをわずかに上へ', standard: '上まぶたの際のブラウンを上へ広げる', strong: '上まぶたの際のブラウンをしっかり上へ' },
};

/** 技法ID → 手順の部位 */
const PART_OF: Record<string, '眉' | '目' | '鼻顎' | '唇' | '頬'> = {
  'brow-head-in': '眉', 'brow-tail': '眉', 'brow-lower': '眉', 'brow-upper': '眉',
  'orbit-shadow': '目', 'eyeline-full': '目', 'eyeline-ext': '目', 'triangle-zone': '目', 'lash-lift': '目', 'liner-center': '目',
  'lower-lid-light': '目', 'angle-up': '目', 'angle-down': '目', 'pupil-out': '目', 'pupil-in': '目', 'iris-outer-point': '目',
  'tear-bag': '目', 'tear-bag-outer': '目', 'eye-lower': '目', 'eye-raise': '目',
  'nose-shadow-narrow': '鼻顎', 'nose-bridge': '鼻顎', 'chin-light': '鼻顎', 'chin-shade': '鼻顎', 'nose-shorter': '鼻顎', 'nose-longer': '鼻顎', 'jaw-shade': '鼻顎',
  'philtrum-short': '唇', 'philtrum-long': '唇', 'lip-raise': '唇', 'lip-lower': '唇',
  'cheek-vertical': '頬', 'cheek-horizontal': '頬',
};

/** 用途ごとの強度文（技法とは別。形は動かさず見え方だけ） */
const PURPOSE_TEXT: Record<RenderPurpose, { head: string; eye: string; lip: string; cheek: string; brow: string }> = {
  hp: {
    head: 'ミスコンテストの公式サイトに並ぶプロフィール写真用で、メイクは華やかにはっきりと。',
    eye: '上まぶたの際にダークブラウンのアイラインをはっきり、黒目の上で2ミリ、目尻は目の端で止める。アイホールにミディアムブラウンを際に向かって濃くグラデーション。涙袋の下に薄いブラウンの影、涙袋の上に明るいベージュのマットなハイライト。下まぶたの際は黒目の下から目尻までブラウン。まつ毛は上を長く密に上向き、下まつ毛も描く。',
    lip: '色はローズピンクで、健康的な血色が一目で分かる濃さ。質感はツヤのあるサテン。唇の面積を広げない。',
    cheek: '頬骨の高い位置から斜め上に、ピンクローズのチークをふんわり。血色が一目で分かる程度。',
    brow: '毛の隙間を埋めて輪郭をはっきり、色は髪色に合わせて少し濃く。太くしない。',
  },
  portrait: {
    head: '公式のプロフィール写真用で、メイクははっきり分かる強さで、上品に。',
    eye: '上まぶたの際にダークブラウンのアイラインをはっきり、黒目の上で2ミリ、目尻は目の端で止める。アイホールにミディアムブラウンを際に向かって濃く。涙袋の下に薄いブラウンの影、涙袋の上にマットベージュのハイライト。まつ毛は上を長く上向き。',
    lip: '色はローズベージュのセミマット。輪郭は整えるが大きくしない。',
    cheek: '頬骨の高い位置に薄いベージュローズを小さく。',
    brow: '毛の隙間を埋めて、色は髪色に合わせて少し濃く。太くしない。',
  },
  stage: {
    head: '舞台用で、客席から見て分かる強さで。',
    eye: '上まぶたの際にブラックに近いダークブラウンのアイラインを黒目の上で3ミリ、目尻は目の角度に沿って3〜5ミリ延長して先を細く。アイホールにミディアムブラウンを際に向かって濃く、目尻側を少し濃く。涙袋の下にブラウンの影、涙袋の上に明るいベージュのハイライト。下まぶたの際は黒目の下から目尻までブラウン。まつ毛は上を長く密に、下まつ毛も描く。',
    lip: '色はローズで、はっきりした濃さ。質感はサテン。輪郭をはっきり。',
    cheek: '頬骨の高い位置から斜め上に、ローズのチークをはっきり。',
    brow: '輪郭をはっきり、色を濃く。形は変えない。',
  },
};

function pick(rows: YoseRow[]): Map<string, Strength> {
  const m = new Map<string, Strength>();
  for (const row of rows) {
    if (row.relation !== 'agree' || !row.strength) continue;
    for (const t of row.techniques ?? []) {
      const cur = m.get(t.id);
      if (!cur || ORDER[row.strength] > ORDER[cur]) m.set(t.id, row.strength);
    }
  }
  return m;
}

/** 寄せ方の結果 → 完成イメージ用の指示文（一発版） */
export function buildRenderPrompt(r: YoseResult, o: RenderPromptOptions): string {
  const P = PURPOSE_TEXT[o.purpose];
  const tech = pick(r.rows);
  const byPart: Record<string, string[]> = { 眉: [], 目: [], 鼻顎: [], 唇: [], 頬: [] };
  // 唇の山（philtrum-short / lip-raise）は同じ動作なので強い方だけ
  if (tech.has('philtrum-short') && tech.has('lip-raise')) tech.delete('lip-raise');
  // HP/宣材では頬骨下の影を使わない（Gemini で浮く）
  if (o.purpose !== 'stage') tech.delete('jaw-shade');
  for (const [id, s] of Array.from(tech.entries())) {
    const t = TECH[id]?.[s];
    if (t) byPart[PART_OF[id] ?? '目'].push(t);
  }
  // 目尻延長は舞台だけ許可（寄せ方で eyeline-ext が出ていても HP/宣材では止める）
  const stage = o.purpose === 'stage';
  if (!stage) byPart['目'] = byPart['目'].filter(t => !t.startsWith('アイラインを目尻から'));

  const skin = (o.skinFix && o.skinFix.length ? o.skinFix.join('と') + 'を整え、' : '目の下の影を整え、');
  const noTouch = o.noTouch && o.noTouch !== 'なし' ? `本人の希望で触らない場所：${o.noTouch}。` : '';

  const lines: string[] = [];
  lines.push('この写真を元に、メイクだけを描き足したレタッチ画像を作ってください。顔の形・パーツの位置と大きさ・表情・髪・服・背景・画角は元のまま。出力は元と同じ縦横比・同じ構図。顔の輪郭、顔の長さ、首と肩、顔の向きは1ピクセルも動かさない。' + P.head);
  if (noTouch) lines.push(noTouch);
  lines.push('');
  lines.push('次の手順を順番どおり全部やってください。');
  lines.push('');
  lines.push(`手順1（肌）：額と鼻のテカリを抑え、${skin}顔全体を均一なセミマットの肌にする。肌の色と明るさは元のまま。白くしない。肌にツヤの点や帯を置かない。`);
  lines.push('');
  lines.push(`手順2（眉）：形と位置は今のまま。${P.brow}${byPart['眉'].length ? ' ' + byPart['眉'].join('。') + '。' : ' 眉頭を内側に足さない。'}`);
  lines.push('');
  lines.push(`手順3（目）：目の形は今のまま活かす。${P.eye}${byPart['目'].length ? ' ' + byPart['目'].join('。') + '。' : ''}`);
  lines.push('');
  lines.push(`手順4（唇）：${P.lip}${byPart['唇'].length ? ' ' + byPart['唇'].join('。') + '。' : ' 上唇の山の輪郭をはっきり描く。'}`);
  lines.push('');
  lines.push(`手順5（鼻と顎）：${byPart['鼻顎'].length ? byPart['鼻顎'].join('。') + '。' : '鼻先と小鼻の赤みを周りの肌と同じ色に整える。'} 鼻筋には線も影も光も描かない。`);
  lines.push('');
  lines.push(`手順6（頬）：${byPart['頬'].length ? byPart['頬'].join('。') + '。' : P.cheek}`);
  lines.push('');
  const dont = [
    '顔の長さを変えない', '顔を細くしない', '首や肩を描き直さない', '服を変えない', '表情を変えない',
    tech.has('brow-head-in') ? '' : '眉頭を内側に足さない',
    tech.has('orbit-shadow') ? '' : '目頭側に影を入れない',
    stage ? '' : '目尻を伸ばさない',
    '目を丸くしない', '鼻筋の脇に線や影や光を描かない', '頬骨の下やフェイスラインに影を描かない', '顔を白くしない', '肌にツヤの点や帯を置かない',
    '黒一色・グレー・パール・ラメを使わない',
  ].filter(Boolean);
  lines.push('やらないこと：' + dont.join('。') + '。');
  lines.push('');
  lines.push('完成の確認：顔の輪郭を元の写真に重ねたとき完全に一致するか。服と肩が元のままか。肌にツヤの点がないか。鼻筋に線がないか。' + (stage ? '' : '目尻のラインが目の端で止まっているか。'));
  if (o.impression?.length) lines.push(`雰囲気は${o.impression.join('・')}。`);
  return lines.join('\n');
}

/** 「もう一段」：出来た画像に続けて出す比較指定の指示文（ChatGPT に効く） */
export function buildStrengthenPrompt(purpose: RenderPurpose): string {
  const stage = purpose === 'stage';
  return [
    'この画像のメイクを、全体に一段強くしてください。顔の形・パーツの位置・表情・髪・背景は一切変えないでください。',
    '眉：今より1段階濃く、輪郭をはっきり。形はそのまま。',
    `アイライン：今の線を2倍の太さに、色はブラックに近いダークブラウン。目頭から目尻まで途切れなく${stage ? '、目尻は目の角度に沿って3ミリだけ延長' : '、目尻は目の端で止める'}。`,
    'アイシャドウ：アイホールのブラウンを今より1段階濃く、際に向かって濃く。',
    '涙袋：下の影を今より濃く、ハイライトを今より明るく。下まぶたの際にブラウンを黒目の下から目尻まで。',
    'まつ毛：上を長く密に、下まつ毛も描く。',
    'チーク：今より1.5倍はっきり。',
    '唇：色を今より1段階濃く、上唇の山をはっきり。質感は今のまま。',
    '肌：テカリを足さない。白くしない。頬骨の下に影を入れない。鼻筋に線を引かない。',
  ].join('\n');
}

/** エンジンごとの注意（UI の説明用） */
export const ENGINE_NOTES: Record<RenderEngine, string[]> = {
  gemini: [
    '毎回新しい会話で生成する（前の人の顔が混ざる）',
    '寄せ先の名前は入れない（顔を作り変える）',
    '鼻筋の指示は入れない（鼻先まで引く）',
    '「光」「ハイライト」は点や帯として描かれる。肌はセミマット固定',
    '目尻を跳ね上げる癖あり。舞台用途なら許容',
    '唇の色を落とす指示が通りにくい',
  ],
  openai: [
    '指示に忠実。強さは控えめに出るので「今より○倍」で足す',
    '縦長・正方形以外の素材で画面比を変えることがある。出力の寸法を確認',
    'ポリシーで弾かれたら「公式のプロフィール写真用」「凛として知的」に言い換え',
  ],
};
