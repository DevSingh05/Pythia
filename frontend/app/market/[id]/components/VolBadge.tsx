"use client";

import { useMarketStore } from "@/lib/store";

const VOL_LABELS: Record<string, string> = {
  flat_market:          "Vol — market flat",
  cross_market_fallback: "Vol from similar markets",
  insufficient_data:    "Vol — limited history",
  vol_floored:          "Vol at minimum",
  vol_capped:           "Vol at maximum",
};

export function VolBadge() {
  const { vol, volSource } = useMarketStore();

  const warningLabel = VOL_LABELS[volSource];

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-500">σ</span>
      <span className="text-gray-300 tabular-nums">{(vol * 100).toFixed(0)}%</span>
      {warningLabel && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-800/50">
          {warningLabel}
        </span>
      )}
    </div>
  );
}
