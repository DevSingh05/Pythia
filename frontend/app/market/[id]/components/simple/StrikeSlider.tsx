"use client";

import { useMarketStore } from "@/lib/store";
import { useQuery }       from "@tanstack/react-query";
import { useParams }      from "next/navigation";
import { useCallback, useEffect } from "react";

const GRID = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

function snapToGrid(value: number, grid: number[]): number {
  return grid.reduce((prev, cur) =>
    Math.abs(cur - value) < Math.abs(prev - value) ? cur : prev
  );
}

export function StrikeSlider() {
  const params = useParams<{ id: string }>();
  const { position, setPosition, currentProb, vol } = useMarketStore();

  // Fetch available strikes dynamically
  const { data: strikesData } = useQuery({
    queryKey:  ["strikes", params.id, currentProb, vol],
    queryFn:   async () => {
      const res = await fetch(`/api/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p0: currentProb, sigma: vol, tau_days: position?.tau_days ?? 14,
          strike: position?.strike ?? 0.5, kind: position?.kind ?? "call",
        }),
      });
      return res.json();
    },
    staleTime: 5000,
  });

  const availableStrikes = GRID;  // full grid shown; dimmed if out-of-range

  const currentStrike = position?.strike ?? snapToGrid(currentProb, GRID);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw    = parseFloat(e.target.value);
      const snapped = snapToGrid(raw, availableStrikes);
      setPosition({
        ...(position ?? { kind: "call", tau_days: 14, premium: 0, entryProb: currentProb }),
        strike: snapped,
      });
    },
    [position, availableStrikes, currentProb, setPosition]
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-500">Strike</span>
        <span className="text-lg font-bold text-white tabular-nums">
          {(currentStrike * 100).toFixed(0)}%
        </span>
      </div>

      {/* Strike grid buttons */}
      <div className="flex gap-1 mb-3">
        {GRID.map((k) => {
          const isSelected = k === currentStrike;
          const isAtm      = Math.abs(k - currentProb) < 0.05;
          const isItm      =
            position?.kind === "call" ? currentProb > k : currentProb < k;

          return (
            <button
              key={k}
              onClick={() =>
                setPosition({
                  ...(position ?? { kind: "call", tau_days: 14, premium: 0, entryProb: currentProb }),
                  strike: k,
                })
              }
              className={`flex-1 py-2 rounded text-xs font-medium transition ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : isAtm
                  ? "bg-blue-900/40 text-blue-400 border border-blue-800"
                  : isItm
                  ? "bg-gray-700 text-gray-300"
                  : "bg-gray-900 text-gray-600 hover:bg-gray-800 hover:text-gray-400"
              }`}
            >
              {(k * 100).toFixed(0)}
            </button>
          );
        })}
      </div>

      {/* Current prob marker */}
      <div className="relative h-1 bg-gray-800 rounded-full mx-1">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400"
          style={{ left: `${(currentProb / 1) * 100}%`, transform: "translate(-50%, -50%)" }}
          title={`Current: ${(currentProb * 100).toFixed(1)}%`}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1 px-1">
        <span>0%</span>
        <span className="text-blue-500">p={( currentProb * 100).toFixed(0)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
