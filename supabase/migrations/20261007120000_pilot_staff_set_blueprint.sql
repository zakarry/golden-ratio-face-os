-- Pilot: スタッフが設計図を作り直したとき、記録に設計図の場所を書く
-- （写真はあるのに端末で設計図を作れなかった撮影を、運営ページから補う）

CREATE OR REPLACE FUNCTION pilot_staff_set_blueprint(p_id text, p_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE pilot_records SET blueprint_path = p_path
  WHERE id = p_id AND blueprint_path IS NULL AND split_part(p_path, '/', 1) = participant_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'record not found or already has blueprint'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION pilot_staff_set_blueprint(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_staff_set_blueprint(text, text) TO authenticated;
