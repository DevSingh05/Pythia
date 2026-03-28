"use client";

import { useMarketStore } from "@/lib/store";
import { SimpleView }     from "./components/simple/SimpleView";
import { ProView }        from "./components/pro/ProView";

export default function MarketPage() {
  const mode = useMarketStore((s) => s.mode);

  return mode === "simple" ? <SimpleView /> : <ProView />;
}
