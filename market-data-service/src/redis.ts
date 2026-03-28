/**
 * Upstash Redis client (HTTP-compatible, no persistent connections).
 * Uses the Upstash REST API directly — works in any serverless runtime.
 */

const REDIS_URL = process.env.UPSTASH_REDIS_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN!;

async function redisCommand<T>(command: unknown[]): Promise<T> {
  const res = await fetch(`${REDIS_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) {
    throw new Error(`Redis error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { result: T };
  return data.result;
}

export const redis = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await redisCommand<string | null>(["GET", key]);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisCommand(["SET", key, serialized, "EX", ttlSeconds]);
    } else {
      await redisCommand(["SET", key, serialized]);
    }
  },

  async del(key: string): Promise<void> {
    await redisCommand(["DEL", key]);
  },

  async publish(channel: string, message: unknown): Promise<void> {
    await redisCommand(["PUBLISH", channel, JSON.stringify(message)]);
  },
};

// Key helpers
export const keys = {
  prob:     (id: string) => `prob:${id}`,
  vol:      (id: string) => `vol:${id}`,
  chain:    (id: string) => `chain:${id}`,
  boundary: (id: string, K: number, kind: string) => `boundary:${id}:${K}:${kind}`,
  resolved: (id: string) => `resolved:${id}`,
};
