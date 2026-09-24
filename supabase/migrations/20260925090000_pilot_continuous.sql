/*
# Pilot: continuous capture + staff view (継続撮影・運営画面)

- 参加者は期間中に何度でも撮影できる（1人30枚まで）。撮影日（日本時間）ごとに「第n回」としてまとめる
- 同意は参加者ごとに1回だけ記録する（pilot_participants.consented_at）。既存の記録から引き継ぐ
- pilot_lookup が本人の全履歴を返す（写真は返さない。画像は Edge Function pilot-media の署名付きURLで見る）
- スタッフ：許可リスト pilot_staff のメールでログインした人だけが、全員の記録と写真を読める
*/

-- ── スタッフ ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pilot_staff (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pilot_staff ENABLE ROW LEVEL SECURITY;

INSERT INTO pilot_staff (email) VALUES
  ('zak25g@gmail.com'),
  ('uchino@kooint.co.jp'),
  ('chocona2011@gmail.com'),
  ('yuka.1109.0701@gmail.com'),
  ('morikawa@kooint.co.jp'),
  ('hijikata@mw-japan.com')
ON CONFLICT DO NOTHING;

-- メール確認済みで、許可リストにあるユーザーだけ（匿名ユーザーは不可）
CREATE OR REPLACE FUNCTION is_pilot_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN pilot_staff s ON lower(s.email) = lower(u.email)
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL AND NOT coalesce(u.is_anonymous, false)
  );
$$;
REVOKE ALL ON FUNCTION is_pilot_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_pilot_staff() TO authenticated;

DROP POLICY IF EXISTS "pilot staff read participants" ON pilot_participants;
CREATE POLICY "pilot staff read participants"
  ON pilot_participants FOR SELECT TO authenticated USING (is_pilot_staff());

DROP POLICY IF EXISTS "pilot staff read records" ON pilot_records;
CREATE POLICY "pilot staff read records"
  ON pilot_records FOR SELECT TO authenticated USING (is_pilot_staff());

DROP POLICY IF EXISTS "pilot staff read photos" ON storage.objects;
CREATE POLICY "pilot staff read photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pilot-photos' AND public.is_pilot_staff());

-- ── 同意（参加者ごとに1回） ───────────────────────────────
ALTER TABLE pilot_participants ADD COLUMN IF NOT EXISTS consented_at timestamptz;
ALTER TABLE pilot_participants ADD COLUMN IF NOT EXISTS consent_by text;
ALTER TABLE pilot_participants ADD COLUMN IF NOT EXISTS guardian_name text;

-- 既存の記録の同意を引き継ぐ（最初の記録の時点で同意済み）
UPDATE pilot_participants p SET
  consented_at = f.taken_at, consent_by = f.consent_by, guardian_name = f.guardian_name
FROM (
  SELECT DISTINCT ON (participant_token) participant_token, taken_at, consent_by, guardian_name
  FROM pilot_records WHERE participant_token IS NOT NULL AND consent
  ORDER BY participant_token, taken_at
) f
WHERE p.token = f.participant_token AND p.consented_at IS NULL;

CREATE OR REPLACE FUNCTION pilot_consent(p_token text, p_is_minor boolean, p_guardian_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v pilot_participants%ROWTYPE;
  v_minor boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v FROM pilot_participants WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;
  v_minor := coalesce(v.is_minor, false) OR coalesce(p_is_minor, false);
  IF v_minor AND coalesce(trim(p_guardian_name), '') = '' THEN
    RAISE EXCEPTION 'guardian consent required';
  END IF;
  UPDATE pilot_participants SET
    consented_at = now(),
    consent_by = CASE WHEN v_minor THEN 'guardian' ELSE 'self' END,
    guardian_name = CASE WHEN v_minor THEN trim(p_guardian_name) ELSE NULL END,
    is_minor = CASE WHEN v_minor THEN true ELSE is_minor END
  WHERE token = p_token;
END;
$$;
REVOKE ALL ON FUNCTION pilot_consent(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_consent(text, boolean, text) TO authenticated;

-- ── 本人の情報と全履歴 ───────────────────────────────────
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
        'image_path', r.image_path, 'blueprint_path', r.blueprint_path,
        'metrics', r.metrics, 'target_card', r.target_card, 'prescription', r.prescription,
        'karte', r.karte, 'framing', r.framing
      ) ORDER BY r.taken_at)
      FROM pilot_records r WHERE r.participant_token = p.token
    ), '[]'::jsonb),
    -- 旧画面との互換
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

-- ── 送信（同意は参加者の記録を使い、30枚までに制限） ─────────
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;

  SELECT * INTO v FROM pilot_participants WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;

  -- 再送（同じ id）は数えずに素通り
  IF EXISTS (SELECT 1 FROM pilot_records WHERE id = p_record->>'id') THEN RETURN; END IF;

  IF (SELECT count(*) FROM pilot_records WHERE participant_token = v.token) >= 30 THEN
    RAISE EXCEPTION 'photo limit reached';
  END IF;

  IF v.consented_at IS NOT NULL THEN
    v_minor := coalesce(v.is_minor, false) OR v.consent_by = 'guardian';
    v_guardian := v.guardian_name;
  ELSE
    -- 旧画面からの送信（記録ごとの同意）
    IF NOT coalesce((p_record->>'consent')::boolean, false) THEN RAISE EXCEPTION 'consent required'; END IF;
    v_minor := coalesce(v.is_minor, false) OR coalesce((p_record->>'is_minor')::boolean, false);
    v_guardian := nullif(p_record->>'guardian_name', '');
  END IF;
  IF v_minor AND coalesce(v_guardian, '') = '' THEN
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
    true, CASE WHEN v_minor THEN 'guardian' ELSE 'self' END, v_guardian, v_minor,
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
