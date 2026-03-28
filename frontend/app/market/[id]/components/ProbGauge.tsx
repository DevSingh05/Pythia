"use client";

import { useMarketStore } from "@/lib/store";
import { useEffect, useRef } from "react";

const RADIUS  = 90;
const STROKE  = 14;
const CX      = 110;
const CY      = 110;
const START   = Math.PI * 0.8;  // 144° from positive x-axis (bottom-left)
const END     = Math.PI * 0.2;  // 36°  (bottom-right)
const ARC_LEN = Math.PI * 1.6;  // 288° arc span

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function ProbGauge({ size = 220 }: { size?: number }) {
  const prob    = useMarketStore((s) => s.currentProb);
  const prevRef = useRef(prob);

  // Animate the needle with CSS transition via transform
  const angle = START + ARC_LEN * prob;

  // Track value direction for colour flash
  const direction = prob > prevRef.current ? "up" : prob < prevRef.current ? "down" : "none";
  useEffect(() => { prevRef.current = prob; }, [prob]);

  const needleTip = polarToCartesian(CX, CY, RADIUS - 5, angle);
  const needleBase1 = polarToCartesian(CX, CY, 12, angle + Math.PI / 2);
  const needleBase2 = polarToCartesian(CX, CY, 12, angle - Math.PI / 2);

  // Track fill (0→prob)
  const trackEnd = START + ARC_LEN * prob;
  const fillColour =
    prob >= 0.7 ? "#22c55e" : prob >= 0.4 ? "#3b82f6" : "#ef4444";

  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 220 154"
      aria-label={`Probability gauge: ${(prob * 100).toFixed(1)}%`}
    >
      {/* Background track */}
      <path
        d={arcPath(CX, CY, RADIUS, START, START + ARC_LEN)}
        fill="none"
        stroke="#1f2937"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />

      {/* Filled track */}
      <path
        d={arcPath(CX, CY, RADIUS, START, trackEnd)}
        fill="none"
        stroke={fillColour}
        strokeWidth={STROKE}
        strokeLinecap="round"
        style={{ transition: "all 0.5s ease" }}
      />

      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={fillColour}
        style={{ transition: "all 0.5s ease" }}
        opacity={0.9}
      />
      <circle cx={CX} cy={CY} r={8} fill="#374151" />
      <circle cx={CX} cy={CY} r={4} fill={fillColour} />

      {/* Centre label */}
      <text
        x={CX}
        y={CY + 36}
        textAnchor="middle"
        fontSize={28}
        fontWeight="bold"
        fill={direction === "up" ? "#22c55e" : direction === "down" ? "#ef4444" : "#f9fafb"}
        fontFamily="ui-monospace, monospace"
        style={{ transition: "fill 0.3s" }}
      >
        {(prob * 100).toFixed(1)}%
      </text>

      {/* Axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const a = START + ARC_LEN * p;
        const pt = polarToCartesian(CX, CY, RADIUS + 18, a);
        return (
          <text
            key={p}
            x={pt.x}
            y={pt.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            fill="#6b7280"
          >
            {(p * 100).toFixed(0)}
          </text>
        );
      })}
    </svg>
  );
}
