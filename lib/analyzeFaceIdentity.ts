// Re-export shim: the diff imports from '@/lib/analyzeFaceIdentity' but the
// actual implementation lives in analyzeFaceMock. This lets the new code
// resolve without duplicating the analysis logic.
export {
  analyzeFaceFromGuide,
  generateMakeupAdvice,
  generateIllusionAdvice,
  computeTargetGuide,
} from '@/lib/analyzeFaceMock';
