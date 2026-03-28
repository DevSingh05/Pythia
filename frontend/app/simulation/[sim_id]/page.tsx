"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery }         from "@tanstack/react-query";
import { getSimulation }    from "@/lib/api";
import { useSimulationStore, type SimTick } from "@/lib/store";
import { ProbGauge }        from "../../market/[id]/components/ProbGauge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";
import { useMarketStore }   from "@/lib/store";

export default function SimulationPage() {
  const params = useParams<{ sim_id: string }>();
  const router = useRouter();

  const {
    series, setSeries, setSimId,
    playing, setPlaying,
    speed, setSpeed,
    currentTick, setCurrentTick,
    advance, reset,
  } = useSimulationStore();

  const { setCurrentProb } = useMarketStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load simulation data
  const { data, isLoading } = useQuery({
    queryKey: ["simulation", params.sim_id],
    queryFn:  () => getSimulation(params.sim_id),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!data?.series) return;
    setSeries(data.series as SimTick[]);
    setSimId(params.sim_id);
  }, [data, params.sim_id, setSeries, setSimId]);

  // Sync current tick to market store for gauge
  const tick: SimTick | undefined = series[currentTick];

  useEffect(() => {
    if (tick?.prob !== undefined) setCurrentProb(tick.prob);
  }, [tick, setCurrentProb]);

  // Play/pause loop
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        advance();
      }, 1000 / speed);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, advance]);

  // Pause on event label ticks
  useEffect(() => {
    if (tick?.event_label && playing) {
      setPlaying(false);
    }
  }, [tick?.event_label, tick, playing, setPlaying]);

  const historyData = series.slice(0, currentTick + 1).map((t) => ({
    tick:  t.tick,
    prob:  +(t.prob * 100).toFixed(1),
    value: +t.option_value.toFixed(4),
    pnl:   +t.pnl.toFixed(4),
  }));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-gray-500 hover:text-white text-sm"
        >
          ← Pythia
        </button>
        <span className="text-gray-600 text-sm">Demo Simulation</span>
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center h-96 text-gray-500">
          Loading simulation data...
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Hero row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Gauge */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 flex flex-col items-center">
              <ProbGauge size={200} />
              <div className="text-xs text-gray-500 mt-2">
                Day {tick?.tick ?? 0} of {series.length - 1}
              </div>
            </div>

            {/* P&L card */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="text-xs text-gray-500 mb-2">Option Value</div>
              <div className="text-3xl font-bold tabular-nums text-white mb-1">
                ${tick?.option_value.toFixed(3) ?? "—"}
              </div>
              <div className="text-xs text-gray-500 mb-4">fair value</div>

              <div className="text-xs text-gray-500 mb-1">P&L</div>
              <div className={`text-2xl font-bold tabular-nums ${
                (tick?.pnl ?? 0) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {(tick?.pnl ?? 0) >= 0 ? "+" : ""}${tick?.pnl.toFixed(3) ?? "—"}
              </div>

              {tick?.event_label && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-yellow-900/30 border border-yellow-800/50 text-yellow-400 text-xs">
                  {tick.event_label}
                </div>
              )}
            </div>

            {/* Greeks */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-6">
              <div className="text-xs text-gray-500 mb-3">Greeks</div>
              {[
                { label: "Δ", value: tick?.delta?.toFixed(3) ?? "—", color: "text-blue-400" },
                { label: "Θ", value: tick?.theta ? `$${tick.theta.toFixed(5)}/day` : "—", color: "text-orange-400" },
                { label: "ν", value: tick?.vega?.toFixed(4) ?? "—", color: "text-purple-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-mono tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Probability chart */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">YES% Probability</h3>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="tick" tick={{ fill: "#6b7280", fontSize: 9 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#6b7280", fontSize: 9 }} width={35} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "p(t)"]}
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937", fontSize: 11 }}
                  />
                  <Line type="monotone" dataKey="prob" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* P&L chart */}
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">P&L over Time</h3>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={historyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="tick" tick={{ fill: "#6b7280", fontSize: 9 }} />
                  <YAxis tickFormatter={(v) => `$${v}`} tick={{ fill: "#6b7280", fontSize: 9 }} width={40} />
                  <Tooltip
                    formatter={(v: number) => [`$${v}`, "P&L"]}
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937", fontSize: 11 }}
                  />
                  <ReferenceLine y={0} stroke="#374151" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="pnl" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Playback controls */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center gap-4">
              {/* Rewind */}
              <button
                onClick={reset}
                className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-sm transition"
              >
                ◀◀
              </button>

              {/* Play/Pause */}
              <button
                onClick={() => setPlaying(!playing)}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition ${
                  playing
                    ? "bg-orange-700 hover:bg-orange-600 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {playing ? "❚❚ Pause" : "► Play"}
              </button>

              {/* Progress scrubber */}
              <input
                type="range"
                min={0}
                max={Math.max(0, series.length - 1)}
                value={currentTick}
                onChange={(e) => {
                  setPlaying(false);
                  setCurrentTick(parseInt(e.target.value));
                }}
                className="flex-1 accent-blue-500"
              />

              {/* Speed */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Speed:</span>
                {[0.5, 1, 2, 4].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded transition ${
                      speed === s
                        ? "bg-gray-600 text-white"
                        : "text-gray-600 hover:text-gray-400"
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            {/* Day label */}
            {tick?.ts_actual && (
              <div className="text-center text-xs text-gray-600 mt-2">
                {new Date(tick.ts_actual).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
