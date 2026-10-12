/*
# 公式版カルテに寄せ方の結果を残す

face_karte_records.yosekata：診断ごとの寄せ方（rows・text・config）。
{ ideal: 黄金比を目標にした結果, brand?: ブランドの絞り込みで通した結果 }
許容幅や強さの規則は校正で変わるので、config.version ごと残す。
*/

ALTER TABLE face_karte_records ADD COLUMN IF NOT EXISTS yosekata jsonb;
