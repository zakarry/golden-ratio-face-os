/*
# 参加者（ログインなし）からの直接の権限を外す（読み書きは運営の決まりと RPC だけ）
*/

REVOKE ALL ON pilot_reference_people FROM anon;
REVOKE ALL ON pilot_survey FROM anon;
