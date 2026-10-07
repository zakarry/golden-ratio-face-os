// 顔の設計図を1枚の JPEG にする。
// 画面の BlueprintCanvas（SVG）を画像化する方式は iPhone で失敗しやすかったため、
// 写真の上に Canvas 2D で線を直接描く。画面の表示を測る必要もないので、運営ページでの作り直しにも使える。
// 大きな Canvas は使い終わったらすぐ 0×0 にしてメモリを返す（iPhone は Canvas に使えるメモリが少ない）。

import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { TriangleAnalysis } from '@/types/analysis';

const GOLD = 'rgba(201,169,110,';
const CHAMPAGNE = 'rgba(230,207,167,';
const WARM_WHITE = 'rgba(252,248,240,';

/** 使い終わった Canvas のメモリを返す */
export function releaseCanvas(c: HTMLCanvasElement | null | undefined) {
  if (c) { c.width = 0; c.height = 0; }
}

async function loadBitmap(src: string | Blob): Promise<ImageBitmap | HTMLImageElement> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* 下の方法で読む */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = url; });
  } finally { URL.revokeObjectURL(url); }
}

/**
 * 写真（data URL / URL / Blob）と顔の位置から設計図 JPEG（data URL）を作る。作れなければ null。
 * triangle は顔印象タイプの三角形（無ければ描かない）。
 */
export async function renderBlueprintJpeg(
  photo: string | Blob, guide: DetectedGuide, triangle: Pick<TriangleAnalysis, 'leftPupil' | 'rightPupil'> | null, maxSide = 900,
): Promise<string | null> {
  let canvas: HTMLCanvasElement | null = null;
  let bmp: ImageBitmap | HTMLImageElement | null = null;
  try {
    bmp = await loadBitmap(photo);
    const iw = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
    const ih = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
    const s = Math.min(1, maxSide / Math.max(iw, ih));
    const W = Math.round(iw * s), H = Math.round(ih * s);
    canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 写真（画面と同じ落ち着いたトーン。filter 非対応の端末は薄い色を重ねる）
    const hasFilter = typeof (ctx as { filter?: unknown }).filter === 'string';
    if (hasFilter) ctx.filter = 'saturate(0.45) contrast(1.08) brightness(0.88)';
    ctx.drawImage(bmp, 0, 0, W, H);
    if (hasFilter) ctx.filter = 'none';
    else { ctx.fillStyle = 'rgba(40,30,15,0.12)'; ctx.fillRect(0, 0, W, H); }

    drawOverlay(ctx, guide, triangle, W, H);

    const out = canvas.toDataURL('image/jpeg', 0.85);
    return out.startsWith('data:image/jpeg') ? out : null; // メモリ不足だと空の data URL が返ることがある
  } catch (e) {
    console.warn('[pilot] blueprint render failed', e);
    return null;
  } finally {
    releaseCanvas(canvas);
    if (bmp && 'close' in bmp) bmp.close();
  }
}

/** BlueprintCanvas の重ね描きと同じ要素を Canvas 2D で描く */
function drawOverlay(ctx: CanvasRenderingContext2D, g: DetectedGuide, ta: Pick<TriangleAnalysis, 'leftPupil' | 'rightPupil'> | null, W: number, H: number) {
  const k = Math.max(W, H) / 600;              // 画面表示（約600px）からの拡大率
  const px = (f: number) => f * W, py = (f: number) => f * H;
  const fs = (n: number) => `${Math.round(n * k)}px monospace`;

  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w = 1, dash?: number[]) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = w * k;
    ctx.setLineDash(dash ? dash.map(d => d * k) : []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const text = (x: number, y: number, s: string, color: string, size = 9, align: CanvasTextAlign = 'left', bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${fs(size)}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
  };
  const ring = (x: number, y: number, r: number, color: string, w = 1.5) => {
    ctx.beginPath(); ctx.setLineDash([]); ctx.strokeStyle = color; ctx.lineWidth = w * k; ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.stroke();
  };
  const dot = (x: number, y: number, r: number, color: string) => { ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r * k, 0, Math.PI * 2); ctx.fill(); };

  // 方眼（うすく）
  for (let x = 0; x < W; x += 20 * k) line(x, 0, x, H, `${CHAMPAGNE}0.06)`, 0.6);
  for (let y = 0; y < H; y += 20 * k) line(0, y, W, y, `${CHAMPAGNE}0.06)`, 0.6);

  const cx = px(g.centerLineX), fL = px(g.faceLeftX), fR = px(g.faceRightX), faceW = fR - fL;
  const topY = py(g.foreheadY), browY = py(g.eyebrowLineY), eyeY = py(g.eyeLineY), noseY = py(g.noseBaseLineY), lipY = py(g.lipLineY), chinY = py(g.chinLineY);
  const faceH = chinY - topY;
  const lineL = fL - faceW * 0.12, lineR = fR + faceW * 0.12;
  const PHI = 1.618, grW = faceH / PHI, grL = cx - grW / 2, grR = grL + grW;
  const mx = px(g.mouthCenterX), my = py(g.mouthCenterY);
  const lpx = px(g.leftPupilX), lpy = py(g.leftPupilY), rpx = px(g.rightPupilX), rpy = py(g.rightPupilY);

  // 顔の枠と四隅
  ctx.setLineDash([]); ctx.strokeStyle = `${GOLD}0.35)`; ctx.lineWidth = 1.5 * k; ctx.strokeRect(fL, topY, faceW, faceH);
  for (const [x, y] of [[fL, topY], [fR, topY], [fL, chinY], [fR, chinY]]) {
    line(x - 6 * k, y, x + 6 * k, y, `${CHAMPAGNE}0.8)`, 1.5); line(x, y - 6 * k, x, y + 6 * k, `${CHAMPAGNE}0.8)`, 1.5);
  }

  // 中心線
  line(cx, topY - 12 * k, cx, chinY + 12 * k, `${CHAMPAGNE}0.85)`, 1.5, [8, 4]);
  text(cx + 10 * k, topY - 6 * k, 'CENTER', `${GOLD}0.85)`);

  // 横の基準線
  const hz: Array<[number, string, string, number, number[]]> = [
    [topY, 'UPPER', CHAMPAGNE, 1.5, [4, 4]], [browY, 'BROW', GOLD, 1, [3, 5]], [eyeY, 'EYE', CHAMPAGNE, 1.5, [4, 4]],
    [noseY, 'NOSE', GOLD, 1, [3, 5]], [lipY, 'MOUTH', CHAMPAGNE, 1.5, [4, 4]], [chinY, 'LOWER', CHAMPAGNE, 1.5, [4, 4]],
  ];
  for (const [y, label, c, w, dash] of hz) {
    line(lineL, y, lineR, y, `${c}0.7)`, w, dash);
    line(lineL - 4 * k, y - 4 * k, lineL - 4 * k, y + 4 * k, `${GOLD}0.8)`, 1.5);
    line(lineR + 4 * k, y - 4 * k, lineR + 4 * k, y + 4 * k, `${GOLD}0.8)`, 1.5);
    text(lineR + 8 * k, y + 3 * k, label, `${CHAMPAGNE}0.85)`, 9, 'left', true);
  }
  // 縦三分割・横五分割
  for (const t of [1 / 3, 2 / 3]) line(grL - 8 * k, topY + faceH * t, grR + 8 * k, topY + faceH * t, `${GOLD}0.5)`, 1, [2, 4]);
  for (let i = 1; i <= 4; i++) { const x = fL + faceW / 5 * i; line(x, eyeY - 14 * k, x, eyeY + 14 * k, `${GOLD}0.5)`, 1, [2, 3]); }

  // 目と口の三角形
  if (ta) {
    const ax = px(ta.leftPupil.x), ay = py(ta.leftPupil.y), bx = px(ta.rightPupil.x), by = py(ta.rightPupil.y);
    ctx.beginPath(); ctx.setLineDash([]); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(mx, my); ctx.closePath();
    ctx.fillStyle = `${GOLD}0.06)`; ctx.fill(); ctx.strokeStyle = `${GOLD}0.7)`; ctx.lineWidth = 1.5 * k; ctx.stroke();
    text((ax + bx) / 2, ay - 4 * k, '△ TRI', `${GOLD}0.85)`, 9, 'center');
  }

  // 黄金比の枠
  ctx.setLineDash([6 * k, 4 * k]); ctx.strokeStyle = `${GOLD}0.55)`; ctx.lineWidth = 1.5 * k; ctx.strokeRect(grL, topY, grW, faceH);
  for (const [r, op] of [[0.382, 0.4], [0.5, 0.3], [0.618, 0.4], [0.75, 0.3]] as const) line(grL - 6 * k, topY + faceH * r, grR + 6 * k, topY + faceH * r, `${GOLD}${op})`, 1, [3, 5]);
  text(grL + grW / 2, topY - 4 * k, 'φ = 1.618', `${GOLD}0.9)`, 10, 'center', true);

  // 寸法線
  line(lineL - 10 * k, topY, lineL - 10 * k, chinY, `${CHAMPAGNE}0.7)`);
  ctx.save(); ctx.translate(lineL - 16 * k, topY + faceH / 2); ctx.rotate(-Math.PI / 2); text(0, 0, 'H: FACE', `${CHAMPAGNE}0.9)`, 9, 'center'); ctx.restore();
  line(fL, topY - 10 * k, fR, topY - 10 * k, `${CHAMPAGNE}0.7)`);
  text(cx, topY - 14 * k, 'W: FACE', `${CHAMPAGNE}0.9)`, 9, 'center');
  line(lpx, eyeY - 22 * k, rpx, eyeY - 22 * k, `${CHAMPAGNE}0.75)`);
  text((lpx + rpx) / 2, eyeY - 26 * k, 'Δ EYE', `${CHAMPAGNE}0.95)`, 9, 'center', true);
  line(cx + 18 * k, eyeY, cx + 18 * k, my, `${CHAMPAGNE}0.7)`);
  text(cx + 26 * k, (eyeY + my) / 2 + 3 * k, 'E↔M', `${CHAMPAGNE}0.9)`);

  // 目印：黒目・目頭目尻・口・顔の端・あご
  for (const [x, y, label] of [[lpx, lpy, 'L-EYE'], [rpx, rpy, 'R-EYE']] as const) {
    ring(x, y, 5, `${CHAMPAGNE}0.9)`); dot(x, y, 2, `${WARM_WHITE}0.9)`);
    line(x - 9 * k, y, x + 9 * k, y, `${CHAMPAGNE}0.6)`, 0.8); line(x, y - 9 * k, x, y + 9 * k, `${CHAMPAGNE}0.6)`, 0.8);
    text(x, y - 13 * k, label, `${CHAMPAGNE}0.9)`, 9, 'center');
  }
  for (const x of [px(g.leftEyeOuterX), px(g.leftEyeInnerX), px(g.rightEyeInnerX), px(g.rightEyeOuterX)]) { ring(x, eyeY, 3, `${GOLD}0.8)`, 1); dot(x, eyeY, 1, `${WARM_WHITE}0.8)`); }
  ring(mx, my, 5, `${CHAMPAGNE}0.9)`); dot(mx, my, 2, `${WARM_WHITE}0.9)`); text(mx + 12 * k, my + 3 * k, 'MOUTH', `${CHAMPAGNE}0.9)`);
  for (const [x, label] of [[fL, 'L-EDGE'], [fR, 'R-EDGE']] as const) { ring(x, eyeY, 3, `${GOLD}0.8)`, 1); text(x, eyeY + 16 * k, label, `${GOLD}0.8)`, 9, 'center'); }
  ring(cx, chinY, 4, `${CHAMPAGNE}0.9)`); text(cx, chinY + 18 * k, 'CHIN', `${CHAMPAGNE}0.9)`, 9, 'center');

  // 数値の箱（左下）
  ctx.setLineDash([]); ctx.fillStyle = 'rgba(40,30,15,0.75)'; ctx.fillRect(8 * k, H - 58 * k, 120 * k, 50 * k);
  ctx.strokeStyle = `${GOLD}0.5)`; ctx.lineWidth = k; ctx.strokeRect(8 * k, H - 58 * k, 120 * k, 50 * k);
  text(14 * k, H - 44 * k, 'MEASUREMENT', `${CHAMPAGNE}0.95)`, 9, 'left', true);
  text(14 * k, H - 32 * k, `H/W = ${(faceH / faceW).toFixed(3)}`, `${WARM_WHITE}0.8)`);
  text(14 * k, H - 20 * k, `φ   = ${PHI.toFixed(3)}`, `${WARM_WHITE}0.8)`);
  text(14 * k, H - 8 * k, `ΔE  = ${(Math.abs(rpx - lpx) / faceW * 100).toFixed(1)}%W`, `${WARM_WHITE}0.8)`);

  // 署名（右下）
  ctx.font = `${Math.round(8 * k)}px Georgia, serif`; ctx.fillStyle = `${CHAMPAGNE}0.55)`; ctx.textAlign = 'right';
  ctx.fillText('Face Identity Blueprint', W - 12 * k, H - 18 * k);
  ctx.fillText('Generated by Face OS', W - 12 * k, H - 8 * k);
}
