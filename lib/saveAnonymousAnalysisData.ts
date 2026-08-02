import type { AnonymousAnalysisData, AnalysisResult } from '@/types/analysis';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function buildAnonymousData(result: AnalysisResult): AnonymousAnalysisData {
  const { leftPupil: _l, rightPupil: _r, mouthCenter: _m, ...triangleSafe } = result.triangleAnalysis;
  return {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    source: 'web',
    consent: true,
    metrics: result.metrics,
    scores: result.scores,
    triangleAnalysis: triangleSafe,
  };
}

export function saveAnonymousAnalysisData(data: AnonymousAnalysisData): void {
  console.log('[Anonymous Analysis Data]', JSON.stringify(data, null, 2));
}

export async function saveToSupabase(_data: AnonymousAnalysisData): Promise<void> {
  console.log('Supabase integration not yet implemented');
}
