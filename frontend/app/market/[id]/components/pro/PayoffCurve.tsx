"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMarketStore } from "@/lib/store";
import { useEffect, useState } from "react";

function computePayoff(
  probs: number[],
  kind: "call" | "put",
  strike: number,
  premium: number
) {
  return probs.map((p) => {
    const intrinsic =
      kind === "call" ? Math.max(p - strike, 0) : Math.max(strike - p, 0);
    return { p: +(p * 100).toFixed(0), pnl: +(intrinsic - premium).toFixed(4) };
  });
}

export function PayoffCurve() {
  const { position, currentProb } = useMarketStore();
  const [data, setData] = useState<Array<{ p: number; pnl: number }>>([]);

  useEffect(() => {
    if (!position) return;
    const probs = Array.from({ length: 101 }, (_, i) => i / 100);
    setData(computePayoff(probs, position.kind, position.strike, position.premium));
  }, [position]);

  if (!position || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
        Select a contract to see payoff curve.
      </div>
    );
  }

  const breakeven =
    position.kind === "call"
      ? (position.strike + position.premium) * 100
      : (position.strike - position.premium) * 100;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Payoff at Expiry</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="p"
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            domain={[0, 100]}
          />
          <YAxis
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            width={45}
          />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(4)}`, "P&L"]}
            labelFormatter={(l) => `p = ${l}%`}
            contentStyle={{ background: "#111827", border: "1px solid #1f2937", color: "#f9fafb" }}
          />
          {/* Zero line */}
          <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
          {/* Breakeven */}
          <ReferenceLine
            x={+breakeven.toFixed(0)}
            stroke="#f97316"
            strokeDasharray="3 3"
            label={{ value: "BE", fill: "#f97316", fontSize: 10, position: "insideTopRight" }}
          />
          {/* Current prob */}
          <ReferenceLine
            x={+(currentProb * 100).toFixed(0)}
            stroke="#3b82f6"
            strokeDasharray="3 3"
            label={{ value: "p", fill: "#3b82f6", fontSize: 10, position: "insideTopRight" }}
          />
          {/* Strike */}
          <ReferenceLine
            x={+(position.strike * 100).toFixed(0)}
            stroke="#6b7280"
            strokeDasharray="2 2"
          />
          <Line
            type="linear"
            dataKey="pnl"
            stroke={position.kind === "call" ? "#22c55e" : "#ef4444"}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
