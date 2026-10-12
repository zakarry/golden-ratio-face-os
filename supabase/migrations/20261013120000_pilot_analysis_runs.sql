/*
# 分析の試算結果（数値だけ。写真は入れない）

運営ページの「分析」で、保存写真から測り直した試算の結果を残す（定義を変える前の比較用）。
スタッフだけが読み書き（is_pilot_staff）。
*/

CREATE TABLE IF NOT EXISTS pilot_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  result jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pilot_analysis_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot staff read analysis runs" ON pilot_analysis_runs;
CREATE POLICY "pilot staff read analysis runs" ON pilot_analysis_runs FOR SELECT TO authenticated USING (is_pilot_staff());

CREATE OR REPLACE FUNCTION public.pilot_staff_save_analysis(p_kind text, p_result jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'staff only'; END IF;
  INSERT INTO pilot_analysis_runs (kind, result, created_by)
  VALUES (p_kind, p_result, (SELECT email FROM auth.users WHERE id = auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_staff_save_analysis(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_staff_save_analysis(text, jsonb) TO authenticated;
REVOKE ALL ON pilot_analysis_runs FROM anon;
