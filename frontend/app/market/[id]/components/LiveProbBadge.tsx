"use client";

import { useMarketStore } from "@/lib/store";

export function LiveProbBadge() {
  const { currentProb, isStale, isResolved } = useMarketStore();

  if (isResolved) {
    return (
      <span className="text-xs px-2 py-1 rounded bg-orange-900/40 text-orange-400 border border-orange-800">
        Resolved
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xl font-bold tabular-nums ${isStale ? "text-gray-500" : "text-white"}`}>
        {(currentProb * 100).toFixed(1)}%
      </span>
      {isStale ? (
        <span className="text-xs text-orange-500">stale</span>
      ) : (
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}
