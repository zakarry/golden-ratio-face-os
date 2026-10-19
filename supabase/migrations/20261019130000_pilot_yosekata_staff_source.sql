/*
# 寄せ方の「本人」に、運営がアップロードした写真を使えるようにする

撮影の場で運営が撮り直した写真から寄せ方を計算・保存し、完成イメージの寄せ先に使うため。
- pilot_yosekata：record_id（撮影記録）か staff_source_id（運営の写真）のどちらかを持つ
- 本人の値（記録の中央値）・要撮り直しの判定は今までどおり記録だけ。運営の写真は、選んだときだけ本人として使う
- pilot_staff_sources に顔の位置（guide）を持たせる（寄せ方欄で写真に三角形を描くため）
*/

ALTER TABLE public.pilot_staff_sources ADD COLUMN IF NOT EXISTS guide jsonb;

ALTER TABLE public.pilot_yosekata ALTER COLUMN record_id DROP NOT NULL;
ALTER TABLE public.pilot_yosekata ADD COLUMN IF NOT EXISTS staff_source_id uuid REFERENCES public.pilot_staff_sources(id) ON DELETE CASCADE;
ALTER TABLE public.pilot_yosekata DROP CONSTRAINT IF EXISTS pilot_yosekata_subject_source_check;
ALTER TABLE public.pilot_yosekata ADD CONSTRAINT pilot_yosekata_subject_source_check CHECK (record_id IS NOT NULL OR staff_source_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.pilot_staff_save_yosekata_src(
  p_id text, p_staff_source_id uuid, p_reference_id text, p_target_kind text, p_target_name text,
  p_result jsonb, p_text text, p_version text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'staff only'; END IF;
  SELECT subject_code INTO v_code FROM pilot_staff_sources WHERE id = p_staff_source_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'staff source not found'; END IF;
  INSERT INTO pilot_yosekata (id, record_id, staff_source_id, subject_code, reference_id, target_kind, target_name, result, text, version, created_by)
  VALUES (p_id, NULL, p_staff_source_id, v_code, nullif(p_reference_id,''), p_target_kind, p_target_name, p_result, p_text, p_version,
          (SELECT email FROM auth.users WHERE id = auth.uid()))
  ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, text = EXCLUDED.text, version = EXCLUDED.version, created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.pilot_staff_save_yosekata_src(text, uuid, text, text, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_staff_save_yosekata_src(text, uuid, text, text, text, jsonb, text, text) TO authenticated;
