"use client";

import { useMarketStore } from "@/lib/store";
import { useQuery }       from "@tanstack/react-query";
import { priceContract }  from "@/lib/api";
import { useEffect }      from "react";

export function PayoffCard() {
  const {
    position,
    greeks,
    setGreeks,
    setPosition,
    currentProb,
    vol,
    isResolved,
  } = useMarketStore();

  const enabled =
    !!position && position.tau_days > 0 && !isResolved;

  const { data, isLoading } = useQuery({
    queryKey: [
      "price",
      position?.kind,
      position?.strike,
      position?.tau_days,
      currentProb,
      vol,
    ],
    queryFn: () =>
      priceContract({
        p0:       currentProb,
        strike:   position!.strike,
        tau_days: position!.tau_days,
        sigma:    vol,
        kind:     position!.kind,
      }),
    enabled,
    staleTime: 5000,
    refetchInterval: 5000,
  });

  // Sync Greeks + premium into store
  useEffect(() => {
    if (!data) return;
    setGreeks(data);
    setPosition({ ...position!, premium: data.price });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!position) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 text-center text-gray-500 text-sm">
        Select a direction, strike, and expiry above.
      </div>
    );
  }

  const { kind, strike, tau_days } = position;
  const price = greeks?.price ?? data?.price;

  // Breakeven: for call p > strike + premium, for put p < strike - premium
  const breakeven =
    kind === "call"
      ? strike + (price ?? 0)
      : strike - (price ?? 0);

  // Intrinsic value at current prob
  const intrinsic =
    kind === "call"
      ? Math.max(currentProb - strike, 0)
      : Math.max(strike - currentProb, 0);

  const pnl = price !== undefined ? intrinsic - (position.premium || price) : null;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3 flex justify-between items-center ${
        kind === "call" ? "bg-green-950/40 border-b border-green-900/50" : "bg-red-950/40 border-b border-red-900/50"
      }`}>
        <span className={`font-bold text-lg ${kind === "call" ? "text-green-400" : "text-red-400"}`}>
          {kind.toUpperCase()} @ {(strike * 100).toFixed(0)}%
        </span>
        <span className="text-gray-400 text-sm">{tau_days}d expiry</span>
      </div>

      {/* Main payoff statement */}
      <div className="px-5 py-5">
        {isLoading ? (
          <div className="text-gray-500 text-sm">Pricing...</div>
        ) : price !== undefined ? (
          <>
            <div className="text-3xl font-bold text-white tabular-nums mb-1">
              ${price.toFixed(3)}
            </div>
            <div className="text-sm text-gray-500 mb-4">
              Fair value per contract
            </div>

            {/* Plain English payoff description */}
            <div className="text-sm text-gray-300 bg-gray-800/50 rounded-lg p-4 mb-4">
              {kind === "call" ? (
                <>
                  You win{" "}
                  <span className="text-green-400 font-semibold">
                    $1.00 per 1% YES% gain above {(strike * 100).toFixed(0)}%
                  </span>
                  . Full payout if YES% reaches{" "}
                  <span className="text-white font-semibold">100%</span>:{" "}
                  <span className="text-green-400">${(1 - strike).toFixed(2)}</span>.
                  Breakeven: <span className="text-white">{(breakeven * 100).toFixed(1)}%</span>.
                </>
              ) : (
                <>
                  You win{" "}
                  <span className="text-red-400 font-semibold">
                    $1.00 per 1% YES% drop below {(strike * 100).toFixed(0)}%
                  </span>
                  . Full payout if YES% reaches{" "}
                  <span className="text-white font-semibold">0%</span>:{" "}
                  <span className="text-red-400">${strike.toFixed(2)}</span>.
                  Breakeven: <span className="text-white">{(breakeven * 100).toFixed(1)}%</span>.
                </>
              )}
            </div>

            {/* Greeks summary row */}
            {greeks && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Δ Delta", value: greeks.delta.toFixed(2),  color: "text-blue-400" },
                  { label: "Θ Theta", value: `$${greeks.theta.toFixed(4)}/d`, color: "text-orange-400" },
                  { label: "ν Vega",  value: greeks.vega.toFixed(3),   color: "text-purple-400" },
                  { label: "Γ Gamma", value: greeks.gamma.toFixed(3),  color: "text-yellow-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-800/50 rounded-lg py-2">
                    <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 text-sm">Unable to price — pricing service unavailable.</div>
        )}
      </div>
    </div>
  );
}
