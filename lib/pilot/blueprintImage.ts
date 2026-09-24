// 顔の設計図（BlueprintCanvas の表示）を1枚の JPEG に焼き込む。
// 写真は元の解像度で描き、その上に画面の SVG オーバーレイを拡大して重ねる。

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const el = new Image(); el.onload = () => res(el); el.onerror = rej; el.src = src; });
}

/** container は BlueprintCanvas を包む要素。描けなければ null */
export async function renderBlueprintJpeg(container: HTMLElement | null, photoDataUrl: string, maxSide = 900): Promise<string | null> {
  try {
    const svg = container?.querySelector('svg');
    const shown = container?.querySelector('img');
    if (!svg || !shown || !shown.clientWidth || !shown.clientHeight) return null;

    // 容量節約のため長辺 maxSide px に縮める（1人30枚 × 40名で無料枠に収める）
    const photo = await loadImage(photoDataUrl);
    const s = Math.min(1, maxSide / Math.max(photo.naturalWidth, photo.naturalHeight));
    const W = Math.round(photo.naturalWidth * s), H = Math.round(photo.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    ctx.filter = 'saturate(0.45) contrast(1.08) brightness(0.88)'; // 画面と同じトーン（未対応の端末では無視される）
    ctx.drawImage(photo, 0, 0, W, H);
    ctx.filter = 'none';

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(W));
    clone.setAttribute('height', String(H));
    const xml = new XMLSerializer().serializeToString(clone);
    const overlay = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
    ctx.drawImage(overlay, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    console.warn('[pilot] blueprint render failed', e);
    return null;
  }
}
