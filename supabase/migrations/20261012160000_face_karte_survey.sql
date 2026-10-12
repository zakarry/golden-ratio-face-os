/*
# 公式版の事前アンケートをカルテに残す

face_karte_records.survey：「なりたい顔から」で答えた事前アンケート（質問は専用リンク版と同じ）。
{ answers, references: [{ id, kind, person_name }], submitted_at }。似ている人は名前だけ（写真なし）。
Face Identity（record_type = 'baseline'）の行に載せる。
*/

ALTER TABLE face_karte_records ADD COLUMN IF NOT EXISTS survey jsonb;
