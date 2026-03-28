"use client";

import { useMarketStore } from "@/lib/store";

const EXPIRY_OPTIONS = [7, 14, 21, 30];

export function ExpiryPicker() {
  const { position, setPosition, currentProb } = useMarketStore();
  const current = position?.tau_days ?? 14;

  return (
    <div>
      <span className="text-sm text-gray-500 block mb-2">Expiry</span>
      <div className="flex gap-2">
        {EXPIRY_OPTIONS.map((days) => (
          <button
            key={days}
            onClick={() =>
              setPosition({
                ...(position ?? { kind: "call", strike: 0.5, premium: 0, entryProb: currentProb }),
                tau_days: days,
              })
            }
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
              current === days
                ? "bg-gray-700 border-gray-500 text-white"
                : "bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600"
            }`}
          >
            {days}d
          </button>
        ))}
      </div>
    </div>
  );
}
