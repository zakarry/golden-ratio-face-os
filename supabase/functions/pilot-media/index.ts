// 参加者が自分の過去の写真・設計図を見るための署名付きURLを出す。
// 本人の専用リンクのトークンを受け取り、そのトークンのフォルダ内のパスだけに URL を発行する（10分有効）。

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { token?: unknown; paths?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : [];
  if (!/^[0-9a-f]{16}$/.test(token) || paths.length === 0 || paths.length > 80) return json({ error: 'bad request' }, 400);
  if (paths.some(p => !p.startsWith(`${token}/`) || p.includes('..'))) return json({ error: 'forbidden' }, 403);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: participant } = await admin.from('pilot_participants').select('token').eq('token', token).maybeSingle();
  if (!participant) return json({ error: 'not found' }, 404);

  const { data, error } = await admin.storage.from('pilot-photos').createSignedUrls(paths, 600);
  if (error) return json({ error: error.message }, 500);
  return json({ urls: Object.fromEntries((data ?? []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) });
});
