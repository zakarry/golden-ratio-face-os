'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CircleAlert as AlertCircle } from 'lucide-react';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { TriangleAnalysis } from '@/types/analysis';

export type SimulationMode = 'current' | 'target';

interface FaceCanvasProps {
  imageSrc: string;
  showGuides: boolean;
  showGoldenRatio: boolean;
  showTriangle: boolean;
  guide: DetectedGuide | null;
  targetGuide: DetectedGuide | null;
  triangleAnalysis: TriangleAnalysis | null;
  detectionState: 'idle' | 'detecting' | 'done' | 'error';
  simulationMode: SimulationMode;
}

function toP(fraction: number, dimension: number) {
  return fraction * dimension;
}

export default function FaceCanvas({
  imageSrc,
  showGuides,
  showGoldenRatio,
  showTriangle,
  guide,
  targetGuide,
  triangleAnalysis,
  detectionState,
  simulationMode,
}: FaceCanvasProps) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setImgSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    const measure = () => {
      const el = imgRef.current;
      if (!el) return;
      setImgSize({ w: el.clientWidth, h: el.clientHeight });
    };
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => setImgSize(null), [imageSrc]);

  const sw = imgSize?.w ?? 0;
  const sh = imgSize?.h ?? 0;

  const showOverlay = imgSize && guide && detectionState === 'done' && (showGuides || showGoldenRatio || showTriangle);
  const showSim = imgSize && guide && targetGuide && detectionState === 'done';

  const px = (fx: number) => toP(fx, sw);
  const py = (fy: number) => toP(fy, sh);

  return (
    <div className="relative inline-block max-w-full" style={{ lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="顔分析プレビュー"
        onLoad={handleLoad}
        className="block rounded-xl"
        style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
      />

      {detectionState === 'detecting' && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-xl">
          <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-stone-600 font-medium">顔を解析中...</p>
        </div>
      )}

      {detectionState === 'error' && imgSize && (
        <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 rounded-xl px-6">
          <AlertCircle className="w-7 h-7 text-amber-500" strokeWidth={1.5} />
          <p className="text-xs text-stone-600 text-center leading-relaxed">
            顔を検出できませんでした。
            <br />
            正面を向いた明るい写真を使用してください。
          </p>
        </div>
      )}

      {/* Normal guide / golden ratio / triangle overlays */}
      {showOverlay && guide && (
        <svg
          viewBox={`0 0 ${sw} ${sh}`}
          width={sw}
          height={sh}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          className="rounded-xl"
        >
          {/* Dim guide/golden layers when triangle is active */}
          <g style={{ opacity: showTriangle && triangleAnalysis ? 0.35 : 1 }}>
            {showGuides && (
              <GuideLines guide={guide} px={px} py={py} sw={sw} sh={sh} />
            )}
            {showGoldenRatio && (
              <GoldenRatioFrame guide={guide} px={px} py={py} />
            )}
          </g>
          {showTriangle && triangleAnalysis && (
            <TriangleOverlay ta={triangleAnalysis} px={px} py={py} />
          )}
        </svg>
      )}

      {/* Before/after simulation overlay */}
      {showSim && guide && targetGuide && (
        <svg
          viewBox={`0 0 ${sw} ${sh}`}
          width={sw}
          height={sh}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          className="rounded-xl"
        >
          <SimulationOverlay
            currentGuide={guide}
            targetGuide={targetGuide}
            mode={simulationMode}
            px={px}
            py={py}
            sw={sw}
          />
        </svg>
      )}
    </div>
  );
}

// ─── Guide lines ────────────────────────────────────────────────────────────

interface GuideProps {
  guide: DetectedGuide;
  px: (f: number) => number;
  py: (f: number) => number;
  sw: number;
  sh: number;
}

function GuideLines({ guide, px, py, sw }: GuideProps) {
  const cx = px(guide.centerLineX);
  const fLeft = px(guide.faceLeftX);
  const fRight = px(guide.faceRightX);
  const faceW = fRight - fLeft;
  const topY = py(guide.foreheadY);
  const bottomY = py(guide.chinLineY);

  const xMargin = faceW * 0.08;
  const lineLeft = fLeft - xMargin;
  const lineRight = fRight + xMargin;

  const hLines: { y: number; label: string; color: string; width?: number }[] = [
    { y: py(guide.eyebrowLineY), label: '眉', color: 'rgba(180,160,120,0.85)' },
    { y: py(guide.eyeLineY), label: '目線', color: 'rgba(230,207,167,1)', width: 1.5 },
    { y: py(guide.noseBaseLineY), label: '鼻下', color: 'rgba(180,160,120,0.85)' },
    { y: py(guide.lipLineY), label: '唇', color: 'rgba(200,150,130,0.9)', width: 1.5 },
    { y: py(guide.chinLineY), label: '顎', color: 'rgba(180,160,120,0.85)' },
  ];

  const eyeDist = px(guide.rightEyeX) - px(guide.leftEyeX);
  const eyeR = Math.max(10, eyeDist * 0.18);

  return (
    <g>
      <rect
        x={fLeft} y={topY}
        width={faceW} height={bottomY - topY}
        fill="none"
        stroke="rgba(230,207,167,0.35)"
        strokeWidth="1"
        strokeDasharray="6 5"
      />
      <line
        x1={cx} y1={topY} x2={cx} y2={bottomY}
        stroke="rgba(230,207,167,0.9)"
        strokeWidth="1.5"
        strokeDasharray="8 6"
      />
      {hLines.map(({ y, label, color, width = 1.2 }) => (
        <g key={label}>
          <line
            x1={lineLeft} y1={y} x2={lineRight} y2={y}
            stroke={color} strokeWidth={width} strokeDasharray="4 5"
          />
          <line x1={lineLeft} y1={y - 4} x2={lineLeft} y2={y + 4} stroke={color} strokeWidth="1.5" />
          <line x1={lineRight} y1={y - 4} x2={lineRight} y2={y + 4} stroke={color} strokeWidth="1.5" />
          <text x={lineLeft - 8} y={y + 3.5} fontSize="10" fill={color} textAnchor="end" fontFamily="sans-serif">
            {label}
          </text>
        </g>
      ))}
      {[
        { cx: px(guide.leftEyeX), cy: py(guide.leftEyeY) },
        { cx: px(guide.rightEyeX), cy: py(guide.rightEyeY) },
      ].map((eye, i) => (
        <g key={i}>
          <circle cx={eye.cx} cy={eye.cy} r={eyeR} fill="none" stroke="rgba(230,207,167,0.7)" strokeWidth="1.5" />
          <circle cx={eye.cx} cy={eye.cy} r="2.5" fill="rgba(230,207,167,0.95)" />
        </g>
      ))}
      <line
        x1={px(guide.leftEyeX)} y1={py(guide.eyeLineY)}
        x2={px(guide.rightEyeX)} y2={py(guide.eyeLineY)}
        stroke="rgba(230,207,167,0.4)" strokeWidth="1" strokeDasharray="4 4"
      />
      <circle cx={cx} cy={py(guide.noseBaseLineY)} r="5" fill="none" stroke="rgba(180,160,120,0.65)" strokeWidth="1" />
      <line
        x1={cx - faceW * 0.2} y1={py(guide.lipLineY)}
        x2={cx + faceW * 0.2} y2={py(guide.lipLineY)}
        stroke="rgba(200,150,130,0.85)" strokeWidth="2" strokeLinecap="round"
      />
      {[1, 2].map((n) => (
        <line
          key={n}
          x1={fLeft + (faceW / 3) * n} y1={topY}
          x2={fLeft + (faceW / 3) * n} y2={bottomY}
          stroke="rgba(180,160,120,0.3)" strokeWidth="1" strokeDasharray="3 6"
        />
      ))}
      {[1, 2].map((n) => {
        const divY = topY + ((bottomY - topY) / 3) * n;
        return (
          <line
            key={n}
            x1={fLeft - xMargin * 0.5} y1={divY}
            x2={fRight + xMargin * 0.5} y2={divY}
            stroke="rgba(180,160,120,0.22)" strokeWidth="1" strokeDasharray="2 7"
          />
        );
      })}
    </g>
  );
}

// ─── Golden ratio frame ──────────────────────────────────────────────────────

interface GoldenFrameProps {
  guide: DetectedGuide;
  px: (f: number) => number;
  py: (f: number) => number;
}

function GoldenRatioFrame({ guide, px, py }: GoldenFrameProps) {
  const PHI   = 1.618;
  const cx    = px(guide.centerLineX);
  const topY  = py(guide.foreheadY);
  const botY  = py(guide.chinLineY);
  const fLeft = px(guide.faceLeftX);
  const fRight= px(guide.faceRightX);
  const grH   = botY - topY;
  const grW   = grH / PHI;
  const left  = cx - grW / 2;
  const right = left + grW;

  // φ-based horizontal reference lines
  // 0.50 → eye position reference
  const eyeRefY   = topY + grH * 0.50;
  // 0.618 → φ division line inside the rectangle
  const phiDivY   = topY + grH / PHI;
  // 0.75 → mouth position reference
  const mouthRefY = topY + grH * 0.75;

  // φ vertical subdivisions inside the rect: at grW/PHI and grW − grW/PHI
  const vLine1 = left  + grW / PHI;
  const vLine2 = right - grW / PHI;

  const gold     = 'rgba(201,169,110,';
  const thinDash = '4 6';

  return (
    <g>
      {/* Outer φ rectangle */}
      <rect
        x={left} y={topY} width={grW} height={grH}
        fill="rgba(201,169,110,0.03)"
        stroke={`${gold}0.45)`}
        strokeWidth="1" strokeDasharray="6 5"
      />

      {/* Vertical golden subdivision lines */}
      {[vLine1, vLine2].map((x, i) => (
        <line key={i}
          x1={x} y1={topY} x2={x} y2={botY}
          stroke={`${gold}0.20)`} strokeWidth="1" strokeDasharray={thinDash}
        />
      ))}

      {/* Horizontal: eye position reference (0.50) */}
      <line
        x1={fLeft - 4} y1={eyeRefY} x2={fRight + 4} y2={eyeRefY}
        stroke={`${gold}0.55)`} strokeWidth="1" strokeDasharray={thinDash}
      />
      <text x={left - 6} y={eyeRefY + 3} fontSize="8" fill={`${gold}0.7)`} textAnchor="end" fontFamily="sans-serif">
        目 0.50
      </text>

      {/* Horizontal: φ division (0.618) */}
      <line
        x1={left - 4} y1={phiDivY} x2={right + 4} y2={phiDivY}
        stroke={`${gold}0.35)`} strokeWidth="1" strokeDasharray="3 7"
      />
      <text x={left - 6} y={phiDivY + 3} fontSize="8" fill={`${gold}0.55)`} textAnchor="end" fontFamily="sans-serif">
        φ
      </text>

      {/* Horizontal: mouth position reference (0.75) */}
      <line
        x1={fLeft - 4} y1={mouthRefY} x2={fRight + 4} y2={mouthRefY}
        stroke={`${gold}0.50)`} strokeWidth="1" strokeDasharray={thinDash}
      />
      <text x={left - 6} y={mouthRefY + 3} fontSize="8" fill={`${gold}0.7)`} textAnchor="end" fontFamily="sans-serif">
        口 0.75
      </text>

      {/* Label */}
      <text x={left + 3} y={topY - 5} fontSize="9" fontWeight="bold" fill={`${gold}0.8)`} fontFamily="sans-serif">
        φ = 1.618
      </text>
    </g>
  );
}

// ─── Simulation overlay ───────────────────────────────────────────────────────
// Draws "current" white lines and "target" gold lines side-by-side,
// or fades between them based on `mode`.

interface SimulationProps {
  currentGuide: DetectedGuide;
  targetGuide: DetectedGuide;
  mode: SimulationMode;
  px: (f: number) => number;
  py: (f: number) => number;
  sw: number;
}

function SimFaceLines({
  guide,
  px,
  py,
  sw,
  color,
  strokeW,
  dash,
  opacity,
}: {
  guide: DetectedGuide;
  px: (f: number) => number;
  py: (f: number) => number;
  sw: number;
  color: string;
  strokeW: number;
  dash: string;
  opacity: number;
}) {
  const cx     = px(guide.centerLineX);
  const fLeft  = px(guide.faceLeftX);
  const fRight = px(guide.faceRightX);
  const faceW  = fRight - fLeft;
  const topY   = py(guide.foreheadY);
  const botY   = py(guide.chinLineY);
  const xMar   = faceW * 0.10;
  const lL     = fLeft  - xMar;
  const lR     = fRight + xMar;

  const eyeY  = py(guide.eyeLineY);
  const browY = py(guide.eyebrowLineY);
  const noseY = py(guide.noseBaseLineY);
  const lipY  = py(guide.lipLineY);
  const chinY = py(guide.chinLineY);

  const eyeDist = px(guide.rightEyeX) - px(guide.leftEyeX);
  const eyeR = Math.max(8, eyeDist * 0.18);

  const tick = (y: number) => (
    <>
      <line x1={lL - 4} y1={y - 4} x2={lL - 4} y2={y + 4} stroke={color} strokeWidth={strokeW} strokeOpacity={opacity} />
      <line x1={lR + 4} y1={y - 4} x2={lR + 4} y2={y + 4} stroke={color} strokeWidth={strokeW} strokeOpacity={opacity} />
    </>
  );

  return (
    <g>
      {/* Face box */}
      <rect
        x={fLeft} y={topY} width={faceW} height={botY - topY}
        fill="none" stroke={color} strokeWidth={strokeW * 0.7}
        strokeDasharray={dash} strokeOpacity={opacity * 0.5}
      />
      {/* Center vertical */}
      <line x1={cx} y1={topY} x2={cx} y2={botY}
        stroke={color} strokeWidth={strokeW * 0.7} strokeDasharray={dash} strokeOpacity={opacity * 0.6} />
      {/* Horizontal feature lines */}
      {[
        { y: browY, label: '眉' },
        { y: eyeY,  label: '目' },
        { y: noseY, label: '鼻' },
        { y: lipY,  label: '口' },
        { y: chinY, label: '顎' },
      ].map(({ y, label }) => (
        <g key={label}>
          <line x1={lL} y1={y} x2={lR} y2={y}
            stroke={color} strokeWidth={strokeW} strokeDasharray={dash} strokeOpacity={opacity} />
          {tick(y)}
        </g>
      ))}
      {/* Eye circles */}
      {[
        { ex: px(guide.leftEyeX),  ey: py(guide.leftEyeY) },
        { ex: px(guide.rightEyeX), ey: py(guide.rightEyeY) },
      ].map((e, i) => (
        <circle key={i} cx={e.ex} cy={e.ey} r={eyeR}
          fill="none" stroke={color} strokeWidth={strokeW} strokeOpacity={opacity * 0.85} />
      ))}
      {/* Lip bar */}
      <line
        x1={cx - faceW * 0.2} y1={lipY} x2={cx + faceW * 0.2} y2={lipY}
        stroke={color} strokeWidth={strokeW * 1.4} strokeLinecap="round" strokeOpacity={opacity} />
    </g>
  );
}

function SimulationOverlay({ currentGuide, targetGuide, mode, px, py, sw }: SimulationProps) {
  const isCurrent = mode === 'current';

  const fLeft  = px(currentGuide.faceLeftX);
  const fRight = px(currentGuide.faceRightX);
  const faceW  = fRight - fLeft;
  const topY   = py(currentGuide.foreheadY);
  const botY   = py(currentGuide.chinLineY);

  // Delta arrows — show shift for eye and lip lines
  const eyeCurrentY  = py(currentGuide.eyeLineY);
  const eyeTargetY   = py(targetGuide.eyeLineY);
  const lipCurrentY  = py(currentGuide.lipLineY);
  const lipTargetY   = py(targetGuide.lipLineY);
  const arrowX       = fRight + (faceW * 0.15);

  return (
    <g>
      {/* Current lines — white, always shown at lower opacity when in target mode */}
      <SimFaceLines
        guide={currentGuide} px={px} py={py} sw={sw}
        color="rgba(255,255,255,1)"
        strokeW={isCurrent ? 1.8 : 1}
        dash="5 5"
        opacity={isCurrent ? 0.90 : 0.30}
      />

      {/* Target lines — gold, always shown at lower opacity when in current mode */}
      <SimFaceLines
        guide={targetGuide} px={px} py={py} sw={sw}
        color="rgba(212,175,90,1)"
        strokeW={isCurrent ? 1 : 2}
        dash={isCurrent ? '3 7' : 'none'}
        opacity={isCurrent ? 0.30 : 0.95}
      />

      {/* Shift arrows — only shown in target mode where there's a meaningful delta */}
      {!isCurrent && (
        <g>
          {Math.abs(eyeCurrentY - eyeTargetY) > 2 && (
            <ShiftArrow
              x={arrowX}
              fromY={eyeCurrentY}
              toY={eyeTargetY}
              label="目"
            />
          )}
          {Math.abs(lipCurrentY - lipTargetY) > 2 && (
            <ShiftArrow
              x={arrowX + 22}
              fromY={lipCurrentY}
              toY={lipTargetY}
              label="口"
            />
          )}
        </g>
      )}

      {/* Legend pill */}
      <LegendPill
        x={fLeft}
        y={botY + 14}
        isCurrent={isCurrent}
        faceW={faceW}
      />
    </g>
  );
}

function ShiftArrow({ x, fromY, toY, label }: { x: number; fromY: number; toY: number; label: string }) {
  const isUp    = toY < fromY;
  const arrowTip = toY;
  const arrowBase = fromY;
  const headLen = 7;
  const headW   = 4;

  return (
    <g>
      {/* Shaft */}
      <line x1={x} y1={arrowBase} x2={x} y2={arrowTip + (isUp ? headLen : -headLen)}
        stroke="rgba(212,175,90,0.9)" strokeWidth="1.5" />
      {/* Arrowhead */}
      <polygon
        points={`${x},${arrowTip} ${x - headW},${arrowTip + (isUp ? headLen : -headLen)} ${x + headW},${arrowTip + (isUp ? headLen : -headLen)}`}
        fill="rgba(212,175,90,0.9)"
      />
      {/* Label */}
      <text x={x} y={Math.min(arrowBase, arrowTip) - 6}
        fontSize="9" fill="rgba(212,175,90,1)" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">
        {label}
      </text>
      {/* From dot */}
      <circle cx={x} cy={arrowBase} r="3" fill="rgba(255,255,255,0.7)" />
    </g>
  );
}

function LegendPill({ x, y, isCurrent, faceW }: { x: number; y: number; isCurrent: boolean; faceW: number }) {
  const pillW = Math.min(faceW, 260);
  const pillH = 22;
  const rx = x + (faceW - pillW) / 2;

  return (
    <g>
      <rect x={rx} y={y} width={pillW} height={pillH} rx="11" ry="11"
        fill="rgba(10,8,5,0.70)" />
      {isCurrent ? (
        <>
          <circle cx={rx + 14} cy={y + 11} r="4" fill="rgba(255,255,255,0.85)" />
          <text x={rx + 22} y={y + 15.5} fontSize="9.5" fill="rgba(255,255,255,0.90)" fontFamily="sans-serif">
            現在の位置（白線）
          </text>
          <circle cx={rx + pillW - 90} cy={y + 11} r="4" fill="rgba(212,175,90,0.5)" />
          <text x={rx + pillW - 82} y={y + 15.5} fontSize="9.5" fill="rgba(212,175,90,0.65)" fontFamily="sans-serif">
            参考位置（金線）
          </text>
        </>
      ) : (
        <>
          <circle cx={rx + 14} cy={y + 11} r="4" fill="rgba(255,255,255,0.4)" />
          <text x={rx + 22} y={y + 15.5} fontSize="9.5" fill="rgba(255,255,255,0.55)" fontFamily="sans-serif">
            現在（白線）
          </text>
          <circle cx={rx + pillW - 110} cy={y + 11} r="4" fill="rgba(212,175,90,0.9)" />
          <text x={rx + pillW - 102} y={y + 15.5} fontSize="9.5" fill="rgba(212,175,90,1)" fontFamily="sans-serif">
            この位置でバランスが整います（金線）
          </text>
        </>
      )}
    </g>
  );
}

// ─── Triangle overlay ────────────────────────────────────────────────────────

interface TriangleOverlayProps {
  ta: TriangleAnalysis;
  px: (f: number) => number;
  py: (f: number) => number;
}

function TriangleOverlay({ ta, px, py }: TriangleOverlayProps) {
  const ax = px(ta.leftPupil.x);
  const ay = py(ta.leftPupil.y);
  const bx = px(ta.rightPupil.x);
  const by = py(ta.rightPupil.y);
  const cx = px(ta.mouthCenter.x);
  const cy = py(ta.mouthCenter.y);

  const pts = `${ax},${ay} ${bx},${by} ${cx},${cy}`;
  const dotR = 6;

  // Label position: above eye line midpoint
  const labelX = (ax + bx) / 2;
  const labelY = Math.min(ay, by) - 14;
  const labelText = `比率 ${ta.ratio.toFixed(2)}`;
  const labelW = labelText.length * 6.5 + 16;

  return (
    <g>
      {/* Soft glow shadow */}
      <polygon
        points={pts}
        fill="rgba(201,169,110,0.06)"
        stroke="rgba(201,169,110,0.25)"
        strokeWidth="8"
        strokeLinejoin="round"
        style={{ filter: 'blur(4px)' }}
      />
      {/* Main filled triangle */}
      <polygon
        points={pts}
        fill="rgba(201,169,110,0.13)"
        stroke="rgba(230,207,167,0.95)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeDasharray="none"
      />

      {/* Edge highlight (inner bright line) */}
      <polygon
        points={pts}
        fill="none"
        stroke="rgba(255,243,210,0.45)"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Vertex markers */}
      {[{ x: ax, y: ay }, { x: bx, y: by }, { x: cx, y: cy }].map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={dotR + 5} fill="rgba(201,169,110,0.15)" />
          <circle cx={pt.x} cy={pt.y} r={dotR + 1} fill="rgba(0,0,0,0.25)" />
          <circle cx={pt.x} cy={pt.y} r={dotR} fill="rgba(230,207,167,1)" />
          <circle cx={pt.x} cy={pt.y} r={dotR - 2.5} fill="rgba(255,250,235,0.7)" />
        </g>
      ))}

      {/* Ratio badge */}
      <g>
        <rect
          x={labelX - labelW / 2} y={labelY - 14}
          width={labelW} height={18}
          rx="5" ry="5"
          fill="rgba(15,12,8,0.72)"
          stroke="rgba(201,169,110,0.5)"
          strokeWidth="1"
        />
        <text
          x={labelX} y={labelY}
          fontSize="11" fill="rgba(230,207,167,1)"
          textAnchor="middle" fontFamily="sans-serif" fontWeight="bold"
        >
          {labelText}
        </text>
      </g>
    </g>
  );
}
