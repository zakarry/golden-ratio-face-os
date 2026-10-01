-- Pilot: スタッフが参加者を削除できるようにする
-- 写真は画面側（Storage API）で先に消し、そのあとこの関数で記録と参加者を消す。

CREATE POLICY "pilot staff delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pilot-photos' AND public.is_pilot_staff());

CREATE OR REPLACE FUNCTION pilot_staff_delete_participant(p_token text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT is_pilot_staff() THEN RAISE EXCEPTION 'not allowed'; END IF;
  DELETE FROM pilot_records WHERE participant_token = p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM pilot_participants WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant not found'; END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION pilot_staff_delete_participant(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pilot_staff_delete_participant(text) TO authenticated;
