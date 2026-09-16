/*
# Create face_karte_records table

## Overview
Creates the persistent storage table for the Golden Ratio Face Karte system.
Each row is a single karte record (baseline, monthly, daily makeup, or daily condition)
belonging to one authenticated user. This replaces the previous localStorage-only storage
with a proper database table that survives across devices and sessions.

## New Table: face_karte_records
- id (text, primary key) — client-generated unique record ID
- user_id (uuid, not null, defaults to auth.uid()) — owner of the record, FK to auth.users
- date (timestamptz, not null) — when the record was created
- record_type (text, not null) — 'baseline' | 'monthly' | 'dailyMakeup' | 'dailyCondition'
- image_url (text) — saved face image URL (baseline only)
- guide (jsonb) — detected face landmark guide
- analysis (jsonb, not null) — full AnalysisResult
- diagnosis_summary (jsonb) — array of diagnosis summary strings
- strengths (jsonb) — array of strength feature strings
- golden_ratio (jsonb) — faceRatio, eyePosition, mouthPosition
- triangle_analysis (jsonb) — type, label, ratio
- makeup_plan (jsonb) — optional MakeupPlan
- before_after (jsonb) — optional BeforeAfter comparison
- face_yoga_plan (jsonb) — optional FaceYogaPlan
- face_yoga_skipped (boolean) — whether face yoga was skipped
- purpose (text) — makeup purpose
- scene (text) — scene context
- level (text) — user level at time of record (beginner/intermediate/advanced)
- style_id (text) — ideal style chosen in intermediate flow
- provider_id (text) — Face Designer provider used for review
- note (text) — free-form note
- created_at (timestamptz, not null, default now())

## Indexes
- face_karte_records_user_id_idx on user_id
- face_karte_records_date_idx on date DESC

## Security (RLS)
- RLS enabled on face_karte_records
- 4 owner-scoped policies (select/insert/update/delete), each checking auth.uid() = user_id
- user_id defaults to auth.uid() so inserts that omit user_id still satisfy the WITH CHECK
*/

CREATE TABLE IF NOT EXISTS face_karte_records (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date timestamptz NOT NULL,
  record_type text NOT NULL,
  image_url text,
  guide jsonb,
  analysis jsonb NOT NULL,
  diagnosis_summary jsonb,
  strengths jsonb,
  golden_ratio jsonb,
  triangle_analysis jsonb,
  makeup_plan jsonb,
  before_after jsonb,
  face_yoga_plan jsonb,
  face_yoga_skipped boolean,
  purpose text,
  scene text,
  level text,
  style_id text,
  provider_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS face_karte_records_user_id_idx ON face_karte_records(user_id);
CREATE INDEX IF NOT EXISTS face_karte_records_date_idx ON face_karte_records(date DESC);

ALTER TABLE face_karte_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own karte records" ON face_karte_records;
CREATE POLICY "select own karte records"
  ON face_karte_records FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own karte records" ON face_karte_records;
CREATE POLICY "insert own karte records"
  ON face_karte_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update own karte records" ON face_karte_records;
CREATE POLICY "update own karte records"
  ON face_karte_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete own karte records" ON face_karte_records;
CREATE POLICY "delete own karte records"
  ON face_karte_records FOR DELETE
  USING (auth.uid() = user_id);
