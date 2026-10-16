'use client';

// 事前アンケート画面（参加者用）
// 表示: 専用リンク ?p=<token>&survey=1、または参加者ページ内の「アンケート」ボタンから。
// 保存先: pilot_survey / pilot_reference_people（lib/pilot/survey.ts）
// official=true のときは公式版（「なりたい顔から」）：似ている人は名前だけ、回答は顔カルテに残す（lib/officialSurvey.ts）

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SURVEY_QUESTIONS, REFERENCE_KIND_LABEL, fetchSurvey, submitSurvey, shrinkImage, newReferenceId,
  type SurveyAnswers, type ReferencePerson, type ReferenceKind, type SurveyQuestion,
} from '@/lib/pilot/survey';
import { getOfficialSurvey, saveOfficialSurvey } from '@/lib/officialSurvey';

interface Props {
  /** 専用リンクのトークン（公式版では不要） */
  token?: string;
  /** 送信後に戻る先があれば */
  onDone?: () => void;
  /** 公式版：写真なし・名前だけ、顔カルテに保存 */
  official?: boolean;
  /** 公式版：答えずに先へ進む */
  onSkip?: () => void;
}

export default function SurveyPage({ token = '', onDone, official = false, onSkip }: Props) {
  const [subjectCode, setSubjectCode] = useState('');
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [refs, setRefs] = useState<ReferencePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (official) {
        const s = getOfficialSurvey();
        setAnswers(s?.answers ?? {});
        setRefs(s?.references ?? []);
        setSubmittedAt(s?.submitted_at ?? null);
        setLoading(false);
        return;
      }
      const d = await fetchSurvey(token);
      if (!alive) return;
      if (!d) { setErr('リンクが正しくありません。送られたURLをもう一度開いてください。'); setLoading(false); return; }
      setSubjectCode(d.subject_code);
      setAnswers(d.answers ?? {});
      setRefs(d.references ?? []);
      setSubmittedAt(d.submitted_at ?? null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [token, official]);

  const setA = (id: string, v: string | string[]) => setAnswers(a => ({ ...a, [id]: v }));

  const refsByKind = useMemo(() => {
    const m: Record<ReferenceKind, ReferencePerson[]> = { self_happy: [], others_say: [], dislike: [], staff_say: [] }; // staff_say は本人側には来ない
    for (const r of refs) m[r.kind].push(r);
    return m;
  }, [refs]);

  const addRef = (kind: ReferenceKind) => setRefs(r => [...r, { id: newReferenceId(subjectCode || 'X'), kind, person_name: '' }]);
  const updateRef = (id: string, patch: Partial<ReferencePerson>) => setRefs(r => r.map(x => x.id === id ? { ...x, ...patch } : x));
  const removeRef = (id: string) => setRefs(r => r.filter(x => x.id !== id));

  const onPickPhoto = async (id: string, file: File | null) => {
    if (!file) return;
    try {
      const s = await shrinkImage(file, 1600);
      updateRef(id, { localDataUrl: s.dataUrl, image_path: null, image_width: s.width, image_height: s.height });
    } catch { setErr('写真を読み込めませんでした。別の写真でお試しください。'); }
  };

  const validate = (): string | null => {
    const imp = answers['impression'];
    if (Array.isArray(imp) && imp.length > 3) return '6は3つまでにしてください。';
    for (const r of refs) {
      if (!official && r.kind !== 'dislike' && r.person_name.trim() && !r.image_path && !r.localDataUrl) {
        return `「${r.person_name}」の真正面の写真を付けてください（3・4は一人一枚）。`;
      }
    }
    return null;
  };

  const onSubmit = async () => {
    setErr(null); setMsg(null);
    const v = validate(); if (v) { setErr(v); return; }
    setSending(true);
    if (official) {
      try {
        const saved = await saveOfficialSurvey(answers, refs);
        setRefs(saved.references); setSubmittedAt(saved.submitted_at);
        setMsg('保存しました。顔カルテから見られます。あとから直すこともできます。');
        onDone?.();
      } catch { setErr('保存できませんでした。もう一度お試しください。'); }
      setSending(false);
      return;
    }
    const res = await submitSurvey(token, answers, refs);
    setSending(false);
    if (!res.ok) { setErr(res.error ?? '送信に失敗しました'); return; }
    const d = await fetchSurvey(token);
    if (d) { setRefs(d.references); setSubmittedAt(d.submitted_at); }
    setMsg('送信しました。ありがとうございます。あとから直すこともできます。');
    onDone?.();
  };

  if (loading) return <div className="p-6 text-sm text-gray-600">読み込み中…</div>;
  if (err && !subjectCode && !official) return <div className="p-6 text-sm text-red-600">{err}</div>;

  return (
    <div className={`mx-auto max-w-xl p-4 text-[15px] leading-relaxed ${official ? '' : 'pb-24'}`}>
      <h1 className="text-lg font-bold">{official ? 'なりたい顔のアンケート' : '公式写真メイクの事前アンケート'}</h1>
      <p className="mt-1 text-sm text-gray-600">
        {!official && <>参加者コード <span className="font-mono font-semibold">{subjectCode}</span></>}
        {submittedAt && <span className={official ? 'text-green-700' : 'ml-2 text-green-700'}>（{official ? '回答済み' : '送信済み'}・修正できます）</span>}
      </p>
      <p className="mt-3 text-sm text-gray-700">
        正解はないので、思ったままで答えてください。答えたくない項目は空欄で大丈夫です。
        {official ? 'この回答はあなたの顔カルテに保存されます。' : 'この回答はメイクの打ち合わせにだけ使い、ほかの参加者には見せません。'}
      </p>

      <div className="mt-5 space-y-6">
        {groupByNo(SURVEY_QUESTIONS).map(group => (
          <section key={group.no} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {group.qs.map((q, i) => (
              <div key={q.id} className={i > 0 ? 'mt-4 border-t border-gray-100 pt-4' : ''}>
                <div className="font-semibold">
                  {i === 0 && <span className="mr-2 inline-block rounded bg-gray-900 px-2 py-0.5 text-xs text-white">{q.no}</span>}
                  {q.title}
                </div>
                {(official && q.type === 'people' ? '名前だけ入力してください（何人でも）。' : q.help) &&
                  <div className="mt-0.5 text-xs text-gray-500">{official && q.type === 'people' ? '名前だけ入力してください（何人でも）。' : q.help}</div>}
                <div className="mt-2">{renderInput(q)}</div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {err && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {msg && <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

      <div className={official ? 'mt-5 space-y-2' : 'fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur'}>
        <div className="mx-auto max-w-xl space-y-2">
          <button type="button" onClick={onSubmit} disabled={sending}
            className="w-full rounded-lg bg-gray-900 py-3 text-base font-semibold text-white disabled:opacity-50">
            {official
              ? (sending ? '保存中…' : (submittedAt ? '修正して次へ' : '保存して次へ'))
              : (sending ? '送信中…' : (submittedAt ? '修正して送信' : '送信する'))}
          </button>
          {official && onSkip && (
            <button type="button" onClick={onSkip} className="w-full rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700">
              {submittedAt ? 'このまま次へ' : 'あとで答える'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function renderInput(q: SurveyQuestion) {
    const v = answers[q.id];
    if (q.type === 'text') {
      return <input className={inputCls} value={(v as string) ?? ''} onChange={e => setA(q.id, e.target.value)} />;
    }
    if (q.type === 'textarea') {
      return <textarea className={inputCls + ' min-h-[72px]'} value={(v as string) ?? ''} onChange={e => setA(q.id, e.target.value)} />;
    }
    if (q.type === 'single') {
      return (
        <div className="flex flex-wrap gap-2">
          {q.options!.map(o => (
            <button type="button" key={o} onClick={() => setA(q.id, v === o ? '' : o)}
              className={chip(v === o)}>{o}</button>
          ))}
        </div>
      );
    }
    if (q.type === 'multi') {
      const arr = Array.isArray(v) ? v : [];
      const otherVal = (answers[q.id + '_other'] as string) ?? '';
      return (
        <div>
          <div className="flex flex-wrap gap-2">
            {q.options!.map(o => {
              const on = arr.includes(o);
              return (
                <button type="button" key={o} className={chip(on)}
                  onClick={() => setA(q.id, on ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>
              );
            })}
          </div>
          {q.other && (
            <input className={inputCls + ' mt-2'} placeholder="その他（自由に）" value={otherVal}
              onChange={e => setA(q.id + '_other', e.target.value)} />
          )}
        </div>
      );
    }
    if (q.type === 'people') return renderPeople(q.refKind!);
    return null;
  }

  function renderPeople(kind: ReferenceKind) {
    const list = refsByKind[kind];
    const needPhoto = !official && kind !== 'dislike';
    return (
      <div className="space-y-3">
        {list.map(r => (
          <RefRow key={r.id} r={r} needPhoto={needPhoto}
            onName={n => updateRef(r.id, { person_name: n })}
            onNote={n => updateRef(r.id, { source_note: n })}
            onPhoto={f => onPickPhoto(r.id, f)}
            onRemove={() => removeRef(r.id)} />
        ))}
        <button type="button" onClick={() => addRef(kind)}
          className="rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm text-gray-700">
          ＋ {REFERENCE_KIND_LABEL[kind]}を追加
        </button>
        {needPhoto && list.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <span className="font-semibold">写真は、あなたではなく挙げた方ご本人の写真です。</span>
            条件：正面を向いていて顔が傾いていない／前髪で眉が隠れていない／加工やスタンプなし（画面写真でもOK）。
            その方の写真で「この写真の頃に似ていると言われた」というものがあれば、それが一番です。
          </div>
        )}
      </div>
    );
  }
}

function RefRow({ r, needPhoto, onName, onNote, onPhoto, onRemove }: {
  r: ReferencePerson; needPhoto: boolean;
  onName: (s: string) => void; onNote: (s: string) => void; onPhoto: (f: File | null) => void; onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasPhoto = !!(r.localDataUrl || r.image_path);
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start gap-3">
        {needPhoto && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="h-20 w-16 shrink-0 overflow-hidden rounded-md border border-gray-300 bg-gray-100 text-[11px] text-gray-500">
            {r.localDataUrl
              ? <img src={r.localDataUrl} alt="" className="h-full w-full object-contain" />
              : r.image_path ? <span>送信済み<br />（変更）</span> : <span>写真を<br />選ぶ</span>}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <input className={inputCls} placeholder="名前（例：井上和）" value={r.person_name} onChange={e => onName(e.target.value)} />
          {needPhoto && (
            <input className={inputCls + ' mt-2 text-xs'} placeholder="写真のメモ（例：2024年の雑誌、SNSの投稿）"
              value={r.source_note ?? ''} onChange={e => onNote(e.target.value)} />
          )}
          {needPhoto && !hasPhoto && r.person_name && (
            <div className="mt-1 text-xs text-red-600">真正面の写真を付けてください</div>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-gray-500">削除</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onPhoto(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function groupByNo(qs: SurveyQuestion[]) {
  const out: { no: number; qs: SurveyQuestion[] }[] = [];
  for (const q of qs) {
    const g = out.find(x => x.no === q.no);
    if (g) g.qs.push(q); else out.push({ no: q.no, qs: [q] });
  }
  return out;
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-[15px] focus:border-gray-900 focus:outline-none';
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-800'}`;
