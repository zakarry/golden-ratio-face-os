// 運営ページの Excel 書き出し（シート「一覧」＝1人1行、「撮影ごと」＝1枚1行）
// exceljs はボタンを押したときだけ読み込む。

import { getSupabaseClient } from '@/lib/supabaseClient';
import { METRIC_DEFS, type PilotMetrics } from './targetCard';
import { buildYoseBundle, pickYoseSubject } from './yosekataStaff';
import { staffMediaUrls, type ParticipantSummary } from './staff';
import { fetchAllSurveysForStaff, flattenAnswers, REFERENCE_KIND_LABEL } from './survey';

/** 写真つきのとき、Excel に貼る縮小画像の大きさ（px） */
const THUMB_W = 120, THUMB_H = 160;

/** URL の画像を THUMB_W×THUMB_H に収まるよう縮めた JPEG（base64）にする */
async function thumbnail(url: string): Promise<{ base64: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const s = Math.min(THUMB_W * 2 / bmp.width, THUMB_H * 2 / bmp.height, 1); // 2倍で作って Excel 上で縮小表示（くっきり見せる）
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return { base64: c.toDataURL('image/jpeg', 0.8), w: c.width / 2, h: c.height / 2 };
  } catch { return null; }
}

/** 同時に取りに行く数を絞って順に処理する */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>, onDone?: (n: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); onDone?.(++done); }
  }));
  return out;
}

export const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
export const jstDate = (iso: string) => jst(iso).slice(0, 10);
export const jstTime = (iso: string) => jst(iso).slice(11, 16);

export interface CaptureRow {
  participant_token: string;
  phase: string;
  taken_at: string;
  framing: { ok?: boolean; warnings?: string[] } | null;
  metrics: Record<string, number> | null;
  actionable: number | null;
  headline: string | null;
  tri: string | null;
  strengths: string[] | null;
  gr: { faceRatio?: number; eyePosition?: number; mouthPosition?: number } | null;
  image_path: string | null;
  blueprint_path: string | null;
  dimension_path: string | null;
}

export async function fetchCaptures(): Promise<CaptureRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const rows: CaptureRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('pilot_records')
      .select('participant_token, phase, taken_at, framing, metrics, actionable:target_card->actionableCount, headline:prescription->>headline, tri:karte->triangleAnalysis->>label, strengths:karte->strengths, gr:karte->goldenRatio, image_path, blueprint_path, dimension_path')
      .not('participant_token', 'is', null).order('taken_at').range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as CaptureRow[]));
    if (!data || data.length < 500) break;
  }
  return rows;
}

export async function downloadStaffExcel(list: ParticipantSummary[], origin: string, opts: { withImages?: boolean; onProgress?: (msg: string) => void } = {}) {
  const [{ default: ExcelJS }, captures] = await Promise.all([import('exceljs'), fetchCaptures()]);
  const wb = new ExcelJS.Workbook();
  const header = (ws: import('exceljs').Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E9D8' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  // ── 一覧
  const s1 = wb.addWorksheet('一覧');
  s1.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    { header: '未成年', key: 'minor', width: 8 },
    { header: '同意', key: 'consent', width: 8 },
    { header: '同意日', key: 'consentAt', width: 12 },
    { header: '回数', key: 'sessions', width: 6 },
    { header: '枚数', key: 'count', width: 6 },
    { header: 'メイク前', key: 'before', width: 9 },
    { header: 'メイク後', key: 'after', width: 9 },
    { header: '最終撮影日', key: 'last', width: 12 },
    { header: '専用リンク', key: 'url', width: 70 },
  ];
  list.forEach(p => s1.addRow({
    code: p.subjectCode, name: p.name, minor: p.isMinor ? '未成年' : '',
    consent: p.consentedAt ? (p.consentBy === 'guardian' ? '保護者' : '本人') : '未',
    consentAt: p.consentedAt ? jstDate(p.consentedAt) : '',
    sessions: p.sessions, count: p.count, before: p.beforeCount, after: p.afterCount,
    last: p.lastAt ? jstDate(p.lastAt) : '',
    url: `${origin}/?p=${p.token}&openExternalBrowser=1`,
  }));
  header(s1);

  // ── 撮影ごと
  const codeOf = new Map(list.map(p => [p.token, p.subjectCode]));
  const nameOf = new Map(list.map(p => [p.token, p.name]));
  const s2 = wb.addWorksheet('撮影ごと');
  const withImages = !!opts.withImages;
  s2.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    ...(withImages ? [{ header: '写真', key: 'imgPhoto', width: 18 }, { header: '顔の設計図', key: 'imgBp', width: 18 }, { header: '寸法図', key: 'imgDim', width: 18 }] : []),
    { header: '回', key: 'no', width: 5 },
    { header: '撮影日', key: 'date', width: 12 },
    { header: '時刻', key: 'time', width: 7 },
    { header: '段階', key: 'phase', width: 9 },
    { header: '写りOK', key: 'ok', width: 7 },
    { header: '写りの注意', key: 'warn', width: 28 },
    { header: '設計図', key: 'bp', width: 7 },
    { header: '寸法図', key: 'dim', width: 7 },
    { header: '顔印象タイプ', key: 'tri', width: 18 },
    { header: '強み', key: 'strengths', width: 36 },
    { header: '黄金比 縦横', key: 'grFace', width: 11 },
    { header: '黄金比 目位置', key: 'grEye', width: 12 },
    { header: '黄金比 口位置', key: 'grMouth', width: 12 },
    { header: '修正対象の数', key: 'actionable', width: 11 },
    ...METRIC_DEFS.map(d => ({ header: `${d.label}（黄金比 ${d.unit === '°' ? d.ideal + '°' : d.ideal.toFixed(3)}）`, key: `m_${d.id}`, width: 16 })),
    { header: '処方', key: 'rx', width: 60 },
  ];
  // 回＝撮影日ごとの通し番号（人ごと）
  const sessionNo = new Map<string, Map<string, number>>();
  captures.forEach(c => {
    const m = sessionNo.get(c.participant_token) ?? new Map<string, number>();
    const d = jstDate(c.taken_at);
    if (!m.has(d)) m.set(d, m.size + 1);
    sessionNo.set(c.participant_token, m);
  });
  const sorted = [...captures]
    .sort((a, b) => (codeOf.get(a.participant_token) ?? '').localeCompare(codeOf.get(b.participant_token) ?? '') || a.taken_at.localeCompare(b.taken_at));

  // 写真つき：署名付きURLを取り、縮小画像を作る
  const thumbs = new Map<string, { base64: string; w: number; h: number } | null>();
  if (withImages) {
    const paths = sorted.flatMap(c => [c.image_path, c.blueprint_path, c.dimension_path]).filter((p): p is string => !!p);
    const urls: Record<string, string> = {};
    for (let i = 0; i < paths.length; i += 100) Object.assign(urls, await staffMediaUrls(paths.slice(i, i + 100)));
    await mapLimit(paths, 6, async p => { thumbs.set(p, urls[p] ? await thumbnail(urls[p]) : null); },
      n => opts.onProgress?.(`画像を取得中 ${n}/${paths.length}`));
    opts.onProgress?.('Excelを作成中…');
  }

  sorted.forEach(c => {
      const row: Record<string, unknown> = {
        code: codeOf.get(c.participant_token) ?? '', name: nameOf.get(c.participant_token) ?? '', no: sessionNo.get(c.participant_token)?.get(jstDate(c.taken_at)),
        date: jstDate(c.taken_at), time: jstTime(c.taken_at), phase: c.phase === 'before' ? 'メイク前' : 'メイク後',
        ok: c.framing?.ok === false ? '×' : '○', warn: (c.framing?.warnings ?? []).join('・'), bp: c.blueprint_path ? 'あり' : '', dim: c.dimension_path ? 'あり' : '',
        tri: c.tri ?? '', strengths: (c.strengths ?? []).join('、'),
        grFace: c.gr?.faceRatio ?? '', grEye: c.gr?.eyePosition ?? '', grMouth: c.gr?.mouthPosition ?? '',
        actionable: c.actionable ?? '', rx: c.headline ?? '',
      };
      METRIC_DEFS.forEach(d => { const v = c.metrics?.[d.id]; row[`m_${d.id}`] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : ''; });
      const added = s2.addRow(row);
      if (withImages) {
        added.height = THUMB_H * 0.75 + 6; // 行の高さはポイント（px×0.75）
        added.alignment = { vertical: 'top', wrapText: true };
        ([['imgPhoto', c.image_path], ['imgBp', c.blueprint_path], ['imgDim', c.dimension_path]] as const).forEach(([key, path]) => {
          const t = path ? thumbs.get(path) : null;
          if (!t) return;
          const id = wb.addImage({ base64: t.base64, extension: 'jpeg' });
          const col = s2.getColumn(key).number - 1;
          s2.addImage(id, { tl: { col: col + 0.05, row: added.number - 1 + 0.03 }, ext: { width: t.w, height: t.h } });
        });
      }
    });
  header(s2);

  // ── 事前アンケート（1人1行、質問ごとに1列）と、似ている人（1人1行）
  const { surveys, refs } = await fetchAllSurveysForStaff();
  const surveyOf = new Map(surveys.map(s => [s.token, s]));
  const qCols = flattenAnswers({});
  const s3 = wb.addWorksheet('アンケート');
  s3.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    { header: '回答日', key: 'at', width: 12 },
    ...qCols.map((q, i) => ({ header: `${q.no}. ${q.title}`, key: `q${i}`, width: 30 })),
    ...(['self_happy', 'others_say', 'dislike'] as const).map(k => ({ header: REFERENCE_KIND_LABEL[k], key: `ref_${k}`, width: 24 })),
  ];
  list.forEach(p => {
    const s = surveyOf.get(p.token);
    const row: Record<string, unknown> = { code: p.subjectCode, name: p.name, at: s ? jstDate(s.updated_at) : '未回答' };
    if (s) flattenAnswers(s.answers).forEach((a, i) => { row[`q${i}`] = a.answer; });
    for (const k of ['self_happy', 'others_say', 'dislike'] as const) {
      row[`ref_${k}`] = refs.filter(r => r.token === p.token && r.kind === k).map(r => r.person_name).join('、');
    }
    s3.addRow(row).alignment = { vertical: 'top', wrapText: true };
  });
  header(s3);

  const s4 = wb.addWorksheet('似ている人');
  s4.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    { header: '種類', key: 'kind', width: 18 },
    { header: '似ている人', key: 'person', width: 18 },
    { header: '写真のメモ', key: 'note', width: 24 },
    { header: '写真', key: 'photo', width: 8 },
    { header: '測定日', key: 'measured', width: 12 },
    { header: '向き（正面0）', key: 'yaw', width: 12 },
    ...METRIC_DEFS.map(d => ({ header: `${d.label}（黄金比 ${d.unit === '°' ? d.ideal + '°' : d.ideal.toFixed(3)}）`, key: `m_${d.id}`, width: 16 })),
  ];
  const nameOfToken = new Map(list.map(p => [p.token, p]));
  [...refs].sort((a, b) => a.subject_code.localeCompare(b.subject_code)).forEach(r => {
    const row: Record<string, unknown> = {
      code: r.subject_code, name: nameOfToken.get(r.token)?.name ?? '', kind: REFERENCE_KIND_LABEL[r.kind], person: r.person_name,
      note: r.source_note ?? '', photo: r.image_path ? 'あり' : '', measured: r.measured_at ? jstDate(r.measured_at) : '未測定',
      yaw: typeof r.framing?.yaw === 'number' ? Math.round(r.framing.yaw * 1000) / 1000 : '',
    };
    METRIC_DEFS.forEach(d => { const v = r.metrics?.[d.id]; row[`m_${d.id}`] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : ''; });
    s4.addRow(row);
  });
  header(s4);

  // ── 寄せ方（本人＝写り○の最新メイク前、目標＝黄金比＋測定済みの似ている人）。書き出すたびに計算する
  const s5 = wb.addWorksheet('寄せ方（束ね）');
  s5.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    { header: '本人の撮影日', key: 'at', width: 12 },
    { header: '指標', key: 'metric', width: 24 },
    { header: 'まとめ', key: 'verdict', width: 14 },
    { header: '方向', key: 'dir', width: 22 },
    { header: '目標ごとの方向', key: 'by', width: 60 },
    { header: '黄金比', key: 'ideal', width: 22 },
  ];
  const s6 = wb.addWorksheet('寄せ方（文章）');
  s6.columns = [
    { header: 'コード', key: 'code', width: 10 },
    { header: '名前', key: 'name', width: 16 },
    { header: '本人の撮影日', key: 'at', width: 12 },
    { header: '目標', key: 'target', width: 18 },
    { header: '種類', key: 'kind', width: 18 },
    { header: '文章', key: 'text', width: 110 },
  ];
  for (const p of list) {
    const subject = pickYoseSubject(captures.filter(c => c.participant_token === p.token).map(c => ({ ...c, id: '' })));
    if (!subject?.metrics) continue;
    const bundle = buildYoseBundle(p.subjectCode, subject.metrics as unknown as PilotMetrics, refs.filter(r => r.token === p.token));
    const at = jstDate(subject.taken_at!);
    const ideal = bundle.results[0].result;
    for (const s of bundle.summary) {
      const ir = ideal.rows.find(x => x.id === s.id);
      s5.addRow({
        code: p.subjectCode, name: p.name, at, metric: s.label, verdict: s.verdict, dir: s.direction,
        by: Object.entries(s.byTarget).map(([n, d]) => `${n}：${d || '似ている'}`).join('／'),
        ideal: ir ? (ir.relation === 'same' ? '範囲内' : ir.direction) : '',
      });
    }
    for (const { result } of bundle.results) {
      s6.addRow({
        code: p.subjectCode, name: p.name, at, target: result.targetName,
        kind: result.targetKind === 'ideal' ? '黄金比' : REFERENCE_KIND_LABEL[result.targetKind], text: result.text,
      }).alignment = { vertical: 'top', wrapText: true };
    }
  }
  header(s5);
  header(s6);

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `ミスワールド_パイロット_${jstDate(new Date().toISOString())}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
