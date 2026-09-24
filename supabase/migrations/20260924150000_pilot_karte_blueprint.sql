/*
# Pilot: keep the face karte and the blueprint image (顔カルテ・顔の設計図を残す)

- pilot_records.karte: 顔カルテ（強み・顔印象タイプ・黄金比参考値・診断要約など。画像は含めない）
- pilot_records.blueprint_path: 写真に黄金比の線を重ねた設計図画像（storage: pilot-photos/<token>/..._blueprint.jpg）
- pilot_submit を置き換えて上の2つを保存する（保存先の検査は写真と同じ）
*/

ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS karte jsonb;
ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS blueprint_path text;

CREATE OR REPLACE FUNCTION pilot_submit(p_token text, p_record jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v pilot_participants%ROWTYPE;
  v_minor boolean;
  v_path text := nullif(p_record->>'image_path', '');
  v_bp text := nullif(p_record->>'blueprint_path', '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v FROM pilot_participants WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF NOT coalesce((p_record->>'consent')::boolean, false) THEN
    RAISE EXCEPTION 'consent required';
  END IF;

  -- 運営が未成年と登録した人は、本人の申告にかかわらず保護者同意が必要
  v_minor := coalesce(v.is_minor, false) OR coalesce((p_record->>'is_minor')::boolean, false);
  IF v_minor AND coalesce(p_record->>'guardian_name', '') = '' THEN
    RAISE EXCEPTION 'guardian consent required';
  END IF;

  IF (v_path IS NOT NULL AND split_part(v_path, '/', 1) <> v.token)
     OR (v_bp IS NOT NULL AND split_part(v_bp, '/', 1) <> v.token) THEN
    RAISE EXCEPTION 'invalid image path';
  END IF;

  INSERT INTO pilot_records (
    id, user_id, participant_token, subject_code, phase, taken_at, event, operator,
    consent, consent_by, guardian_name, is_minor,
    image_path, blueprint_path, image_width, image_height,
    guide, metrics, target_card, prescription, framing, karte, note, app_version
  ) VALUES (
    p_record->>'id', auth.uid(), v.token, v.subject_code, p_record->>'phase',
    (p_record->>'taken_at')::timestamptz, v.event, NULL,
    true, CASE WHEN v_minor THEN 'guardian' ELSE 'self' END,
    nullif(p_record->>'guardian_name', ''), v_minor,
    v_path, v_bp, (p_record->>'image_width')::int, (p_record->>'image_height')::int,
    p_record->'guide', p_record->'metrics', p_record->'target_card',
    p_record->'prescription', p_record->'framing', p_record->'karte',
    p_record->>'note', p_record->>'app_version'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION pilot_submit(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_submit(text, jsonb) TO authenticated;
