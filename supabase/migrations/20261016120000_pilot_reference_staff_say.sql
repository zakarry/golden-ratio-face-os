/*
# 似ている人の四つ目の種類：staff_say（運営が見る人）

- kind の CHECK に 'staff_say'。寄せ方の保存（pilot_yosekata.target_kind）にも
- added_by：運営が登録したときのメール
- pilot_staff_add_reference：運営が名前・写真（<token>/survey/staff_ 配下）・出典メモで登録（スタッフのみ）
- 本人側は運営が入れた人を見ない・消さない：
  pilot_survey_get は staff_say を返さない。pilot_survey_submit の入れ直しで staff_say を消さない・上書きしない
*/

ALTER TABLE pilot_reference_people DROP CONSTRAINT IF EXISTS pilot_reference_people_kind_check;
ALTER TABLE pilot_reference_people ADD CONSTRAINT pilot_reference_people_kind_check
  CHECK (kind IN ('self_happy','others_say','dislike','staff_say'));
ALTER TABLE pilot_reference_people ADD COLUMN IF NOT EXISTS added_by text;

ALTER TABLE pilot_yosekata DROP CONSTRAINT IF EXISTS pilot_yosekata_target_kind_check;
ALTER TABLE pilot_yosekata ADD CONSTRAINT pilot_yosekata_target_kind_check
  CHECK (target_kind IN ('ideal','self_happy','others_say','dislike','staff_say'));

CREATE OR REPLACE FUNCTION public.pilot_staff_add_reference(
  p_token text, p_person_name text, p_image_path text, p_image_width int, p_image_height int, p_source_note text
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v pilot_participants%ROWTYPE; v_id text; v_path text;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'staff only'; END IF;
  SELECT * INTO v FROM pilot_participants WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF coalesce(trim(p_person_name), '') = '' THEN RAISE EXCEPTION 'name required'; END IF;
  v_path := nullif(p_image_path, '');
  IF v_path IS NOT NULL AND v_path NOT LIKE p_token || '/survey/staff\_%' THEN RAISE EXCEPTION 'invalid image path'; END IF;
  v_id := 'ref_' || v.subject_code || '_s' || substr(md5(random()::text), 1, 8);
  INSERT INTO pilot_reference_people (id, token, subject_code, kind, person_name, image_path, image_width, image_height, source_note, added_by)
  VALUES (v_id, v.token, v.subject_code, 'staff_say', trim(p_person_name), v_path, p_image_width, p_image_height, nullif(trim(p_source_note), ''),
          (SELECT email FROM auth.users WHERE id = auth.uid()));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pilot_staff_add_reference(text, text, text, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pilot_staff_add_reference(text, text, text, int, int, text) TO authenticated;

-- 本人側：運営が入れた人は返さない
CREATE OR REPLACE FUNCTION public.pilot_survey_get(p_token text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'subject_code', p.subject_code,
    'answers', coalesce(s.answers, '{}'::jsonb),
    'submitted_at', s.submitted_at,
    'references', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'person_name', r.person_name,
        'image_path', r.image_path, 'source_note', r.source_note
      ) ORDER BY r.created_at)
      FROM pilot_reference_people r WHERE r.token = p.token AND r.kind <> 'staff_say'
    ), '[]'::jsonb)
  )
  FROM pilot_participants p
  LEFT JOIN pilot_survey s ON s.token = p.token
  WHERE p.token = p_token;
$function$;

-- 本人の送り直し：運営が入れた人は消さない・上書きしない
CREATE OR REPLACE FUNCTION public.pilot_survey_submit(p_token text, p_answers jsonb, p_references jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  DELETE FROM pilot_reference_people WHERE token = v.token AND metrics IS NULL AND kind <> 'staff_say';
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
      source_note = coalesce(EXCLUDED.source_note, pilot_reference_people.source_note)
    WHERE pilot_reference_people.kind <> 'staff_say' AND pilot_reference_people.token = v.token;
  END LOOP;
END;
$function$;
