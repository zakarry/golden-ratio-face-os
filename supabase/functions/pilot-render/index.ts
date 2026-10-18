// 完成イメージを画像生成APIで作る（運営専用）。
// 入力：参加者トークン、素顔写真のパス（<token>/...）、指示文、エンジン（gemini / openai）
// 出力：生成画像を <token>/render/ に保存し、そのパスと署名付きURLを返す。
// 測定（MediaPipe）はブラウザ側で行う（参照写真の測定と同じ measureReferenceImage を使う）。
// APIキーは Supabase の secrets（GEMINI_API_KEY / OPENAI_API_KEY）。コードにもクライアントにも出さない。
// { action: 'status' } で、どちらのキーが入っているかだけを返す（ボタンの有効・無効に使う）。

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// 2026-10-18 時点の現行モデル。env で上書きできる
// Gemini：2.5 Flash Image は legacy 扱い（2027-03 以降に終了予定）なので 3.1 Flash Image を既定に
// OpenAI：GPT Image 2.5 は幅×高さを指定できる（元写真と同じ縦横比で出させる）。編集の精度重視の sunburst
const GEMINI_MODEL = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3.1-flash-image';
const OPENAI_MODEL = Deno.env.get('OPENAI_IMAGE_MODEL') ?? 'gpt-image-2.5-sunburst';

// ポリシーで弾かれた時の言い換え（ChatGPT で実際に通った形）
const SOFTEN: [RegExp, string][] = [
  [/ミスコンテスト/g, '公式サイト'],
  [/コンテスト/g, '公式'],
  [/舞台用で、客席から見て分かる強さで。/g, '公式のプロフィール写真用で、凛として知的な印象に。'],
  [/華やかにはっきりと/g, 'はっきりと上品に'],
];
const soften = (p: string) => SOFTEN.reduce((s, [re, to]) => s.replace(re, to), p);

// 大きな画像で String.fromCharCode(...bytes) は落ちるので分けて変換する
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** 先頭のバイトから画像の種類を決める（モデルが PNG 以外を返すことがある） */
function sniff(b: Uint8Array): { mime: string; ext: string } {
  if (b[0] === 0x89 && b[1] === 0x50) return { mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/png', ext: 'png' };
}

class GenError extends Error { constructor(msg: string, public policy = false) { super(msg); } }

async function genGemini(key: string, prompt: string, imgB64: string, mime: string): Promise<Uint8Array> {
  // 画像＋テキスト → 画像。キーは URL ではなくヘッダーで渡す（ログに残さない）
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: imgB64 } }, { text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new GenError(`gemini ${res.status}: ${t.slice(0, 300)}`, /safety|blocked|prohibited/i.test(t));
  }
  const j = await res.json();
  const cand = j?.candidates?.[0];
  const part = cand?.content?.parts?.find((p: any) => p.inlineData || p.inline_data);
  const data = part?.inlineData?.data ?? part?.inline_data?.data;
  if (!data) {
    const why = j?.promptFeedback?.blockReason ?? cand?.finishReason ?? 'unknown';
    throw new GenError(`gemini: 画像が返りませんでした（${why}）`, /SAFETY|PROHIBITED|BLOCK|IMAGE_OTHER|OTHER/i.test(String(why)));
  }
  return fromBase64(data);
}

/** 元写真と同じ縦横比のサイズ（16の倍数・長辺 1536・比は 1:3〜3:1 に収める） */
function openaiSize(w?: number, h?: number): string {
  if (!w || !h) return 'auto';
  const r = Math.min(3, Math.max(1 / 3, w / h));
  const long = 1536;
  const [W, H] = r >= 1 ? [long, long / r] : [long * r, long];
  return `${Math.round(W / 16) * 16}x${Math.round(H / 16) * 16}`;
}

async function genOpenAI(key: string, prompt: string, img: Uint8Array, mime: string, w?: number, h?: number): Promise<Uint8Array> {
  const fd = new FormData();
  fd.append('model', OPENAI_MODEL);
  fd.append('prompt', prompt);
  fd.append('image', new Blob([img], { type: mime }), 'source.' + (mime.includes('png') ? 'png' : 'jpg'));
  // gpt-image-1 系は 'auto' のみ確実。2.5 系は元と同じ縦横比を指定する（出力寸法はクライアントでも必ず確認する）
  fd.append('size', OPENAI_MODEL.startsWith('gpt-image-1') ? 'auto' : openaiSize(w, h));
  if (OPENAI_MODEL.startsWith('gpt-image-1')) fd.append('input_fidelity', 'high');
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new GenError(`openai ${res.status}: ${t.slice(0, 300)}`, res.status === 400 && /safety|policy|moderation/i.test(t));
  }
  const j = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new GenError('openai: 画像が返りませんでした');
  return fromBase64(b64);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // 運営だけ：DB の is_pilot_staff()（許可リスト＋メール確認済み＋匿名でない）で確認
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: isStaff, error: staffErr } = await asUser.rpc('is_pilot_staff');
  if (staffErr || isStaff !== true) return json({ error: 'forbidden' }, 403);

  let body: { action?: string; token?: string; sourcePath?: string; prompt?: string; engine?: 'gemini' | 'openai'; label?: string; width?: number; height?: number };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }

  if (body.action === 'status') {
    return json({ gemini: !!Deno.env.get('GEMINI_API_KEY'), openai: !!Deno.env.get('OPENAI_API_KEY'), models: { gemini: GEMINI_MODEL, openai: OPENAI_MODEL } });
  }

  const { token, sourcePath, prompt, engine } = body;
  const label = /^[a-z]{2,10}$/.test(body.label ?? '') ? body.label : 'render';
  if (!token || !/^[0-9a-f]{16}$/.test(token) || !sourcePath?.startsWith(`${token}/`) || sourcePath.includes('..')
    || !prompt || prompt.length > 8000 || (engine !== 'gemini' && engine !== 'openai')) return json({ error: 'bad request' }, 400);

  const key = engine === 'gemini' ? Deno.env.get('GEMINI_API_KEY') : Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: `${engine === 'gemini' ? 'Gemini' : 'OpenAI'} の API キーが未設定です（Supabase secrets）` }, 503);

  // 素顔を取得
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: src, error: dlErr } = await admin.storage.from('pilot-photos').download(sourcePath);
  if (dlErr || !src) return json({ error: '素顔の写真が見つかりません' }, 404);
  const srcBytes = new Uint8Array(await src.arrayBuffer());
  const mime = sniff(srcBytes).mime;
  const b64 = toBase64(srcBytes);
  const run = (p: string) => engine === 'gemini' ? genGemini(key, p, b64, mime) : genOpenAI(key, p, srcBytes, mime, body.width, body.height);

  // 生成（ポリシー弾きは一度だけ言い換えて再試行）
  let out: Uint8Array; let usedPrompt = prompt; let retried = false;
  try {
    out = await run(prompt);
  } catch (e) {
    if (!(e instanceof GenError && e.policy)) return json({ error: String((e as Error)?.message ?? e) }, 502);
    usedPrompt = soften(prompt); retried = true;
    try { out = await run(usedPrompt); }
    catch (e2) { return json({ error: `言い換えても生成できませんでした：${String((e2 as Error)?.message ?? e2)}`, retried }, 502); }
  }

  // 保存
  const kind = sniff(out);
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const path = `${token}/render/${engine}_${label}_${ts}_${crypto.randomUUID().slice(0, 8)}.${kind.ext}`;
  const { error: upErr } = await admin.storage.from('pilot-photos').upload(path, out, { contentType: kind.mime, upsert: false });
  if (upErr) return json({ error: upErr.message }, 500);
  const { data: signed } = await admin.storage.from('pilot-photos').createSignedUrl(path, 600);
  return json({ path, url: signed?.signedUrl, usedPrompt, retried, model: engine === 'gemini' ? GEMINI_MODEL : OPENAI_MODEL });
});
