/*
# 完成イメージ（AI生成）の記録。運営専用。参加者には見せない。

生成した画像は1枚ずつ candidate で残し、運営が採用／不採用と症例一行をつける。
採用は参加者×用途ごとに1枚（採用を押すと同じ用途の他の採用は candidate に戻す。画面側で行う）。
画像は pilot-photos/<token>/render/ に置く（参加者用の pilot-media からは出さない）。
*/

CREATE TABLE IF NOT EXISTS public.pilot_renders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text NOT NULL REFERENCES public.pilot_participants(token) ON DELETE CASCADE,
  subject_code   text NOT NULL,
  engine         text NOT NULL CHECK (engine IN ('gemini','openai','manual')),
  model          text,                 -- 生成に使ったモデル名
  purpose        text NOT NULL CHECK (purpose IN ('hp','portrait','stage','other')),
  target_name    text,                 -- 寄せ先（記録用。プロンプトには入れない）
  source_path    text NOT NULL,        -- 素顔の画像パス
  image_path     text NOT NULL,        -- 生成画像のパス（<token>/render/...）
  image_width    int,
  image_height   int,
  prompt         text NOT NULL,
  prompt_version text,                 -- renderPrompt の版
  metrics        jsonb,                -- 生成画像の12指標（ブラウザで測定）
  source_metrics jsonb,                -- 素顔の12指標
  diffs          jsonb,                -- {eyeDist:{diff,ratio}, ...} ratio=許容幅の何倍
  max_ratio      numeric,              -- 7項目の最大倍率
  skeleton_ok    boolean,              -- 全項目 ≤1.0 か
  aspect_ok      boolean,              -- 縦横比が素顔と±2%以内か
  decision       text NOT NULL DEFAULT 'candidate' CHECK (decision IN ('adopted','rejected','candidate')),
  note           text,                 -- 症例一行（運営が書く）
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_renders_subject_idx ON public.pilot_renders(subject_code, created_at DESC);
CREATE INDEX IF NOT EXISTS pilot_renders_token_idx ON public.pilot_renders(token, purpose);

ALTER TABLE public.pilot_renders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read renders" ON public.pilot_renders;
CREATE POLICY "staff read renders" ON public.pilot_renders FOR SELECT TO authenticated USING (public.is_pilot_staff());
DROP POLICY IF EXISTS "staff write renders" ON public.pilot_renders;
CREATE POLICY "staff write renders" ON public.pilot_renders FOR INSERT TO authenticated WITH CHECK (public.is_pilot_staff());
DROP POLICY IF EXISTS "staff update renders" ON public.pilot_renders;
CREATE POLICY "staff update renders" ON public.pilot_renders FOR UPDATE TO authenticated USING (public.is_pilot_staff()) WITH CHECK (public.is_pilot_staff());

REVOKE ALL ON public.pilot_renders FROM anon;
