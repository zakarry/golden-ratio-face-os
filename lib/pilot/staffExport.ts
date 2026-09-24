// 運営ページの Excel 書き出し（シート「一覧」＝1人1行、「撮影ごと」＝1枚1行）
// exceljs はボタンを押したときだけ読み込む。

import { getSupabaseClient } from '@/lib/supabaseClient';
import { METRIC_DEFS } from './targetCard';
import { staffMediaUrls, type ParticipantSummary } from './staff';

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

const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const jstDate = (iso: string) => jst(iso).slice(0, 10);
const jstTime = (iso: string) => jst(iso).slice(11, 16);

interface CaptureRow {
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
}

async function fetchCaptures(): Promise<CaptureRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const rows: CaptureRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('pilot_records')
      .select('participant_token, phase, taken_at, framing, metrics, actionable:target_card->actionableCount, headline:prescription->>headline, tri:karte->triangleAnalysis->>label, strengths:karte->strengths, gr:karte->goldenRatio, image_path, blueprint_path')
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
    code: p.subjectCode, minor: p.isMinor ? '未成年' : '',
    consent: p.consentedAt ? (p.consentBy === 'guardian' ? '保護者' : '本人') : '未',
    consentAt: p.consentedAt ? jstDate(p.consentedAt) : '',
    sessions: p.sessions, count: p.count, before: p.beforeCount, after: p.afterCount,
    last: p.lastAt ? jstDate(p.lastAt) : '',
    url: `${origin}/?p=${p.token}&openExternalBrowser=1`,
  }));
  header(s1);

  // ── 撮影ごと
  const codeOf = new Map(list.map(p => [p.token, p.subjectCode]));
  const s2 = wb.addWorksheet('撮影ごと');
  const withImages = !!opts.withImages;
  s2.columns = [
    { header: 'コード', key: 'code', width: 10 },
    ...(withImages ? [{ header: '写真', key: 'imgPhoto', width: 18 }, { header: '顔の設計図', key: 'imgBp', width: 18 }] : []),
    { header: '回', key: 'no', width: 5 },
    { header: '撮影日', key: 'date', width: 12 },
    { header: '時刻', key: 'time', width: 7 },
    { header: '段階', key: 'phase', width: 9 },
    { header: '写りOK', key: 'ok', width: 7 },
    { header: '写りの注意', key: 'warn', width: 28 },
    { header: '設計図', key: 'bp', width: 7 },
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
    const paths = sorted.flatMap(c => [c.image_path, c.blueprint_path]).filter((p): p is string => !!p);
    const urls: Record<string, string> = {};
    for (let i = 0; i < paths.length; i += 100) Object.assign(urls, await staffMediaUrls(paths.slice(i, i + 100)));
    await mapLimit(paths, 6, async p => { thumbs.set(p, urls[p] ? await thumbnail(urls[p]) : null); },
      n => opts.onProgress?.(`画像を取得中 ${n}/${paths.length}`));
    opts.onProgress?.('Excelを作成中…');
  }

  sorted.forEach(c => {
      const row: Record<string, unknown> = {
        code: codeOf.get(c.participant_token) ?? '', no: sessionNo.get(c.participant_token)?.get(jstDate(c.taken_at)),
        date: jstDate(c.taken_at), time: jstTime(c.taken_at), phase: c.phase === 'before' ? 'メイク前' : 'メイク後',
        ok: c.framing?.ok === false ? '×' : '○', warn: (c.framing?.warnings ?? []).join('・'), bp: c.blueprint_path ? 'あり' : '',
        tri: c.tri ?? '', strengths: (c.strengths ?? []).join('、'),
        grFace: c.gr?.faceRatio ?? '', grEye: c.gr?.eyePosition ?? '', grMouth: c.gr?.mouthPosition ?? '',
        actionable: c.actionable ?? '', rx: c.headline ?? '',
      };
      METRIC_DEFS.forEach(d => { const v = c.metrics?.[d.id]; row[`m_${d.id}`] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : ''; });
      const added = s2.addRow(row);
      if (withImages) {
        added.height = THUMB_H * 0.75 + 6; // 行の高さはポイント（px×0.75）
        added.alignment = { vertical: 'top', wrapText: true };
        ([['imgPhoto', c.image_path], ['imgBp', c.blueprint_path]] as const).forEach(([key, path]) => {
          const t = path ? thumbs.get(path) : null;
          if (!t) return;
          const id = wb.addImage({ base64: t.base64, extension: 'jpeg' });
          const col = s2.getColumn(key).number - 1;
          s2.addImage(id, { tl: { col: col + 0.05, row: added.number - 1 + 0.03 }, ext: { width: t.w, height: t.h } });
        });
      }
    });
  header(s2);

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `ミスワールド_パイロット_${jstDate(new Date().toISOString())}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
