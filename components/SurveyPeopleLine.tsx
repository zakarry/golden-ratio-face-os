'use client';

// 設計図の「強み」の下：事前アンケートで答えた「なりたい人」「周りが言う人」（回答済みのときだけ）

import React, { useEffect, useState } from 'react';
import { getOfficialSurvey, surveyNames, type OfficialSurvey } from '@/lib/officialSurvey';

export default function SurveyPeopleLine({ fallback }: { fallback?: OfficialSurvey | null }) {
  const [survey, setSurvey] = useState<OfficialSurvey | null>(null);
  useEffect(() => {
    const load = () => setSurvey(getOfficialSurvey() ?? fallback ?? null);
    load();
    window.addEventListener('face-survey-updated', load);
    return () => window.removeEventListener('face-survey-updated', load);
  }, [fallback]);

  const want = surveyNames(survey, 'self_happy');
  const others = surveyNames(survey, 'others_say');
  if (!want.length && !others.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200/50 px-5 py-4 space-y-1 text-sm text-stone-700">
      {want.length > 0 && <p><span className="text-stone-400 text-xs mr-2">なりたい人：</span>{want.join('、')}</p>}
      {others.length > 0 && <p><span className="text-stone-400 text-xs mr-2">周りが言う人：</span>{others.join('、')}</p>}
    </div>
  );
}
