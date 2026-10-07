/*
# Pilot: 設計図を2枚にする（バランス図＋寸法図）

- pilot_records.dimension_path：寸法図の画像（storage: pilot-photos/<token>/..._dimension.jpg）
- pilot_submit：寸法図の場所も保存する（保存先の検査は写真と同じ）
- pilot_lookup：本人の履歴に寸法図の場所も返す
- pilot_staff_set_images：運営ページで作り直した設計図・寸法図の場所を記録に書く（pilot_staff_set_blueprint を置き換え）
*/

ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS dimension_path text;

CREATE OR REPLACE FUNCTION pilot_submit(p_token text, p_record jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v pilot_participants%ROWTYPE;
  v_minor boolean;
  v_guardian text;
  v_path text := nullif(p_record->>'image_path', '');
  v_bp text := nullif(p_record->>'blueprint_path', '');
  v_dim text := nullif(p_record->>'dimension_path', '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v FROM pilot_participants WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF EXISTS (SELECT 1 FROM pilot_records WHERE id = p_record->>'id') THEN RETURN; END IF;
  IF (SELECT count(*) FROM pilot_records WHERE participant_token = v.token) >= 30 THEN
    RAISE EXCEPTION 'photo limit reached';
  END IF;
  IF v.consented_at IS NOT NULL THEN
    v_minor := coalesce(v.is_minor, false) OR v.consent_by = 'guardian';
    v_guardian := v.guardian_name;
  ELSE
    IF NOT coalesce((p_record->>'consent')::boolean, false) THEN RAISE EXCEPTION 'consent required'; END IF;
    v_minor := coalesce(v.is_minor, false) OR coalesce((p_record->>'is_minor')::boolean, false);
    v_guardian := nullif(p_record->>'guardian_name', '');
  END IF;
  IF v_minor AND coalesce(v_guardian, '') = '' THEN
    RAISE EXCEPTION 'guardian consent required';
  END IF;
  IF (v_path IS NOT NULL AND split_part(v_path, '/', 1) <> v.token)
     OR (v_bp IS NOT NULL AND split_part(v_bp, '/', 1) <> v.token)
     OR (v_dim IS NOT NULL AND split_part(v_dim, '/', 1) <> v.token) THEN
    RAISE EXCEPTION 'invalid image path';
  END IF;
  INSERT INTO pilot_records (
    id, user_id, participant_token, subject_code, phase, taken_at, event, operator,
    consent, consent_by, guardian_name, is_minor,
    image_path, blueprint_path, dimension_path, image_width, image_height,
    guide, metrics, target_card, prescription, framing, karte, note, app_version
  ) VALUES (
    p_record->>'id', auth.uid(), v.token, v.subject_code, p_record->>'phase',
    (p_record->>'taken_at')::timestamptz, v.event, NULL,
    true, CASE WHEN v_minor THEN 'guardian' ELSE 'self' END, v_guardian, v_minor,
    v_path, v_bp, v_dim, (p_record->>'image_width')::int, (p_record->>'image_height')::int,
    p_record->'guide', p_record->'metrics', p_record->'target_card',
    p_record->'prescription', p_record->'framing', p_record->'karte',
    p_record->>'note', p_record->>'app_version'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION pilot_submit(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_submit(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION pilot_lookup(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'subject_code', p.subject_code,
    'event', p.event,
    'is_minor', p.is_minor,
    'consented_at', p.consented_at,
    'consent_by', p.consent_by,
    'limit', 30,
    'count', (SELECT count(*) FROM pilot_records r WHERE r.participant_token = p.token),
    'history', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'phase', r.phase, 'taken_at', r.taken_at,
        'session_date', (r.taken_at AT TIME ZONE 'Asia/Tokyo')::date,
        'image_path', r.image_path, 'blueprint_path', r.blueprint_path, 'dimension_path', r.dimension_path,
        'metrics', r.metrics, 'target_card', r.target_card, 'prescription', r.prescription,
        'karte', r.karte, 'framing', r.framing
      ) ORDER BY r.taken_at)
      FROM pilot_records r WHERE r.participant_token = p.token
    ), '[]'::jsonb),
    'before', (
      SELECT jsonb_build_object('taken_at', r.taken_at, 'metrics', r.metrics)
      FROM pilot_records r WHERE r.participant_token = p.token AND r.phase = 'before'
      ORDER BY r.taken_at DESC LIMIT 1
    ),
    'has_after', EXISTS (SELECT 1 FROM pilot_records r WHERE r.participant_token = p.token AND r.phase = 'after')
  )
  FROM pilot_participants p
  WHERE p.token = p_token;
$$;

DROP FUNCTION IF EXISTS pilot_staff_set_blueprint(text, text);

CREATE OR REPLACE FUNCTION pilot_staff_set_images(p_id text, p_blueprint text, p_dimension text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r pilot_records%ROWTYPE;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO r FROM pilot_records WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'record not found'; END IF;
  IF (p_blueprint IS NOT NULL AND split_part(p_blueprint, '/', 1) <> r.participant_token)
     OR (p_dimension IS NOT NULL AND split_part(p_dimension, '/', 1) <> r.participant_token) THEN
    RAISE EXCEPTION 'invalid image path';
  END IF;
  UPDATE pilot_records SET
    blueprint_path = coalesce(blueprint_path, p_blueprint),
    dimension_path = coalesce(dimension_path, p_dimension)
  WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION pilot_staff_set_images(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_staff_set_images(text, text, text) TO authenticated;
