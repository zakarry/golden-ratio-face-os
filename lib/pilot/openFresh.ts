// 写真のリンクを押したとき、その場で署名付きURLを取り直して開く。
// 画面に出している URL は10分で切れる（storage の署名の有効期限）ので、長く開いたままのページでも開けるように。
// 新しいタブは押した瞬間に開く（あとから開くとポップアップとして止められる）。

import type React from 'react';

export function openFresh(e: React.MouseEvent, getUrl: () => Promise<string | null | undefined>) {
  e.preventDefault();
  const w = window.open('about:blank', '_blank');
  if (w) w.opener = null;
  getUrl()
    .then(u => {
      if (!u) { w?.close(); return; }
      if (w) w.location.href = u; else window.open(u, '_blank', 'noopener');
    })
    .catch(() => w?.close());
}
