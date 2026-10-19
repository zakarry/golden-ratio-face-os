/*
# 完成イメージの素顔：運営がアップロードした本人の写真

pilot-photos/<token>/staff_source/ に置き、ブラウザで参照写真と同じ経路で測った12指標・写り・寸法を持つ。
完成イメージの比較基準としてだけ使う。pilot_records ではないので、本人の値（中央値）・要撮り直しには入らない。
参加者には見せない（pilot-media で弾く）。運営だけが読み書き（is_pilot_staff）。
*/

CREATE TABLE IF NOT EXISTS public.pilot_staff_sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text NOT NULL REFERENCES public.pilot_participants(token) ON DELETE CASCADE,
  subject_code text NOT NULL,
  image_path   text NOT NULL,          -- <token>/staff_source/...
  image_width  int NOT NULL,
  image_height int NOT NULL,
  metrics      jsonb NOT NULL,         -- 12指標（computePilotMetrics）
  framing      jsonb NOT NULL,         -- 写り（checkFraming）
  note         text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (image_path LIKE token || '/staff_source/%')
);

CREATE INDEX IF NOT EXISTS pilot_staff_sources_token_idx ON public.pilot_staff_sources(token, created_at DESC);

ALTER TABLE public.pilot_staff_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read staff sources" ON public.pilot_staff_sources;
CREATE POLICY "staff read staff sources" ON public.pilot_staff_sources FOR SELECT TO authenticated USING (public.is_pilot_staff());
DROP POLICY IF EXISTS "staff write staff sources" ON public.pilot_staff_sources;
CREATE POLICY "staff write staff sources" ON public.pilot_staff_sources FOR INSERT TO authenticated WITH CHECK (public.is_pilot_staff());

REVOKE ALL ON public.pilot_staff_sources FROM anon;
