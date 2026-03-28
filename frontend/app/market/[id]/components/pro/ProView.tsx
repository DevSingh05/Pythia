"use client";

import { ProbGauge }        from "../ProbGauge";
import { OptionsChain }     from "./OptionsChain";
import { GreeksPanel }      from "./GreeksPanel";
import { PayoffCurve }      from "./PayoffCurve";
import { DistributionCurve } from "./DistributionCurve";
import { ExerciseBoundary } from "./ExerciseBoundary";

export function ProView() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Gauge + distribution stacked */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <div className="flex justify-center mb-4">
            <ProbGauge size={180} />
          </div>
          <DistributionCurve />
        </div>

        {/* Options chain */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Options Chain</h2>
          <OptionsChain />
        </div>

        {/* Exercise boundary */}
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <ExerciseBoundary />
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <GreeksPanel />

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <PayoffCurve />
        </div>
      </div>
    </div>
  );
}
