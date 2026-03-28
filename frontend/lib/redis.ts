import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export const keys = {
  prob:     (id: string) => `prob:${id}`,
  vol:      (id: string) => `vol:${id}`,
  chain:    (id: string) => `chain:${id}`,
  boundary: (id: string, K: number, kind: string) => `boundary:${id}:${K}:${kind}`,
  resolved: (id: string) => `resolved:${id}`,
};
