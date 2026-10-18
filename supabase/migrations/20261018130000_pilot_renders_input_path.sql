/*
# 完成イメージ：「強くしてもう一枚ずつ」は直前の生成画像を入力にする

source_path は素顔のまま（骨格の比較の基準）。実際に送った画像が素顔でないときだけ input_path に残す。
*/

ALTER TABLE public.pilot_renders ADD COLUMN IF NOT EXISTS input_path text;
