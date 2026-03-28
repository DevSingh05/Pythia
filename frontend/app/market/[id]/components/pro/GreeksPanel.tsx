"use client";

import { useMarketStore } from "@/lib/store";

function BarMeter({
  value,
  min = 0,
  max = 1,
  color = "bg-blue-500",
  centered = false,
}: {
  value: number;
  min?: number;
  max?: number;
  color?: string;
  centered?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  if (centered) {
    // Bar grows outward from centre
    const centre = 50;
    const half   = Math.abs(value) / (max - min) * 50;
    const left   = value >= 0 ? centre : centre - half;
    const width  = half;
    return (
      <div className="h-2 bg-gray-800 rounded-full w-full relative overflow-hidden">
        <div
          className={`absolute h-full ${color} rounded-full`}
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div className="absolute h-full w-px bg-gray-600" style={{ left: "50%" }} />
      </div>
    );
  }

  return (
    <div className="h-2 bg-gray-800 rounded-full w-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function GreeksPanel() {
  const { greeks, position } = useMarketStore();

  if (!greeks || !position) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 text-gray-600 text-sm">
        Select a contract to see Greeks.
      </div>
    );
  }

  const rows = [
    {
      label:   "Δ Delta",
      value:   greeks.delta.toFixed(3),
      bar:     <BarMeter value={greeks.delta} min={0} max={1} color="bg-blue-500" />,
      tooltip: "Sensitivity to 1% prob move",
      color:   "text-blue-400",
    },
    {
      label:   "Θ Theta",
      value:   `$${greeks.theta.toFixed(5)}/day`,
      bar:     <BarMeter value={Math.abs(greeks.theta)} min={0} max={0.01} color="bg-orange-500" />,
      tooltip: "Value lost per day (time decay)",
      color:   "text-orange-400",
    },
    {
      label:   "ν Vega",
      value:   greeks.vega.toFixed(4),
      bar:     <BarMeter value={greeks.vega} min={0} max={0.5} color="bg-purple-500" centered={true} />,
      tooltip: "Sensitivity to 1% vol change",
      color:   "text-purple-400",
    },
    {
      label:   "Γ Gamma",
      value:   greeks.gamma.toFixed(4),
      bar:     <BarMeter value={greeks.gamma} min={0} max={5} color="bg-yellow-500" />,
      tooltip: "Rate of delta change",
      color:   "text-yellow-400",
    },
  ];

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-300">Greeks</h3>
        <span className="text-xs text-gray-600">
          {position.kind.toUpperCase()} {(position.strike * 100).toFixed(0)}% · {position.tau_days}d
        </span>
      </div>

      <div className="text-2xl font-bold text-white tabular-nums">
        ${greeks.price.toFixed(4)}
        <span className="text-sm font-normal text-gray-500 ml-2">fair value</span>
      </div>

      {rows.map(({ label, value, bar, tooltip, color }) => (
        <div key={label} title={tooltip}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-sm font-mono tabular-nums ${color}`}>{value}</span>
          </div>
          {bar}
        </div>
      ))}
    </div>
  );
}
