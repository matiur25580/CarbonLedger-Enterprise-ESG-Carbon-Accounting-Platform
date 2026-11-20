import type { Store, ClientRateLimitInfo } from "express-rate-limit";
import { prisma } from "../lib/prisma.js";

/**
 * PostgreSQL-backed shared counter store.
 * All API replicas using the same database share counters; SQL upserts keep
 * increments atomic across concurrent requests and processes.
 */
export class PostgresRateLimitStore implements Store {
  async init(): Promise<void> {
    await prisma.$queryRaw`SELECT 1 FROM rate_limit_counters LIMIT 0`;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const rows = await prisma.$queryRaw<Array<{ total_hits: number; reset_at: Date }>>`
      SELECT total_hits, reset_at
      FROM rate_limit_counters
      WHERE key = ${key} AND reset_at > NOW()
      LIMIT 1
    `;
    const row = rows[0];
    return row ? { totalHits: row.total_hits, resetTime: row.reset_at } : undefined;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const rows = await prisma.$queryRaw<Array<{ total_hits: number; reset_at: Date }>>`
      INSERT INTO rate_limit_counters (key, total_hits, reset_at)
      VALUES (${key}, 1, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (key) DO UPDATE
      SET total_hits = CASE
            WHEN rate_limit_counters.reset_at <= NOW() THEN 1
            ELSE rate_limit_counters.total_hits + 1
          END,
          reset_at = CASE
            WHEN rate_limit_counters.reset_at <= NOW() THEN NOW() + INTERVAL '15 minutes'
            ELSE rate_limit_counters.reset_at
          END
      RETURNING total_hits, reset_at
    `;
    const row = rows[0];
    if (!row) throw new Error("Rate-limit counter increment returned no row");
    return { totalHits: row.total_hits, resetTime: row.reset_at };
  }

  async decrement(key: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE rate_limit_counters
      SET total_hits = GREATEST(total_hits - 1, 0)
      WHERE key = ${key}
    `;
  }

  async resetKey(key: string): Promise<void> {
    await prisma.$executeRaw`DELETE FROM rate_limit_counters WHERE key = ${key}`;
  }

  async resetAll(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM rate_limit_counters`;
  }
}
