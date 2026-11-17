import { randomUUID } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { AppError, type Gate, type GateLease, type Limiter } from "./types";

/** Batas waktu gerbang: bila proses mati di tengah jalan, gerbang terbuka sendiri. */
export const GATE_TTL_MS = 60_000;
const WAIT_MS = 4_000;

const busy = () =>
  new AppError("Penyimpanan lain sedang berjalan. Coba simpan lagi beberapa detik lagi.", "WRITE_PENDING", 409);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gerbang dalam satu proses, untuk tes dan pengembangan lokal. */
export class MemoryGate implements Gate {
  private readonly held = new Map<string, { token: string; expires: number }>();

  async acquire(scope: string, operationId: string): Promise<GateLease> {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      const current = this.held.get(scope);
      if (!current || current.expires < Date.now()) {
        const token = randomUUID();
        this.held.set(scope, { token, expires: Date.now() + GATE_TTL_MS });
        return { scope, token, operationId };
      }
      if (Date.now() > deadline) throw busy();
      await sleep(50);
    }
  }

  async release(lease: GateLease): Promise<void> {
    if (this.held.get(lease.scope)?.token === lease.token) this.held.delete(lease.scope);
  }
}

/** Gerbang bersama antar-instance server memakai Redis (SET NX PX). */
export class RedisGate implements Gate {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "ruang-garda:gate:",
  ) {}

  async acquire(scope: string, operationId: string): Promise<GateLease> {
    const token = randomUUID();
    const deadline = Date.now() + WAIT_MS;
    let wait = 120;
    for (;;) {
      const ok = await this.redis.set(this.prefix + scope, JSON.stringify({ token, operationId, startedAt: Date.now() }), {
        nx: true,
        px: GATE_TTL_MS,
      });
      if (ok) return { scope, token, operationId };
      if (Date.now() > deadline) throw busy();
      await sleep(wait);
      wait = Math.min(wait * 2, 800);
    }
  }

  async release(lease: GateLease): Promise<void> {
    // Hanya pemegang token yang boleh membuka gerbang.
    await this.redis.eval(
      "local v=redis.call('GET',KEYS[1]); if v and cjson.decode(v).token==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      [this.prefix + lease.scope],
      [lease.token],
    );
  }
}

export class MemoryLimiter implements Limiter {
  private readonly counts = new Map<string, { count: number; expires: number }>();

  async hit(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.counts.get(key);
    const next = current && current.expires > now ? { count: current.count + 1, expires: current.expires } : { count: 1, expires: now + windowSeconds * 1000 };
    this.counts.set(key, next);
    return next.count;
  }

  async count(key: string): Promise<number> {
    const current = this.counts.get(key);
    return current && current.expires > Date.now() ? current.count : 0;
  }

  async reset(key: string): Promise<void> {
    this.counts.delete(key);
  }
}

export class RedisLimiter implements Limiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "ruang-garda:limit:",
  ) {}

  async hit(key: string, windowSeconds: number): Promise<number> {
    const full = this.prefix + key;
    const count = await this.redis.incr(full);
    if (count === 1) await this.redis.expire(full, windowSeconds);
    return count;
  }

  async count(key: string): Promise<number> {
    return Number((await this.redis.get<number>(this.prefix + key)) ?? 0);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
