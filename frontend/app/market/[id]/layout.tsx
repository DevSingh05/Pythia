"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery }   from "@tanstack/react-query";
import { getMarket }  from "@/lib/api";
import { useMarketStore } from "@/lib/store";
import { ModeToggle }    from "./components/ModeToggle";
import { LiveProbBadge } from "./components/LiveProbBadge";
import { VolBadge }      from "./components/VolBadge";

export default function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const {
    setConditionId,
    setQuestion,
    setVol,
    setCurrentProb,
    setResolved,
  } = useMarketStore();

  const { data: market } = useQuery({
    queryKey: ["market", params.id],
    queryFn:  () => getMarket(params.id),
    staleTime: 5_000,
  });

  // Bootstrap store from market metadata
  useEffect(() => {
    if (!market) return;
    setConditionId(params.id);
    setQuestion(market.question ?? "");
    if (market.current_prob !== null && market.current_prob !== undefined) {
      setCurrentProb(market.current_prob);
    }
    if (market.current_vol !== null && market.current_vol !== undefined) {
      setVol(market.current_vol, market.vol_source ?? "estimated");
    }
    if (market.resolved) setResolved(true);
  }, [market, params.id, setConditionId, setCurrentProb, setVol, setResolved, setQuestion]);

  // SSE connection for live prob updates
  useEffect(() => {
    const evtSource = new EventSource(`/api/markets/${params.id}/prob`);
    let staleTimer: ReturnType<typeof setTimeout>;

    evtSource.onmessage = (evt) => {
      const data = JSON.parse(evt.data) as { prob: number; resolved?: boolean };
      setCurrentProb(data.prob);
      clearTimeout(staleTimer);
      staleTimer = setTimeout(() => useMarketStore.getState().setStale(true), 6000);
      if (data.resolved) setResolved(true);
    };

    evtSource.onerror = () => {
      useMarketStore.getState().setStale(true);
    };

    return () => {
      evtSource.close();
      clearTimeout(staleTimer);
    };
  }, [params.id, setCurrentProb, setResolved]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="text-gray-500 hover:text-white text-sm transition"
        >
          ← ProbX
        </button>
        <div className="flex items-center gap-4">
          <LiveProbBadge />
          <VolBadge />
          <ModeToggle />
        </div>
      </nav>

      {/* Market question */}
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-gray-300 font-medium text-sm line-clamp-1">
          {market?.question ?? "Loading..."}
        </h2>
      </div>

      <div className="px-4 py-6 max-w-6xl mx-auto">{children}</div>
    </div>
  );
}
