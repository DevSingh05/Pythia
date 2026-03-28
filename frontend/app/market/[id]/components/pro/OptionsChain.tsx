"use client";

import { useQuery }       from "@tanstack/react-query";
import { useParams }      from "next/navigation";
import { useMarketStore } from "@/lib/store";
import { getChain }       from "@/lib/api";
import { useState }       from "react";
import type { Contract }  from "@/lib/store";

const EXPIRY_OPTIONS = [7, 14, 21, 30];

function moneyness(strike: number, prob: number, kind: "call" | "put"): "ITM" | "ATM" | "OTM" {
  const dist = Math.abs(strike - prob);
  if (dist < 0.03) return "ATM";
  if (kind === "call") return prob > strike ? "ITM" : "OTM";
  return prob < strike ? "ITM" : "OTM";
}

export function OptionsChain() {
  const params = useParams<{ id: string }>();
  const { currentProb, vol, setPosition } = useMarketStore();
  const [selectedTau, setSelectedTau] = useState(14);

  const { data, isLoading } = useQuery({
    queryKey:  ["chain", params.id, currentProb, vol],
    queryFn:   () => getChain(params.id),
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const chain: Contract[] = (data?.chain ?? []).filter(
    (c: Contract) => c.tau_days === selectedTau
  );

  const sortedStrikes = [...new Set(chain.map((c) => c.strike))].sort(
    (a, b) => a - b
  );

  function selectContract(strike: number, kind: "call" | "put") {
    const contract = chain.find((c) => c.strike === strike);
    if (!contract) return;
    const price = kind === "call" ? contract.call_price : contract.put_price;
    setPosition({
      kind,
      strike,
      tau_days:  selectedTau,
      premium:   price,
      entryProb: currentProb,
    });
  }

  return (
    <div>
      {/* Expiry tabs */}
      <div className="flex gap-2 mb-4">
        {EXPIRY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedTau(d)}
            className={`px-4 py-1.5 rounded-lg text-sm transition border ${
              selectedTau === d
                ? "bg-gray-700 border-gray-500 text-white"
                : "bg-gray-900 border-gray-800 text-gray-500 hover:text-gray-300"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-sm py-4">Loading chain...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800">
                <th className="py-2 px-3 text-right text-green-700">CALLS</th>
                <th className="py-2 px-3 text-right">Δ</th>
                <th className="py-2 px-3 text-right">Θ/day</th>
                <th className="py-2 px-3 text-center font-bold">STRIKE</th>
                <th className="py-2 px-3 text-left">Δ</th>
                <th className="py-2 px-3 text-left text-red-700">PUTS</th>
              </tr>
            </thead>
            <tbody>
              {sortedStrikes.map((strike) => {
                const row       = chain.find((c) => c.strike === strike)!;
                const callMoney = moneyness(strike, currentProb, "call");
                const putMoney  = moneyness(strike, currentProb, "put");
                const isAtm     = callMoney === "ATM" || putMoney === "ATM";

                return (
                  <tr
                    key={strike}
                    className={`border-b border-gray-800/50 ${
                      isAtm ? "bg-atm-row" : ""
                    }`}
                  >
                    {/* Call price */}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => selectContract(strike, "call")}
                        className={`tabular-nums font-medium hover:underline ${
                          callMoney === "ITM"
                            ? "text-itm-call"
                            : callMoney === "ATM"
                            ? "text-atm"
                            : "text-otm"
                        }`}
                      >
                        ${row.call_price.toFixed(3)}
                      </button>
                    </td>
                    {/* Call delta */}
                    <td className="py-2 px-3 text-right text-gray-500 tabular-nums">
                      {row.delta.toFixed(2)}
                    </td>
                    {/* Theta */}
                    <td className="py-2 px-3 text-right text-orange-600 tabular-nums text-xs">
                      ${row.theta.toFixed(4)}
                    </td>

                    {/* Strike */}
                    <td className="py-2 px-3 text-center font-bold">
                      <span className={isAtm ? "text-blue-400" : "text-gray-300"}>
                        {(strike * 100).toFixed(0)}%
                      </span>
                      {isAtm && (
                        <div className="text-xs text-blue-600">ATM</div>
                      )}
                      {Math.abs(strike - currentProb) < 0.005 && (
                        <div className="text-xs text-blue-400">← p</div>
                      )}
                    </td>

                    {/* Put delta */}
                    <td className="py-2 px-3 text-left text-gray-500 tabular-nums">
                      {row.put_delta.toFixed(2)}
                    </td>
                    {/* Put price */}
                    <td className="py-2 px-3 text-left">
                      <button
                        onClick={() => selectContract(strike, "put")}
                        className={`tabular-nums font-medium hover:underline ${
                          putMoney === "ITM"
                            ? "text-itm-put"
                            : putMoney === "ATM"
                            ? "text-atm"
                            : "text-otm"
                        }`}
                      >
                        ${row.put_price.toFixed(3)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-600">
        Current p = {(currentProb * 100).toFixed(1)}% · σ = {(vol * 100).toFixed(0)}%
        &nbsp;· Click any price to open that contract.
      </div>
    </div>
  );
}
