import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
  env: {
    PRICING_SERVICE_URL:     process.env.PRICING_SERVICE_URL,
    MARKET_DATA_SERVICE_URL: process.env.MARKET_DATA_SERVICE_URL,
  },
};

export default nextConfig;
