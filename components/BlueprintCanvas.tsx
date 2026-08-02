'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DetectedGuide } from '@/lib/faceLandmarks';
import type { TriangleAnalysis } from '@/types/analysis';

export interface BlueprintCanvasProps {
  imageSrc: string;
  guide: DetectedGuide;
  triangleAnalysis: TriangleAnalysis | null;
  /** When true, animates blueprint layers in sequence (create/update only). */
  animate?: boolean;
  /** Called when the animation sequence completes. */
  onAnimationComplete?: () => void;
}

// Champagne gold + warm white blueprint palette
const GOLD       = 'rgba(201,169,110,';  // #C9A96E — gold
const CHAMPAGNE  = 'rgba(230,207,167,';  // #E6CFA7 — champagne
const WARM_WHITE = 'rgba(252,248,240,';  // warm white
const AMBER      = 'rgba(201,169,110,';  // same as gold for consistency

// Animation step timings (ms) — each layer fades in sequentially
const ANIM_STEPS = {
  photo:      0,
  centerLine: 400,
  horizontal: 800,
  triangle:   1200,
  goldenRatio:1600,
  measurements:2000,
  complete:   2400,
};

export default function BlueprintCanvas({
  imageSrc,
  guide,
  triangleAnalysis,
  animate = false,
  onAnimationComplete,
}: BlueprintCanvasProps) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [animStep, setAnimStep] = useState(animate ? 0 : 6); // 6 = all visible
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

  // Animation sequence
  useEffect(() => {
    if (!animate) return;
    setAnimStep(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    (Object.keys(ANIM_STEPS) as (keyof typeof ANIM_STEPS)[]).forEach((key) => {
      timers.push(setTimeout(() => {
        setAnimStep((prev) => Math.max(prev, ANIM_STEPS[key] / 400 + 1));
      }, ANIM_STEPS[key]));
    });
    timers.push(setTimeout(() => {
      setAnimStep(6);
      onAnimationComplete?.();
    }, ANIM_STEPS.complete + 200));
    return () => timers.forEach(clearTimeout);
  }, [animate, onAnimationComplete]);

  const sw = imgSize?.w ?? 0;
  const sh = imgSize?.h ?? 0;

  const px = (fx: number) => fx * sw;
  const py = (fy: number) => fy * sh;

  const showOverlay = imgSize && guide;

  // Layer visibility based on animation step
  const showCenter     = animStep >= 1;
  const showHorizontal  = animStep >= 2;
  const showTriangle    = animStep >= 3;
  const showGoldenRatio = animStep >= 4;
  const showMeasurements = animStep >= 5;
  const allVisible      = animStep >= 6;

  return (
    <div className="relative inline-block max-w-full" style={{ lineHeight: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="顔の設計図"
        onLoad={handleLoad}
        className="block rounded-xl"
        style={{
          maxWidth: '100%',
          maxHeight: '500px',
          objectFit: 'contain',
          filter: 'saturate(0.45) contrast(1.08) brightness(0.88)',
        }}
      />

      {/* Blueprint grid background overlay */}
      {imgSize && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-700"
          style={{
            opacity: allVisible ? 0.10 : 0.06,
            backgroundImage: `
              linear-gradient(to right, ${CHAMPAGNE}0.6) 1px, transparent 1px),
              linear-gradient(to bottom, ${CHAMPAGNE}0.6) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
          }}
        />
      )}

      {/* Major grid lines */}
      {imgSize && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl transition-opacity duration-700"
          style={{
            opacity: allVisible ? 0.06 : 0.03,
            backgroundImage: `
              linear-gradient(to right, ${GOLD}0.4) 1px, transparent 1px),
              linear-gradient(to bottom, ${GOLD}0.4) 1px, transparent 1px)
            `,
            backgroundSize: '100px 100px',
          }}
        />
      )}

      {/* Corner drafting marks */}
      {imgSize && (
        <>
          <div className="absolute top-1.5 left-1.5 w-5 h-5 border-l-2 border-t-2 border-champagne/70 pointer-events-none" />
          <div className="absolute top-1.5 right-1.5 w-5 h-5 border-r-2 border-t-2 border-champagne/70 pointer-events-none" />
          <div className="absolute bottom-1.5 left-1.5 w-5 h-5 border-l-2 border-b-2 border-champagne/70 pointer-events-none" />
          <div className="absolute bottom-1.5 right-1.5 w-5 h-5 border-r-2 border-b-2 border-champagne/70 pointer-events-none" />
        </>
      )}

      {/* Structural overlay */}
      {showOverlay && (
        <svg
          viewBox={`0 0 ${sw} ${sh}`}
          width={sw}
          height={sh}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          className="rounded-xl"
        >
          <BlueprintOverlay
            guide={guide}
            ta={triangleAnalysis}
            px={px}
            py={py}
            sw={sw}
            sh={sh}
            showCenter={showCenter || allVisible}
            showHorizontal={showHorizontal || allVisible}
            showTriangle={showTriangle || allVisible}
            showGoldenRatio={showGoldenRatio || allVisible}
            showMeasurements={showMeasurements || allVisible}
          />
        </svg>
      )}

      {/* Branding signature — bottom-right of image */}
      {imgSize && (
        <div
          className="absolute pointer-events-none transition-opacity duration-700"
          style={{
            bottom: 8,
            right: 12,
            opacity: allVisible ? 0.55 : 0,
          }}
        >
          <p
            className="text-[8px] tracking-[0.15em] text-champagne font-medium leading-tight text-right"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            Face Identity Blueprint
            <br />
            <span className="text-[7px] tracking-[0.2em]">Generated by Face OS</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Blueprint overlay ─────────────────────────────────────────────────────────

interface BlueprintOverlayProps {
  guide: DetectedGuide;
  ta: TriangleAnalysis | null;
  px: (f: number) => number;
  py: (f: number) => number;
  sw: number;
  sh: number;
  showCenter: boolean;
  showHorizontal: boolean;
  showTriangle: boolean;
  showGoldenRatio: boolean;
  showMeasurements: boolean;
}

function BlueprintOverlay({
  guide, ta, px, py, sw, sh,
  showCenter, showHorizontal, showTriangle, showGoldenRatio, showMeasurements,
}: BlueprintOverlayProps) {
  const cx = px(guide.centerLineX);
  const fLeft = px(guide.faceLeftX);
  const fRight = px(guide.faceRightX);
  const faceW = fRight - fLeft;
  const topY = py(guide.foreheadY);
  const browY = py(guide.eyebrowLineY);
  const eyeY = py(guide.eyeLineY);
  const noseY = py(guide.noseBaseLineY);
  const lipY = py(guide.lipLineY);
  const chinY = py(guide.chinLineY);
  const faceH = chinY - topY;

  const xMargin = faceW * 0.12;
  const lineLeft = fLeft - xMargin;
  const lineRight = fRight + xMargin;

  // Golden ratio rectangle
  const PHI = 1.618;
  const grH = faceH;
  const grW = grH / PHI;
  const grLeft = cx - grW / 2;
  const grRight = grLeft + grW;

  // Vertical thirds
  const third1 = topY + faceH * (1 / 3);
  const third2 = topY + faceH * (2 / 3);

  // Horizontal fifths
  const fifth = faceW / 5;

  // Pupil positions
  const lpx = px(guide.leftPupilX);
  const lpy = py(guide.leftPupilY);
  const rpx = px(guide.rightPupilX);
  const rpy = py(guide.rightPupilY);

  // Eye corners
  const lOuter = px(guide.leftEyeOuterX);
  const lInner = px(guide.leftEyeInnerX);
  const rInner = px(guide.rightEyeInnerX);
  const rOuter = px(guide.rightEyeOuterX);

  // Mouth center
  const mx = px(guide.mouthCenterX);
  const my = py(guide.mouthCenterY);

  const eyeDist = Math.abs(rpx - lpx);

  const fontSm = '9px';
  const fontMd = '10px';
  const fontMono = 'monospace';

  return (
    <g>
      {/* ── Face boundary box ── */}
      <rect
        x={fLeft} y={topY} width={faceW} height={faceH}
        fill="none"
        stroke={`${GOLD}0.35)`}
        strokeWidth="1.5"
      />
      {/* Face box corner markers */}
      {[
        [fLeft, topY], [fRight, topY], [fLeft, chinY], [fRight, chinY],
      ].map(([x, y], i) => (
        <g key={`fb-${i}`}>
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke={`${CHAMPAGNE}0.8)`} strokeWidth="1.5" />
          <line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke={`${CHAMPAGNE}0.8)`} strokeWidth="1.5" />
        </g>
      ))}

      {/* ── Vertical center line ── */}
      {showCenter && (
        <g className="transition-opacity duration-500" style={{ opacity: 1 }}>
          <line
            x1={cx} y1={topY - 12} x2={cx} y2={chinY + 12}
            stroke={`${CHAMPAGNE}0.85)`}
            strokeWidth="1.5"
            strokeDasharray="8 4"
          />
          <line x1={cx - 8} y1={topY - 12} x2={cx + 8} y2={topY - 12} stroke={`${GOLD}0.9)`} strokeWidth="1.5" />
          <line x1={cx - 8} y1={chinY + 12} x2={cx + 8} y2={chinY + 12} stroke={`${GOLD}0.9)`} strokeWidth="1.5" />
          <text x={cx + 10} y={topY - 6} textAnchor="start"
            fill={`${GOLD}0.85)`} fontSize={fontSm} fontFamily={fontMono}>
            CENTER
          </text>
        </g>
      )}

      {/* ── Horizontal reference lines ── */}
      {showHorizontal && (
        <g className="transition-opacity duration-500" style={{ opacity: 1 }}>
          {/* Forehead/hairline */}
          <line x1={lineLeft} y1={topY} x2={lineRight} y2={topY}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1.5" strokeDasharray="4 4" />
          {/* Eyebrow line */}
          <line x1={lineLeft} y1={browY} x2={lineRight} y2={browY}
            stroke={`${GOLD}0.6)`} strokeWidth="1" strokeDasharray="3 5" />
          {/* Eye line */}
          <line x1={lineLeft} y1={eyeY} x2={lineRight} y2={eyeY}
            stroke={`${CHAMPAGNE}0.8)`} strokeWidth="1.5" strokeDasharray="4 4" />
          {/* Nose base line */}
          <line x1={lineLeft} y1={noseY} x2={lineRight} y2={noseY}
            stroke={`${GOLD}0.6)`} strokeWidth="1" strokeDasharray="3 5" />
          {/* Lip line */}
          <line x1={lineLeft} y1={lipY} x2={lineRight} y2={lipY}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1.5" strokeDasharray="4 4" />
          {/* Chin line */}
          <line x1={lineLeft} y1={chinY} x2={lineRight} y2={chinY}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1.5" strokeDasharray="4 4" />

          {/* Horizontal line end ticks */}
          {[topY, browY, eyeY, noseY, lipY, chinY].map((y, i) => (
            <g key={`ht-${i}`}>
              <line x1={lineLeft - 4} y1={y - 4} x2={lineLeft - 4} y2={y + 4} stroke={`${GOLD}0.8)`} strokeWidth="1.5" />
              <line x1={lineRight + 4} y1={y - 4} x2={lineRight + 4} y2={y + 4} stroke={`${GOLD}0.8)`} strokeWidth="1.5" />
            </g>
          ))}

          {/* Vertical thirds division lines */}
          <line x1={grLeft - 8} y1={third1} x2={grRight + 8} y2={third1}
            stroke={`${GOLD}0.5)`} strokeWidth="1" strokeDasharray="2 4" />
          <line x1={grLeft - 8} y1={third2} x2={grRight + 8} y2={third2}
            stroke={`${GOLD}0.5)`} strokeWidth="1" strokeDasharray="2 4" />

          {/* Horizontal fifths */}
          {[1, 2, 3, 4].map(i => {
            const x = fLeft + fifth * i;
            return (
              <line key={`fifth-${i}`} x1={x} y1={eyeY - 14} x2={x} y2={eyeY + 14}
                stroke={`${GOLD}0.5)`} strokeWidth="1" strokeDasharray="2 3" />
            );
          })}

          {/* Section labels on the right side */}
          {[
            { y: topY,  label: 'UPPER' },
            { y: browY, label: 'BROW' },
            { y: eyeY,  label: 'EYE' },
            { y: noseY, label: 'NOSE' },
            { y: lipY,  label: 'MOUTH' },
            { y: chinY, label: 'LOWER' },
          ].map((s, i) => (
            <text key={`sl-${i}`} x={lineRight + 8} y={s.y + 3} textAnchor="start"
              fill={`${CHAMPAGNE}0.85)`} fontSize={fontSm} fontFamily={fontMono} fontWeight="bold">
              {s.label}
            </text>
          ))}
        </g>
      )}

      {/* ── Eye-to-mouth inverted triangle ── */}
      {showTriangle && ta && (
        (() => {
          const ax = px(ta.leftPupil.x);
          const ay = py(ta.leftPupil.y);
          const bx = px(ta.rightPupil.x);
          const by = py(ta.rightPupil.y);
          const pts = `${ax},${ay} ${bx},${by} ${mx},${my}`;
          return (
            <g className="transition-opacity duration-500" style={{ opacity: 1 }}>
              <polygon
                points={pts}
                fill={`${AMBER}0.06)`}
                stroke={`${AMBER}0.7)`}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <text x={(ax + bx) / 2} y={ay - 4} textAnchor="middle"
                fill={`${AMBER}0.85)`} fontSize={fontSm} fontFamily={fontMono}>
                △ TRI
              </text>
            </g>
          );
        })()
      )}

      {/* ── Golden ratio guides ── */}
      {showGoldenRatio && (
        <g className="transition-opacity duration-500" style={{ opacity: 1 }}>
          <rect
            x={grLeft} y={topY} width={grW} height={grH}
            fill={`${AMBER}0.04)`}
            stroke={`${AMBER}0.55)`}
            strokeWidth="1.5" strokeDasharray="6 4"
          />
          {/* Golden ratio subdivision lines */}
          {[
            { ratio: 0.382, op: 0.4 },
            { ratio: 0.50,  op: 0.3 },
            { ratio: 0.618, op: 0.4 },
            { ratio: 0.75,  op: 0.3 },
          ].map(({ ratio, op }, i) => {
            const y = topY + grH * ratio;
            return (
              <line key={`gr-${i}`} x1={grLeft - 6} y1={y} x2={grRight + 6} y2={y}
                stroke={`${AMBER}${op})`} strokeWidth="1" strokeDasharray="3 5" />
            );
          })}
          <text x={grLeft + grW / 2} y={topY - 4} textAnchor="middle"
            fill={`${AMBER}0.9)`} fontSize={fontMd} fontFamily={fontMono} fontWeight="bold">
            φ = 1.618
          </text>
        </g>
      )}

      {/* ── Dimension lines and measurements ── */}
      {showMeasurements && (
        <g className="transition-opacity duration-500" style={{ opacity: 1 }}>
          {/* Face height dimension (left side) */}
          <line x1={lineLeft - 10} y1={topY} x2={lineLeft - 10} y2={chinY}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={lineLeft - 13} y1={topY + 5} x2={lineLeft - 7} y2={topY - 1}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={lineLeft - 13} y1={chinY - 5} x2={lineLeft - 7} y2={chinY + 1}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={fLeft} y1={topY} x2={lineLeft - 14} y2={topY}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <line x1={fLeft} y1={chinY} x2={lineLeft - 14} y2={chinY}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <text x={lineLeft - 16} y={topY + faceH / 2} textAnchor="middle"
            fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}
            transform={`rotate(-90, ${lineLeft - 16}, ${topY + faceH / 2})`}>
            H: FACE
          </text>

          {/* Face width dimension (top) */}
          <line x1={fLeft} y1={topY - 10} x2={fRight} y2={topY - 10}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={fLeft + 5} y1={topY - 13} x2={fLeft - 1} y2={topY - 7}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={fRight - 5} y1={topY - 13} x2={fRight + 1} y2={topY - 7}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={fLeft} y1={topY} x2={fLeft} y2={topY - 14}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <line x1={fRight} y1={topY} x2={fRight} y2={topY - 14}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <text x={cx} y={topY - 14} textAnchor="middle"
            fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}>
            W: FACE
          </text>

          {/* Eye distance dimension */}
          <line x1={lpx} y1={eyeY - 22} x2={rpx} y2={eyeY - 22}
            stroke={`${CHAMPAGNE}0.75)`} strokeWidth="1" />
          <line x1={lpx + 4} y1={eyeY - 25} x2={lpx - 1} y2={eyeY - 19}
            stroke={`${CHAMPAGNE}0.75)`} strokeWidth="1" />
          <line x1={rpx - 4} y1={eyeY - 25} x2={rpx + 1} y2={eyeY - 19}
            stroke={`${CHAMPAGNE}0.75)`} strokeWidth="1" />
          <line x1={lpx} y1={eyeY - 6} x2={lpx} y2={eyeY - 26}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <line x1={rpx} y1={eyeY - 6} x2={rpx} y2={eyeY - 26}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <text x={(lpx + rpx) / 2} y={eyeY - 26} textAnchor="middle"
            fill={`${CHAMPAGNE}0.95)`} fontSize={fontSm} fontFamily={fontMono} fontWeight="bold">
            Δ EYE
          </text>

          {/* Eye-to-mouth dimension */}
          <line x1={cx + 18} y1={eyeY} x2={cx + 18} y2={my}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={cx + 15} y1={eyeY + 4} x2={cx + 21} y2={eyeY - 1}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={cx + 15} y1={my - 4} x2={cx + 21} y2={my + 1}
            stroke={`${CHAMPAGNE}0.7)`} strokeWidth="1" />
          <line x1={cx + 6} y1={eyeY} x2={cx + 22} y2={eyeY}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <line x1={cx + 6} y1={my} x2={cx + 22} y2={my}
            stroke={`${GOLD}0.4)`} strokeWidth="0.8" strokeDasharray="2 3" />
          <text x={cx + 26} y={(eyeY + my) / 2 + 3} textAnchor="start"
            fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}>
            E↔M
          </text>

          {/* Landmark markers — pupils */}
          {[
            { x: lpx, y: lpy, label: 'L-EYE' },
            { x: rpx, y: rpy, label: 'R-EYE' },
          ].map((pt, i) => (
            <g key={`pupil-${i}`}>
              <circle cx={pt.x} cy={pt.y} r="5" fill="none" stroke={`${CHAMPAGNE}0.9)`} strokeWidth="1.5" />
              <circle cx={pt.x} cy={pt.y} r="2" fill={`${WARM_WHITE}0.9)`} />
              <line x1={pt.x - 9} y1={pt.y} x2={pt.x + 9} y2={pt.y} stroke={`${CHAMPAGNE}0.6)`} strokeWidth="0.8" />
              <line x1={pt.x} y1={pt.y - 9} x2={pt.x} y2={pt.y + 9} stroke={`${CHAMPAGNE}0.6)`} strokeWidth="0.8" />
              <text x={pt.x} y={pt.y - 13} textAnchor="middle"
                fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}>
                {pt.label}
              </text>
            </g>
          ))}

          {/* Eye corners */}
          {[
            { x: lOuter, y: eyeY },
            { x: lInner, y: eyeY },
            { x: rInner, y: eyeY },
            { x: rOuter, y: eyeY },
          ].map((pt, i) => (
            <g key={`corner-${i}`}>
              <circle cx={pt.x} cy={pt.y} r="3" fill="none" stroke={`${GOLD}0.8)`} strokeWidth="1" />
              <circle cx={pt.x} cy={pt.y} r="1" fill={`${WARM_WHITE}0.8)`} />
            </g>
          ))}

          {/* Mouth center */}
          <g>
            <circle cx={mx} cy={my} r="5" fill="none" stroke={`${CHAMPAGNE}0.9)`} strokeWidth="1.5" />
            <circle cx={mx} cy={my} r="2" fill={`${WARM_WHITE}0.9)`} />
            <line x1={mx - 9} y1={my} x2={mx + 9} y2={my} stroke={`${CHAMPAGNE}0.6)`} strokeWidth="0.8" />
            <line x1={mx} y1={my - 9} x2={mx} y2={my + 9} stroke={`${CHAMPAGNE}0.6)`} strokeWidth="0.8" />
            <text x={mx + 12} y={my + 3} textAnchor="start"
              fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}>
              MOUTH
            </text>
          </g>

          {/* Face edge landmarks */}
          {[
            { x: fLeft, y: eyeY, label: 'L-EDGE' },
            { x: fRight, y: eyeY, label: 'R-EDGE' },
          ].map((pt, i) => (
            <g key={`edge-${i}`}>
              <circle cx={pt.x} cy={pt.y} r="3" fill="none" stroke={`${GOLD}0.8)`} strokeWidth="1" />
              <circle cx={pt.x} cy={pt.y} r="1" fill={`${WARM_WHITE}0.8)`} />
              <text x={pt.x} y={pt.y + 16} textAnchor="middle"
                fill={`${GOLD}0.8)`} fontSize={fontSm} fontFamily={fontMono}>
                {pt.label}
              </text>
            </g>
          ))}

          {/* Chin landmark */}
          <g>
            <circle cx={cx} cy={chinY} r="4" fill="none" stroke={`${CHAMPAGNE}0.9)`} strokeWidth="1.5" />
            <circle cx={cx} cy={chinY} r="1.5" fill={`${WARM_WHITE}0.9)`} />
            <text x={cx} y={chinY + 18} textAnchor="middle"
              fill={`${CHAMPAGNE}0.9)`} fontSize={fontSm} fontFamily={fontMono}>
              CHIN
            </text>
          </g>

          {/* Measurement readout box (bottom-left, CAD-style) */}
          <g>
            <rect x={8} y={sh - 58} width={120} height={50}
              fill="rgba(40,30,15,0.75)" stroke={`${GOLD}0.5)`} strokeWidth="1" rx="2" />
            <text x={14} y={sh - 44} fill={`${CHAMPAGNE}0.95)`}
              fontSize={fontSm} fontFamily={fontMono} fontWeight="bold">
              MEASUREMENT
            </text>
            <text x={14} y={sh - 32} fill={`${WARM_WHITE}0.8)`}
              fontSize={fontSm} fontFamily={fontMono}>
              {`H/W = ${(faceH / faceW).toFixed(3)}`}
            </text>
            <text x={14} y={sh - 20} fill={`${WARM_WHITE}0.8)`}
              fontSize={fontSm} fontFamily={fontMono}>
              {`φ   = ${PHI.toFixed(3)}`}
            </text>
            <text x={14} y={sh - 8} fill={`${WARM_WHITE}0.8)`}
              fontSize={fontSm} fontFamily={fontMono}>
              {`ΔE  = ${(eyeDist / faceW * 100).toFixed(1)}%W`}
            </text>
          </g>

          {/* Scale bar (bottom-right) */}
          <g>
            <rect x={sw - 100} y={sh - 22} width={90} height={6}
              fill="none" stroke={`${GOLD}0.6)`} strokeWidth="1" />
            <rect x={sw - 100} y={sh - 22} width={18} height={6}
              fill={`${GOLD}0.5)`} />
            <rect x={sw - 64} y={sh - 22} width={18} height={6}
              fill={`${GOLD}0.5)`} />
            <rect x={sw - 28} y={sh - 22} width={18} height={6}
              fill={`${GOLD}0.5)`} />
            <text x={sw - 100} y={sh - 8} fill={`${CHAMPAGNE}0.8)`}
              fontSize={fontSm} fontFamily={fontMono}>
              SCALE 1:1
            </text>
          </g>
        </g>
      )}
    </g>
  );
}
