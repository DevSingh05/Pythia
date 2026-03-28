"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useMarketStore } from "@/lib/store";
import { useQuery }       from "@tanstack/react-query";
import { useParams }      from "next/navigation";

export function DistributionCurve() {
  const params = useParams<{ id: string }>();
  const { currentProb, vol, position } = useMarketStore();
  const tauDays = position?.tau_days ?? 14;

  const { data, isLoading } = useQuery({
    queryKey: ["distribution", currentProb, vol, tauDays],
    queryFn:  async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_PRICING_URL ?? ""}/api/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p0: currentProb, sigma: vol, tau_days: tauDays,
          strike: 0.5, kind: "call",
        }),
      });
      // Use internal distribution endpoint via a separate fetch
      const distRes = await fetch("/api/payoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: [{ kind: "call", strike: 0.0, premium: 0, size: 0 }],
          steps: 200,
        }),
      });
      return distRes.json();
    },
    staleTime: 10_000,
  });

  // Build distribution from logit-normal analytically (client-side)
  const chartData = buildDistribution(currentProb, vol, tauDays);

  if (!chartData.length) {
    return <div className="h-28 bg-gray-900 rounded-lg" />;
  }

  const maxDensity = Math.max(...chartData.map((d) => d.density));

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs text-gray-500 uppercase tracking-wide">
          Implied Distribution · {tauDays}d
        </h3>
        <span className="text-xs text-gray-600">
          Logit-Normal(L₀={logit(currentProb).toFixed(2)}, σ√τ={
            (vol * Math.sqrt(tauDays / 252)).toFixed(2)
          })
        </span>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="pct"
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#4b5563", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip
            formatter={(v: number) => [v.toFixed(3), "Density"]}
            labelFormatter={(l) => `p = ${l}%`}
            contentStyle={{ background: "#111827", border: "1px solid #1f2937", fontSize: 11 }}
          />
          {/* Current prob */}
          <ReferenceLine
            x={+(currentProb * 100).toFixed(0)}
            stroke="#3b82f6"
            strokeDasharray="3 2"
          />
          {/* Strike if selected */}
          {position?.strike && (
            <ReferenceLine
              x={+(position.strike * 100).toFixed(0)}
              stroke={position.kind === "call" ? "#22c55e" : "#ef4444"}
              strokeDasharray="2 2"
            />
          )}
          {/* 1σ range */}
          {(() => {
            const std = vol * Math.sqrt(tauDays / 252);
            const L0  = logit(currentProb);
            const lo  = sigmoid(L0 - std) * 100;
            const hi  = sigmoid(L0 + std) * 100;
            return (
              <>
                <ReferenceLine x={+lo.toFixed(0)} stroke="#374151" strokeDasharray="1 2" />
                <ReferenceLine x={+hi.toFixed(0)} stroke="#374151" strokeDasharray="1 2" />
              </>
            );
          })()}
          <Area
            type="monotone"
            dataKey="density"
            stroke="#3b82f6"
            fill="url(#distGrad)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Client-side logit-normal distribution ──────────────────────────────────────

function logit(p: number): number {
  const c = Math.max(1e-6, Math.min(1 - 1e-6, p));
  return Math.log(c / (1 - c));
}

function sigmoid(l: number): number {
  return 1 / (1 + Math.exp(-l));
}

function normalPdf(x: number, mu: number, sigma: number): number {
  return (
    Math.exp(-0.5 * ((x - mu) / sigma) ** 2) /
    (sigma * Math.sqrt(2 * Math.PI))
  );
}

function buildDistribution(p0: number, vol: number, tauDays: number) {
  const L0  = logit(p0);
  const std = vol * Math.sqrt(tauDays / 252);

  return Array.from({ length: 201 }, (_, i) => {
    const p    = i / 200;
    const pc   = Math.max(1e-4, Math.min(1 - 1e-4, p));
    const L    = logit(pc);
    const fL   = normalPdf(L, L0, std);
    const jac  = pc * (1 - pc);  // |dp/dL|
    const fP   = jac > 1e-10 ? fL / jac : 0;
    return { pct: +(p * 100).toFixed(0), density: +fP.toFixed(4) };
  });
}
