/*
# 寄せ方シートの保存（カルテに日付つきで積む）

pilot_yosekata：撮影記録(pilot_records.id) × 目標（黄金比 or pilot_reference_people.id）で1行。
表示のたびに計算し直すのではなく、計算した結果（rows・text・config）を残す。
許容幅や強さの規則は校正で変わるので config に版を持たせる。
スタッフだけが読み書き（is_pilot_staff）。
*/

CREATE TABLE IF NOT EXISTS pilot_yosekata (
  id text PRIMARY KEY,
  record_id text NOT NULL REFERENCES pilot_records(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  -- ideal のときは NULL
  reference_id text REFERENCES pilot_reference_people(id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('ideal','self_happy','others_say','dislike')),
  target_name text NOT NULL,
  result jsonb NOT NULL,
  text text NOT NULL,
  version text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_yosekata_subject_idx ON pilot_yosekata(subject_code, created_at DESC);
CREATE INDEX IF NOT EXISTS pilot_yosekata_record_idx ON pilot_yosekata(record_id);

ALTER TABLE pilot_yosekata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot staff read yosekata" ON pilot_yosekata;
CREATE POLICY "pilot staff read yosekata" ON pilot_yosekata FOR SELECT TO authenticated USING (is_pilot_staff());

CREATE OR REPLACE FUNCTION public.pilot_staff_save_yosekata(
  p_id text, p_record_id text, p_reference_id text, p_target_kind text, p_target_name text,
  p_result jsonb, p_text text, p_version text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'staff only'; END IF;
  SELECT subject_code INTO v_code FROM pilot_records WHERE id = p_record_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'record not found'; END IF;
  INSERT INTO pilot_yosekata (id, record_id, subject_code, reference_id, target_kind, target_name, result, text, version, created_by)
  VALUES (p_id, p_record_id, v_code, nullif(p_reference_id,''), p_target_kind, p_target_name, p_result, p_text, p_version,
          (SELECT email FROM auth.users WHERE id = auth.uid()))
  ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, text = EXCLUDED.text, version = EXCLUDED.version, created_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.pilot_staff_save_yosekata(text, text, text, text, text, jsonb, text, text) TO authenticated;

-- 匿名（参加者）からは呼べないようにする（スタッフ確認は関数内でも行う）
REVOKE ALL ON FUNCTION public.pilot_staff_save_yosekata(text, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE ALL ON pilot_yosekata FROM anon;
