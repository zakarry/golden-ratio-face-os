/*
# Pilot: staff register participants (スタッフ画面から参加者を登録する)

- pilot_participants.display_name：名前（スタッフ画面と Excel にだけ出る。参加者側の関数は返さない）
- スタッフは参加者を追加・編集できる（削除はできない）
*/

ALTER TABLE pilot_participants ADD COLUMN IF NOT EXISTS display_name text;

DROP POLICY IF EXISTS "pilot staff insert participants" ON pilot_participants;
CREATE POLICY "pilot staff insert participants"
  ON pilot_participants FOR INSERT TO authenticated WITH CHECK (is_pilot_staff());

DROP POLICY IF EXISTS "pilot staff update participants" ON pilot_participants;
CREATE POLICY "pilot staff update participants"
  ON pilot_participants FOR UPDATE TO authenticated USING (is_pilot_staff()) WITH CHECK (is_pilot_staff());
