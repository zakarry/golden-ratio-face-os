/*
# Pilot: self-capture by participants (本人が自分のスマホで撮る)

Participants open a personal URL (?p=<token>) and capture "before" (no makeup)
and "after" on their own phones. The token is the only credential.

## Changes
- New table `pilot_participants` (token → subject_code, event, is_minor).
  RLS on, no policies: participants cannot list or read it.
- `pilot_records`: adds participant_token / consent_by / guardian_name / is_minor.
  All direct SELECT / INSERT / UPDATE policies are removed. Participants write
  only through `pilot_submit(token, record)` and read only their own summary
  through `pilot_lookup(token)`. Staff read everything in the dashboard.
- Storage `pilot-photos`: participants may only INSERT under a folder named
  after a valid token. No SELECT / UPDATE, so nobody can view or overwrite
  another person's photo from the app.

## Issuing URLs (run in SQL Editor)
  insert into pilot_participants (subject_code, is_minor) values
    ('F01', false), ('F02', true)
  on conflict do nothing;

  select subject_code, is_minor,
         'https://golden-ratio-face-ba-0nxl.bolt.host/?p=' || token as url
  from pilot_participants order by subject_code;
*/

CREATE TABLE IF NOT EXISTS pilot_participants (
  token text PRIMARY KEY DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  subject_code text NOT NULL,
  event text NOT NULL DEFAULT 'MWJ2026-pilot',
  is_minor boolean,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event, subject_code)
);

ALTER TABLE pilot_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS participant_token text REFERENCES pilot_participants(token);
ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS consent_by text;
ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS guardian_name text;
ALTER TABLE pilot_records ADD COLUMN IF NOT EXISTS is_minor boolean;
CREATE INDEX IF NOT EXISTS pilot_records_token_idx ON pilot_records(participant_token, phase);

-- 直接の読み書きは閉じる（RPC 経由のみ）
DROP POLICY IF EXISTS "pilot select any signed-in" ON pilot_records;
DROP POLICY IF EXISTS "pilot insert own" ON pilot_records;
DROP POLICY IF EXISTS "pilot update own" ON pilot_records;

-- 本人のコード・前の記録の有無（前の測定値は照合用に返す。写真は返さない）
CREATE OR REPLACE FUNCTION pilot_lookup(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'subject_code', p.subject_code,
    'event', p.event,
    'is_minor', p.is_minor,
    'before', (
      SELECT jsonb_build_object('taken_at', r.taken_at, 'metrics', r.metrics)
      FROM pilot_records r
      WHERE r.participant_token = p.token AND r.phase = 'before'
      ORDER BY r.taken_at DESC LIMIT 1
    ),
    'has_after', EXISTS (
      SELECT 1 FROM pilot_records r WHERE r.participant_token = p.token AND r.phase = 'after'
    )
  )
  FROM pilot_participants p
  WHERE p.token = p_token;
$$;

CREATE OR REPLACE FUNCTION pilot_submit(p_token text, p_record jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v pilot_participants%ROWTYPE;
  v_minor boolean;
  v_path text := nullif(p_record->>'image_path', '');
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

  IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> v.token THEN
    RAISE EXCEPTION 'invalid image path';
  END IF;

  INSERT INTO pilot_records (
    id, user_id, participant_token, subject_code, phase, taken_at, event, operator,
    consent, consent_by, guardian_name, is_minor,
    image_path, image_width, image_height,
    guide, metrics, target_card, prescription, framing, note, app_version
  ) VALUES (
    p_record->>'id', auth.uid(), v.token, v.subject_code, p_record->>'phase',
    (p_record->>'taken_at')::timestamptz, v.event, NULL,
    true, CASE WHEN v_minor THEN 'guardian' ELSE 'self' END,
    nullif(p_record->>'guardian_name', ''), v_minor,
    v_path, (p_record->>'image_width')::int, (p_record->>'image_height')::int,
    p_record->'guide', p_record->'metrics', p_record->'target_card',
    p_record->'prescription', p_record->'framing',
    p_record->>'note', p_record->>'app_version'
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION pilot_token_exists(p_token text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM pilot_participants WHERE token = p_token);
$$;

REVOKE ALL ON FUNCTION pilot_lookup(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION pilot_submit(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION pilot_token_exists(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_lookup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pilot_submit(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION pilot_token_exists(text) TO authenticated;

-- Storage: 有効なトークンのフォルダにだけ「追加」できる。閲覧・上書きは不可
DROP POLICY IF EXISTS "pilot photos insert" ON storage.objects;
DROP POLICY IF EXISTS "pilot photos update" ON storage.objects;
DROP POLICY IF EXISTS "pilot photos select" ON storage.objects;

DROP POLICY IF EXISTS "pilot photos insert via token" ON storage.objects;
CREATE POLICY "pilot photos insert via token"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pilot-photos'
    AND public.pilot_token_exists((storage.foldername(name))[1])
  );
