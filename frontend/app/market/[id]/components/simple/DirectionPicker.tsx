"use client";

import { useMarketStore } from "@/lib/store";

export function DirectionPicker() {
  const { position, setPosition, currentProb, vol } = useMarketStore();
  const kind = position?.kind ?? "call";

  function pick(k: "call" | "put") {
    setPosition({
      kind:      k,
      strike:    position?.strike    ?? 0.5,
      tau_days:  position?.tau_days  ?? 14,
      premium:   position?.premium   ?? 0,
      entryProb: currentProb,
    });
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => pick("call")}
        className={`flex-1 py-4 rounded-xl text-lg font-bold transition border-2 ${
          kind === "call"
            ? "bg-green-900/50 border-green-500 text-green-400"
            : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"
        }`}
      >
        CALL
        <div className="text-xs font-normal mt-1 opacity-70">
          Profit if YES% rises
        </div>
      </button>
      <button
        onClick={() => pick("put")}
        className={`flex-1 py-4 rounded-xl text-lg font-bold transition border-2 ${
          kind === "put"
            ? "bg-red-900/50 border-red-500 text-red-400"
            : "bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600"
        }`}
      >
        PUT
        <div className="text-xs font-normal mt-1 opacity-70">
          Profit if YES% falls
        </div>
      </button>
    </div>
  );
}
