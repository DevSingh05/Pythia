/**
 * Landing page — market search.
 */

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { searchMarkets } from "@/lib/api";

export default function Home() {
  const router  = useRouter();
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["markets", query],
    queryFn:  () => searchMarkets(query),
    enabled:  query.length > 1,
  });

  const markets = data?.markets ?? [];

  return (
    <main className="flex min-h-screen flex-col items-center justify-start pt-24 px-4">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white mb-3">
          ProbX
        </h1>
        <p className="text-lg text-gray-400 max-w-md">
          Options on prediction market probabilities.{" "}
          <span className="text-white">Trade the movement, not the outcome.</span>
        </p>
        <div className="mt-4 flex gap-3 justify-center text-sm text-gray-500">
          <span>American style</span>
          <span>·</span>
          <span>Live Greeks</span>
          <span>·</span>
          <span>Early exercise boundary</span>
        </div>
      </div>

      {/* Search */}
      <div className="w-full max-w-xl">
        <input
          type="text"
          placeholder="Search markets — Bitcoin, Election, Fed rate..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-5 py-4 rounded-xl bg-gray-900 border border-gray-800 text-white
                     placeholder-gray-500 text-lg focus:outline-none focus:border-blue-500
                     focus:ring-1 focus:ring-blue-500 transition"
          autoFocus
        />

        {/* Results */}
        {query.length > 1 && (
          <div className="mt-2 rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            {isLoading && (
              <div className="p-4 text-gray-500 text-sm">Searching...</div>
            )}

            {!isLoading && markets.length === 0 && (
              <div className="p-4 text-gray-500 text-sm">No active markets found.</div>
            )}

            {markets.map((m: { condition_id: string; question: string; category: string; current_prob: number; current_vol: number }) => (
              <button
                key={m.condition_id}
                onClick={() => router.push(`/market/${m.condition_id}`)}
                className="w-full text-left px-5 py-4 hover:bg-gray-800 transition border-b
                           border-gray-800 last:border-0 group"
              >
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <div className="text-white font-medium group-hover:text-blue-400 transition line-clamp-2">
                      {m.question}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{m.category}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {m.current_prob !== null && (
                      <div className="text-lg font-bold text-white">
                        {(m.current_prob * 100).toFixed(0)}%
                      </div>
                    )}
                    {m.current_vol !== null && (
                      <div className="text-xs text-gray-500">
                        σ {(m.current_vol * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Demo link */}
      <div className="mt-16 text-center">
        <p className="text-gray-600 text-sm mb-3">See it in action</p>
        <button
          onClick={() => router.push("/simulation/demo_eth_call")}
          className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300
                     hover:text-white text-sm transition border border-gray-700"
        >
          Watch demo replay →
        </button>
      </div>
    </main>
  );
}
