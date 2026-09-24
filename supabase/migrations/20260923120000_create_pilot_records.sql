/*
# Pilot records (ミス・ワールドJAPAN パイロット)

## Table: pilot_records
One row per capture (subject_code × phase × time). Stores landmarks, metrics,
target card and prescription as JSON, plus the storage path of the photo.
Photos live in the private storage bucket `pilot-photos`.

## Access
Staff phones sign in anonymously (one anon user per device). A subject's
"before" may be captured on a different device than the "after", so any
signed-in (anon) user may SELECT pilot rows and photos. INSERT/UPDATE are
limited to the row's own user. This is acceptable for a closed pilot; tighten
before general release.
*/

CREATE TABLE IF NOT EXISTS pilot_records (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('before','after')),
  taken_at timestamptz NOT NULL,
  event text NOT NULL,
  operator text,
  consent boolean NOT NULL DEFAULT false,
  image_path text,
  image_width integer,
  image_height integer,
  guide jsonb NOT NULL,
  metrics jsonb NOT NULL,
  target_card jsonb,
  prescription jsonb,
  framing jsonb,
  note text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_records_subject_idx ON pilot_records(event, subject_code, phase);
CREATE INDEX IF NOT EXISTS pilot_records_taken_idx ON pilot_records(taken_at DESC);

ALTER TABLE pilot_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilot select any signed-in" ON pilot_records;
CREATE POLICY "pilot select any signed-in"
  ON pilot_records FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pilot insert own" ON pilot_records;
CREATE POLICY "pilot insert own"
  ON pilot_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pilot update own" ON pilot_records;
CREATE POLICY "pilot update own"
  ON pilot_records FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage bucket for photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pilot-photos', 'pilot-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pilot photos insert" ON storage.objects;
CREATE POLICY "pilot photos insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pilot-photos');

DROP POLICY IF EXISTS "pilot photos update" ON storage.objects;
CREATE POLICY "pilot photos update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pilot-photos') WITH CHECK (bucket_id = 'pilot-photos');

DROP POLICY IF EXISTS "pilot photos select" ON storage.objects;
CREATE POLICY "pilot photos select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pilot-photos');
