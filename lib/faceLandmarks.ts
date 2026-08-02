import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export interface DetectedGuide {
  // All values are fractions of the rendered image (0–1)
  centerLineX: number;
  eyeLineY: number;
  eyebrowLineY: number;
  noseBaseLineY: number;
  lipLineY: number;
  chinLineY: number;
  foreheadY: number;
  faceLeftX: number;
  faceRightX: number;
  leftEyeX: number;
  rightEyeX: number;
  leftEyeY: number;
  rightEyeY: number;
  // Eye corner landmarks for per-eye width measurement
  leftEyeOuterX: number;
  leftEyeInnerX: number;
  rightEyeInnerX: number;
  rightEyeOuterX: number;
  // Pupil centers (iris when available, eye-center fallback)
  leftPupilX: number;
  leftPupilY: number;
  rightPupilX: number;
  rightPupilY: number;
  // Mouth center
  mouthCenterX: number;
  mouthCenterY: number;
}

// ─── Landmark index sets ─────────────────────────────────────────────────────

// Full left-eye contour (upper + lower lids + corners)
const LEFT_EYE_IDX = [
  33, 7, 163, 144, 145, 153, 154, 155, 133,
  173, 157, 158, 159, 160, 161, 246,
];

// Full right-eye contour (upper + lower lids + corners)
const RIGHT_EYE_IDX = [
  362, 382, 381, 380, 374, 373, 390, 249, 263,
  466, 388, 387, 386, 385, 384, 398,
];

// Left iris — landmarks 468–472 (center = 468, ring = 469–472)
const LEFT_IRIS_IDX  = [468, 469, 470, 471, 472];
// Right iris — landmarks 473–477
const RIGHT_IRIS_IDX = [473, 474, 475, 476, 477];

// Mouth outer ring (upper + lower lip)
const MOUTH_IDX = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146];

// Left eyebrow — full arch
const LEFT_BROW_IDX = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];

// Right eyebrow — full arch
const RIGHT_BROW_IDX = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function avg(pts: Pt[]): Pt {
  const n = pts.length;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

function pick(lm: Pt[], indices: number[]): Pt[] {
  return indices.map((i) => lm[i]);
}

// ─── Model singleton ─────────────────────────────────────────────────────────

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm'
      );
      return FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: false,
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    })();
  }
  return landmarkerPromise;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function detectFaceLandmarks(
  imageSrc: string
): Promise<DetectedGuide | null> {
  const landmarker = await getLandmarker();

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);

  const result = landmarker.detect(canvas);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

  const lm = result.faceLandmarks[0];

  // ── 1. Precise eye centers ──────────────────────────────────────────────
  const leftEyeCenter  = avg(pick(lm, LEFT_EYE_IDX));
  const rightEyeCenter = avg(pick(lm, RIGHT_EYE_IDX));

  // Eye line Y = exact average of both eye center Y values
  const eyeLineY = (leftEyeCenter.y + rightEyeCenter.y) / 2;

  // ── 2. Eyebrow line ─────────────────────────────────────────────────────
  const eyebrowLineY = avg([
    ...pick(lm, LEFT_BROW_IDX),
    ...pick(lm, RIGHT_BROW_IDX),
  ]).y;

  // ── 3. Nose landmarks ───────────────────────────────────────────────────
  // Nose tip = lm[1] (philtrum bridge, most prominent point)
  const noseTip = lm[1];
  // Nose base = midpoint of lateral nostril landmarks 98 (left) and 327 (right)
  const noseBase = avg([lm[98], lm[327]]);

  // ── 4. Mouth ─────────────────────────────────────────────────────────────
  // Upper lip center = lm[13], lower lip center = lm[14]
  const mouthCenter = avg([lm[13], lm[14]]);
  // Full mouth ring average for a more stable center
  const mouthRingCenter = avg(pick(lm, MOUTH_IDX));

  // ── 5. Chin ─────────────────────────────────────────────────────────────
  const chin = lm[152];

  // ── 6. Face horizontal extents ──────────────────────────────────────────
  const faceLeft  = lm[234];
  const faceRight = lm[454];

  // ── 7. Forehead — eyebrow-proportional estimate ──────────────────────────
  // foreheadY = eyebrowY - (chinY - eyebrowY) * 0.5
  // This places the hairline roughly above the brow at the correct proportion.
  const foreheadY = Math.max(0, eyebrowLineY - (chin.y - eyebrowLineY) * 0.5);

  // ── 8. Pupil centers (iris landmarks if present, eye-center fallback) ───
  // MediaPipe iris landmarks start at index 468; if the array is long enough
  // they are available.
  const hasIris = lm.length > 477;
  const leftPupil  = hasIris ? avg(pick(lm, LEFT_IRIS_IDX))  : leftEyeCenter;
  const rightPupil = hasIris ? avg(pick(lm, RIGHT_IRIS_IDX)) : rightEyeCenter;

  // Stable mouth center: blend of lm[13/14] midpoint and full ring avg
  const stableMouthCenter = avg([mouthCenter, mouthRingCenter]);

  // ── 9. Center line — average of four stable midline landmarks ───────────
  // Use midpoint between eyes, nose tip, mouth center, chin
  const eyeMidX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const centerLineX = avg([
    { x: eyeMidX,          y: 0 },
    { x: noseTip.x,        y: 0 },
    { x: noseBase.x,       y: 0 },
    { x: mouthCenter.x,    y: 0 },
    { x: chin.x,           y: 0 },
  ]).x;

  // Eye corners: lm[33]=left outer, lm[133]=left inner, lm[362]=right inner, lm[263]=right outer
  return {
    centerLineX,
    eyeLineY,
    eyebrowLineY,
    noseBaseLineY:   noseBase.y,
    lipLineY:        mouthCenter.y,
    chinLineY:       chin.y,
    foreheadY,
    faceLeftX:       faceLeft.x,
    faceRightX:      faceRight.x,
    leftEyeX:        leftEyeCenter.x,
    rightEyeX:       rightEyeCenter.x,
    leftEyeY:        leftEyeCenter.y,
    rightEyeY:       rightEyeCenter.y,
    leftEyeOuterX:   lm[33].x,
    leftEyeInnerX:   lm[133].x,
    rightEyeInnerX:  lm[362].x,
    rightEyeOuterX:  lm[263].x,
    leftPupilX:      leftPupil.x,
    leftPupilY:      leftPupil.y,
    rightPupilX:     rightPupil.x,
    rightPupilY:     rightPupil.y,
    mouthCenterX:    stableMouthCenter.x,
    mouthCenterY:    stableMouthCenter.y,
  };
}
