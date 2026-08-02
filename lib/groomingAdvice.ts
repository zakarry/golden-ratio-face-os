import type {
  AnalysisResult,
  GroomingAdvice, GroomingTip,
  GroomingModeId, GroomingStyleId,
  TriangleAnalysis,
} from '@/types/analysis';

// ─── Base adjustment table per mode ──────────────────────────────────────────
//
//  casual  : subtle / clean / natural texture
//  formal  : defined / structured / high-contrast contour
//  photo   : balanced structure / lit from front / camera-ready

const MODE_CONTRAST: Record<GroomingModeId, 'subtle' | 'defined' | 'balanced'> = {
  casual: 'subtle',
  formal: 'defined',
  photo:  'balanced',
};

// ─── Style modifiers ──────────────────────────────────────────────────────────

const STYLE_MODS: Record<GroomingStyleId, { emphasis: string[]; suppress: string[] }> = {
  sharp:   { emphasis: ['フェイスラインのシャープさ', '眉の角度'],        suppress: ['輪郭のぼやけ', '眉の丸み']         },
  natural: { emphasis: ['素の肌質', '自然な眉の流れ'],                   suppress: ['過剰な整え', '作り込み感']          },
  soft:    { emphasis: ['眉のなだらかなカーブ', 'やわらかい輪郭感'],      suppress: ['角張ったライン', '硬い印象']        },
  classic: { emphasis: ['左右対称の整い', '端正な眉と輪郭'],              suppress: ['流行の崩し感', '非対称なライン']    },
};

// ─── Triangle type → base grooming direction ──────────────────────────────────

type TriType = TriangleAnalysis['type'];

const TRIANGLE_BASE: Record<TriType, { label: string; emphasis: string[]; suppress: string[] }> = {
  balanced: {
    label: 'バランス型',
    emphasis: ['顔全体の均整', '清潔感'],
    suppress: ['過剰な補正'],
  },
  vertical: {
    label: '縦長・端正型',
    emphasis: ['骨格の縦の流れ', '輪郭のシャープさ'],
    suppress: ['縦への視線の伸ばしすぎ'],
  },
  horizontal: {
    label: '横幅・親しみ型',
    emphasis: ['目元の存在感', 'フレッシュな清潔感'],
    suppress: ['横幅への視線の集中'],
  },
};

// ─── Mode-specific hair volume direction ─────────────────────────────────────

const HAIR_BY_MODE: Record<GroomingModeId, GroomingTip> = {
  casual: {
    area: 'ヘアスタイル',
    action: 'トップにやや自然なボリュームを持たせ、サイドをなじませて整える',
    reason: '日常シーンでは作り込まず、頭部の輪郭が自然に見えるボリューム設計が清潔感を見せる',
  },
  formal: {
    area: 'ヘアスタイル',
    action: 'サイドをタイトに整え、トップの高さで縦のラインを強調して見せる',
    reason: 'フォーマルシーンではタイトなシルエットが骨格の構造をシャープに見せ、存在感を強調する',
  },
  photo: {
    area: 'ヘアスタイル',
    action: 'トップのボリュームと顔の幅のバランスを整え、カメラ正面での輪郭を見せる',
    reason: '宣材写真ではヘアシルエットが顔の形を補正するため、正面からの輪郭バランスを優先して整える',
  },
};

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateGroomingAdvice(
  result: AnalysisResult,
  mode: GroomingModeId = 'casual',
  styleId: GroomingStyleId = 'natural',
): GroomingAdvice[] {
  const { metrics, diagnosis: d, triangleAnalysis: ta } = result;
  const contrast  = MODE_CONTRAST[mode];
  const styleMod  = STYLE_MODS[styleId];
  const triBase   = TRIANGLE_BASE[ta.type];
  const advice: GroomingAdvice[] = [];

  // ── 1. Primary impression card (triangle × mode × style) ─────────────────
  const primaryTips: GroomingTip[] = [];

  // Hair
  primaryTips.push(HAIR_BY_MODE[mode]);

  // Eyebrow base by triangle type
  const browBase: Record<TriType, Record<GroomingModeId, GroomingTip>> = {
    balanced: {
      casual: { area: '眉', action: '眉を毛流れに沿って整え、標準的なアーチでなじませる', reason: 'バランス型は整えるだけで十分な印象を見せる' },
      formal: { area: '眉', action: '眉尻を明確に整え、アーチの角度を強調して見せる', reason: 'フォーマルでは眉の明確さが骨格の構造感を強調する' },
      photo:  { area: '眉', action: '左右の眉の形を揃えてグラデーション調に整え、カメラ正面での対称性を見せる', reason: '宣材写真では眉の左右対称が顔の安定感に直結する' },
    },
    vertical: {
      casual: { area: '眉', action: '眉を比較的フラットになじませ、顔の縦の流れを和らげて見せる', reason: '縦長型ではフラット眉が顔の重心を横方向に整える' },
      formal: { area: '眉', action: '眉に角度をつけてシャープに整え、凛とした縦の構造を強調して見せる', reason: 'フォーマルでは縦の骨格の端正さを眉で強調することで存在感が増す' },
      photo:  { area: '眉', action: '眉をやや角度をつけてカメラ映えする輪郭に整え、端正さを見せる', reason: '宣材では縦の比率が引き立つよう眉で縦の流れをなじませる' },
    },
    horizontal: {
      casual: { area: '眉', action: '眉に自然なアーチを持たせてなじませ、やわらかい印象を整える', reason: '横幅型ではアーチ眉が目元の縦の印象を補強して見せる' },
      formal: { area: '眉', action: '眉をやや角度をつけて整え、横方向への視線を縦に引き上げて見せる', reason: '眉の角度が顔の横広がりを引き締め、構造感を強調する' },
      photo:  { area: '眉', action: '眉のアーチをカメラ映えするよう整え、目元の立体感を見せる', reason: '宣材写真では眉のカーブが目元の立体感を強調し印象を整える' },
    },
  };
  primaryTips.push(browBase[ta.type][mode]);

  // Skin base
  const skinTip: GroomingTip = contrast === 'defined'
    ? { area: '肌質・テクスチャ', action: '肌のテクスチャを整えてマットに仕上げ、骨格のラインをシャープに見せる', reason: '余分なテカりを抑えることでフォーマル時の骨格の構造感を強調する' }
    : contrast === 'balanced'
    ? { area: '肌質・テクスチャ', action: '肌を整えてナチュラルなツヤ感を見せ、カメラ正面での立体感を引き出す', reason: '適度なツヤが宣材写真での骨格の立体感を強調する' }
    : { area: '肌質・テクスチャ', action: '洗顔後のスキンケアで肌を整え、自然な清潔感を見せる', reason: '日常シーンでは肌の清潔感が全体の印象を底上げする最も重要な要素' };
  primaryTips.push(skinTip);

  advice.push({
    category: `${triBase.label}の${GROOMING_MODES_LABEL[mode]}グルーミング`,
    tips: primaryTips,
    emphasis: Array.from(new Set([...triBase.emphasis, ...styleMod.emphasis])),
    suppress: Array.from(new Set([...triBase.suppress, ...styleMod.suppress])),
  });

  // ── 2. Diagnosis-based corrections ───────────────────────────────────────

  // Eye distance
  if (d.eyeDistance.value === 'close') {
    const tips: GroomingTip[] = [
      { area: '眉', action: '眉頭の位置をやや外側に整え、目間の距離を広く見せる', reason: '眉頭の位置が目間の印象を直接コントロールする' },
    ];
    if (mode === 'formal') tips.push({ area: 'ヘアスタイル', action: 'サイドのボリュームを抑え、目元への視線集中をなじませる', reason: 'タイトなサイドが顔の横への広がりを整えて目間のバランスを調整する' });
    advice.push({ category: '目間バランスの調整', tips, emphasis: ['目尻方向への広がり'], suppress: ['目間の狭さの強調'] });
  } else if (d.eyeDistance.value === 'far') {
    const tips: GroomingTip[] = [
      { area: '眉', action: '眉頭を少し内側に設定して整え、目元の距離感を引き締めて見せる', reason: '眉頭の内側設定が目間の視覚的距離を縮める' },
    ];
    advice.push({ category: '目間バランスの調整', tips, emphasis: ['眉頭の内側への誘導'], suppress: ['目の離れた印象'] });
  }

  // Eye level asymmetry
  if (d.eyeLevel.value === 'asymmetric') {
    advice.push({
      category: '左右バランスの調整',
      tips: [
        { area: '眉', action: '低い方の眉をわずかに高く整え、左右の高さをなじませて揃える', reason: '眉の高さが視覚的な左右対称性に最も影響する' },
        mode === 'photo'
          ? { area: 'ヘアスタイル', action: '撮影アングルをわずかに調整し、左右差をなじませる', reason: '宣材写真では撮影角度で左右差を視覚的に整えることができる' }
          : { area: '眉', action: '両眉のアーチを鏡で確認しながら左右対称に見えるよう整える', reason: '日常・フォーマルでは眉の微調整が左右対称の印象を見せる最短ルート' },
      ],
      emphasis: ['左右対称の眉の高さ'], suppress: ['左右差の視覚的強調'],
    });
  }

  // Vertical balance
  if (d.midFace.value === 'long' || d.philtrum.value === 'long') {
    const tips: GroomingTip[] = [];
    if (d.midFace.value === 'long') {
      tips.push({ area: 'ヘアスタイル', action: 'トップにボリュームを見せ、顔の縦の重心を上に引き上げる', reason: 'トップのボリュームが中顔面の縦の長さを視覚的に短縮する' });
    }
    if (d.philtrum.value === 'long') {
      tips.push({ area: '髭・ひげ', action: '口周りの産毛・ひげを整えて清潔感を見せ、鼻下の長さを引き締める', reason: 'ひげラインを整えることで鼻下〜口元の縦の間延び感をなじませる' });
    }
    if (mode === 'formal') tips.push({ area: 'ヘアスタイル', action: 'サイドをタイトに整え、横幅のコンパクトさで縦長感をなじませる', reason: 'フォーマルではサイドのタイトさが縦の比率の印象を調整する' });
    advice.push({ category: '縦バランスの調整', tips, emphasis: ['トップのボリューム', '口周りの清潔感'], suppress: ['縦の間延び感'] });
  }

  // Chin
  if (d.chin.value === 'long') {
    const tips: GroomingTip[] = [
      { area: 'フェイスライン', action: 'フェイスラインに沿ってシェーディング調に整え、顎の縦の長さをなじませる', reason: 'フェイスライン沿いの陰影が顎の長さを視覚的に引き締める' },
    ];
    if (d.philtrum.value !== 'long') {
      tips.push({ area: '髭・ひげ', action: 'あごひげを短く整えてフェイスラインをシャープに見せる', reason: 'あごの輪郭を短いひげで引き締め、縦の長さをなじませる' });
    }
    advice.push({ category: 'フェイスラインの調整', tips, emphasis: ['あごラインの引き締め'], suppress: ['あごの縦への視線誘導'] });
  }

  // Jawline
  if (d.jawline.value === 'prominent') {
    const tips: GroomingTip[] = [
      { area: 'フェイスライン', action: 'エラ〜顎にかけてのフェイスラインを整え、輪郭をシャープに見せる', reason: 'エラの存在感は骨格の強さとして活かしつつ、輪郭の整えが全体のシルエットを見せる' },
      { area: 'ヘアスタイル', action: 'サイドのボリュームを顎ラインより上に集め、顎の張りとのバランスを整える', reason: 'ヘアのボリューム位置がエラの視覚的な存在感を調整する' },
    ];
    advice.push({ category: 'フェイスライン・エラの活かし方', tips, emphasis: ['ヘアのボリュームバランス', 'フェイスラインの輪郭'], suppress: ['エラへの過剰な視線集中'] });
  }

  // Symmetry
  if (metrics.symmetryScore < 85) {
    advice.push({
      category: '左右対称の印象を整える',
      tips: [
        { area: '眉', action: '両眉の高さ・長さをなじませて揃え、表情の左右対称を見せる', reason: '眉の左右差が顔の対称性の印象に最も影響する' },
        { area: 'ヘアスタイル', action: 'ヘアの分け目・流れを中央に近づけ、左右のバランスをなじませる', reason: '分け目の位置が顔の左右対称の印象を大きく左右する' },
      ],
      emphasis: ['左右の眉の揃い', 'ヘアの中央バランス'],
      suppress: ['左右差の視覚的ばらつき'],
    });
  }

  // ── 3. Mode-specific finishing ────────────────────────────────────────────
  const modeFinishing: Record<GroomingModeId, GroomingAdvice> = {
    casual: {
      category: 'ナチュラルグルーミングの仕上げ',
      tips: [
        { area: '肌質・テクスチャ', action: '洗顔・保湿を整えて素肌の清潔感を見せる', reason: '日常シーンでは肌の清潔感が全体の印象を決める最大の要素' },
        { area: '眉', action: '眉を毛流れに沿ってなじませ、自然な形を整える', reason: '日常では過剰な整えより自然な眉の形が好印象を見せる' },
        { area: 'ヘアスタイル', action: 'セット剤で自然なまとまりを整え、清潔感を見せる', reason: '軽いセットで清潔感と自然さを両立させる' },
      ],
      emphasis: ['清潔感', '自然な質感'],
      suppress: ['作り込み感', '過剰なツヤや光沢'],
    },
    formal: {
      category: 'フォーマルグルーミングの仕上げ',
      tips: [
        { area: '肌質・テクスチャ', action: '肌のテクスチャを整えてマット感を見せ、骨格の構造を強調する', reason: 'マットな肌仕上げがフォーマルの骨格の整いを際立たせる' },
        { area: '眉', action: '眉をクリアに整え、アーチの輪郭をシャープに見せる', reason: '明確な眉が審査・フォーマルでの存在感と構造感を強調する' },
        { area: 'ヘアスタイル', action: 'ヘアをタイトにセットし、顔の骨格のラインをシャープに見せる', reason: 'フォーマルではヘアのタイトさが骨格の構造を前面に出す' },
        { area: 'フェイスライン', action: 'ひげを整えてフェイスラインをクリーンに見せる', reason: 'フォーマルではフェイスラインの清潔感が信頼感に直結する' },
      ],
      emphasis: ['骨格のシャープさ', '眉の明確さ', 'フェイスラインの整い'],
      suppress: ['ラフな質感', 'ぼやけた輪郭'],
    },
    photo: {
      category: 'フォトグルーミングの仕上げ',
      tips: [
        { area: '肌質・テクスチャ', action: '肌をナチュラルなツヤで整え、カメラ正面での立体感を見せる', reason: '適度なツヤが宣材写真で骨格の立体感を自然に強調する' },
        { area: '眉', action: '眉を左右対称に整え、カメラ正面での安定感を見せる', reason: '眉の対称性が宣材写真の印象を決定づける要素の一つ' },
        { area: 'ヘアスタイル', action: '撮影アングルからの輪郭が整うようボリュームバランスを調整して見せる', reason: '宣材ではカメラ正面の輪郭シルエットがファーストインパクトを作る' },
      ],
      emphasis: ['カメラ正面での骨格の立体感', '眉の対称性', 'ヘアシルエットのバランス'],
      suppress: ['過剰な反射・テカり', '左右差の強調'],
    },
  };
  advice.push(modeFinishing[mode]);

  return advice;
}

// ─── Local label map (avoids circular import) ─────────────────────────────────

const GROOMING_MODES_LABEL: Record<GroomingModeId, string> = {
  casual: 'ナチュラル',
  formal: 'フォーマル',
  photo:  'フォト',
};
