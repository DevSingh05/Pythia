"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { useQuery }         from "@tanstack/react-query";
import { useMarketStore }   from "@/lib/store";
import { getBoundary }      from "@/lib/api";

export function ExerciseBoundary() {
  const { position, currentProb, vol } = useMarketStore();

  const enabled = !!position;

  const { data, isLoading } = useQuery({
    queryKey: [
      "boundary",
      position?.kind,
      position?.strike,
      position?.tau_days,
      vol,
    ],
    queryFn:  () =>
      getBoundary({
        K:        position!.strike,
        sigma:    vol,
        tau_days: position!.tau_days,
        kind:     position!.kind,
      }),
    enabled,
    staleTime: 30_000,
  });

  if (!position) {
    return (
      <div className="text-gray-600 text-sm text-center py-4">
        Select a contract to see early exercise boundary.
      </div>
    );
  }

  const boundary: Array<{ tau_days: number; p_star: number }> =
    data?.boundary ?? [];

  // Find p* at current tau
  const currentBoundary = boundary.find(
    (b) => Math.abs(b.tau_days - position.tau_days) < 1
  );

  const isInExerciseZone =
    currentBoundary !== undefined &&
    (position.kind === "call"
      ? currentProb >= currentBoundary.p_star
      : currentProb <= currentBoundary.p_star);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-gray-300">
          Early Exercise Boundary
        </h3>
        {isInExerciseZone && (
          <span className="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-400 border border-green-800 animate-pulse">
            Exercise now optimal
          </span>
        )}
        {currentBoundary && !isInExerciseZone && (
          <span className="text-xs text-gray-500">
            Hold for time value
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
          Computing boundary...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart
            data={boundary}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="tau_days"
              reversed
              tickFormatter={(v) => `${v}d`}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              label={{ value: "Days remaining", fill: "#4b5563", fontSize: 10, position: "insideBottom", dy: 8 }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              width={40}
            />
            <Tooltip
              formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "p* (exercise threshold)"]}
              labelFormatter={(l) => `${l} days remaining`}
              contentStyle={{
                background: "#111827",
                border: "1px solid #1f2937",
                color: "#f9fafb",
                fontSize: 11,
              }}
            />

            {/* Strike reference */}
            <ReferenceLine
              y={position.strike}
              stroke="#4b5563"
              strokeDasharray="3 3"
              label={{ value: `K=${(position.strike * 100).toFixed(0)}%`, fill: "#6b7280", fontSize: 9 }}
            />

            {/* Current prob */}
            <ReferenceLine
              y={currentProb}
              stroke="#3b82f6"
              strokeDasharray="3 3"
              label={{ value: "p", fill: "#3b82f6", fontSize: 10, position: "insideRight" }}
            />

            {/* Exercise zone annotation */}
            {position.kind === "call" ? (
              <ReferenceArea y1={0.95} y2={1} fill="#22c55e" fillOpacity={0.05} />
            ) : (
              <ReferenceArea y1={0} y2={0.05} fill="#ef4444" fillOpacity={0.05} />
            )}

            <Line
              type="monotone"
              dataKey="p_star"
              stroke={position.kind === "call" ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <p className="text-xs text-gray-600 mt-2">
        {position.kind === "call"
          ? "Zone above the line → exercise immediately. Zone below → hold for time value."
          : "Zone below the line → exercise immediately. Zone above → hold for time value."}
      </p>
    </div>
  );
}
