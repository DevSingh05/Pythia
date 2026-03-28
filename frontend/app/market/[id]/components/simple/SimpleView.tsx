"use client";

import { ProbGauge }      from "../ProbGauge";
import { DirectionPicker } from "./DirectionPicker";
import { StrikeSlider }   from "./StrikeSlider";
import { ExpiryPicker }   from "./ExpiryPicker";
import { PayoffCard }     from "./PayoffCard";

export function SimpleView() {
  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Gauge */}
      <div className="flex justify-center">
        <ProbGauge size={240} />
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <DirectionPicker />
        <StrikeSlider />
        <ExpiryPicker />
      </div>

      {/* Payoff card */}
      <PayoffCard />
    </div>
  );
}
