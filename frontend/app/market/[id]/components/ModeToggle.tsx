"use client";

import { useMarketStore } from "@/lib/store";

export function ModeToggle() {
  const { mode, setMode } = useMarketStore();

  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-800 text-sm">
      <button
        onClick={() => setMode("simple")}
        className={`px-3 py-1.5 transition ${
          mode === "simple"
            ? "bg-gray-700 text-white"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        Simple
      </button>
      <button
        onClick={() => setMode("pro")}
        className={`px-3 py-1.5 transition ${
          mode === "pro"
            ? "bg-gray-700 text-white"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        Pro
      </button>
    </div>
  );
}
