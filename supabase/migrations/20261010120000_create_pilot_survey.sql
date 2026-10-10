/*
# 事前アンケート（本人の自己認識）と「似ている人」参照データ

## pilot_survey
参加者ごとに1行（token で upsert）。回答は answers jsonb に質問IDごとに持つ。
## pilot_reference_people
参加者が挙げた「似ている人」1人につき1行。写真は pilot-photos の <token>/survey/ 配下。
metrics はスタッフが測定して後から入れる（本人の設計図と並べるための12指標）。
写真は測定後に削除してよい（image_path を null にし、metrics と source_note だけ残す）。

## アクセス
参加者：token 付き RPC（pilot_survey_get / pilot_survey_submit）のみ。既存の pilot_submit と同じ方式。
スタッフ：is_pilot_staff() で SELECT、参照データの metrics 更新は RPC。
*/

CREATE TABLE IF NOT EXISTS pilot_survey (
  token text PRIMARY KEY REFERENCES pilot_participants(token) ON DELETE CASCADE,
  subject_code text NOT NULL,
  event text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pilot_reference_people (
  id text PRIMARY KEY,
  token text NOT NULL REFERENCES pilot_participants(token) ON DELETE CASCADE,
  subject_code text NOT NULL,
  /** self_happy = 言われると嬉しい人 / others_say = 周りが言う人 / dislike = 言われて嫌だった人 */
  kind text NOT NULL CHECK (kind IN ('self_happy','others_say','dislike')),
  person_name text NOT NULL,
  image_path text,
  image_width integer,
  image_height integer,
  /** スタッフが測定した12指標（computePilotMetrics と同じキー） */
  metrics jsonb,
  framing jsonb,
  measured_at timestamptz,
  measured_by text,
  /** 写真の出典・年など */
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_reference_people_token_idx ON pilot_reference_people(token);
CREATE INDEX IF NOT EXISTS pilot_reference_people_name_idx ON pilot_reference_people(person_name);

ALTER TABLE pilot_survey ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_reference_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot staff read survey" ON pilot_survey;
CREATE POLICY "pilot staff read survey" ON pilot_survey FOR SELECT TO authenticated USING (is_pilot_staff());

DROP POLICY IF EXISTS "pilot staff read reference" ON pilot_reference_people;
CREATE POLICY "pilot staff read reference" ON pilot_reference_people FOR SELECT TO authenticated USING (is_pilot_staff());

-- 参加者：自分の回答を読む（token が鍵）
CREATE OR REPLACE FUNCTION public.pilot_survey_get(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'subject_code', p.subject_code,
    'answers', coalesce(s.answers, '{}'::jsonb),
    'submitted_at', s.submitted_at,
    'references', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'person_name', r.person_name,
        'image_path', r.image_path, 'source_note', r.source_note
      ) ORDER BY r.created_at)
      FROM pilot_reference_people r WHERE r.token = p.token
    ), '[]'::jsonb)
  )
  FROM pilot_participants p
  LEFT JOIN pilot_survey s ON s.token = p.token
  WHERE p.token = p_token;
$$;

-- 参加者：回答と「似ている人」を保存（何度でも上書き可。参照は全置換）
CREATE OR REPLACE FUNCTION public.pilot_survey_submit(p_token text, p_answers jsonb, p_references jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v pilot_participants%ROWTYPE;
  r jsonb;
  v_path text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO v FROM pilot_participants WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF jsonb_typeof(p_references) <> 'array' THEN RAISE EXCEPTION 'references must be array'; END IF;
  IF jsonb_array_length(p_references) > 12 THEN RAISE EXCEPTION 'too many references'; END IF;

  INSERT INTO pilot_survey (token, subject_code, event, answers, submitted_at, updated_at)
  VALUES (v.token, v.subject_code, v.event, coalesce(p_answers, '{}'::jsonb), now(), now())
  ON CONFLICT (token) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now();

  -- 参照は全置換。ただし既に測定済み（metrics あり）の行は残す
  DELETE FROM pilot_reference_people WHERE token = v.token AND metrics IS NULL;
  FOR r IN SELECT * FROM jsonb_array_elements(p_references) LOOP
    v_path := nullif(r->>'image_path', '');
    IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> v.token THEN
      RAISE EXCEPTION 'invalid image path';
    END IF;
    IF coalesce(r->>'person_name', '') = '' THEN CONTINUE; END IF;
    IF (r->>'kind') NOT IN ('self_happy','others_say','dislike') THEN CONTINUE; END IF;
    INSERT INTO pilot_reference_people (id, token, subject_code, kind, person_name, image_path, image_width, image_height, source_note)
    VALUES (
      coalesce(nullif(r->>'id',''), 'ref_' || v.subject_code || '_' || substr(md5(random()::text), 1, 8)),
      v.token, v.subject_code, r->>'kind', r->>'person_name', v_path,
      (r->>'image_width')::int, (r->>'image_height')::int, nullif(r->>'source_note','')
    )
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind, person_name = EXCLUDED.person_name,
      image_path = coalesce(EXCLUDED.image_path, pilot_reference_people.image_path),
      image_width = coalesce(EXCLUDED.image_width, pilot_reference_people.image_width),
      image_height = coalesce(EXCLUDED.image_height, pilot_reference_people.image_height),
      source_note = coalesce(EXCLUDED.source_note, pilot_reference_people.source_note);
  END LOOP;
END;
$$;

-- スタッフ：参照写真を測定した結果を入れる（写真を消す場合は p_clear_image=true）
CREATE OR REPLACE FUNCTION public.pilot_staff_set_reference_metrics(
  p_id text, p_metrics jsonb, p_framing jsonb, p_source_note text, p_clear_image boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'staff only'; END IF;
  UPDATE pilot_reference_people SET
    metrics = p_metrics, framing = p_framing,
    source_note = coalesce(nullif(p_source_note,''), source_note),
    measured_at = now(), measured_by = (SELECT email FROM auth.users WHERE id = auth.uid()),
    image_path = CASE WHEN p_clear_image THEN NULL ELSE image_path END
  WHERE id = p_id;
END;
$$;

-- 他の pilot 関数と同じく、ログインしていない呼び出し（anon）からは実行させない
REVOKE ALL ON FUNCTION public.pilot_survey_get(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_survey_submit(text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pilot_staff_set_reference_metrics(text, jsonb, jsonb, text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pilot_survey_get(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_survey_submit(text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pilot_staff_set_reference_metrics(text, jsonb, jsonb, text, boolean) TO authenticated;
