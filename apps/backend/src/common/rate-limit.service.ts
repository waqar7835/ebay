import { HttpException, HttpStatus, Injectable, OnModuleDestroy } from "@nestjs/common";

const MINUTE = 60_000;

/**
 * Small in-memory rate limiter (security audit 2026-11-13) for the logged-out auth endpoints. Counts hits per key in a
 * sliding window. Keys are mostly per email, so the protection doesn't depend on seeing the client's real IP (which
 * depends on the host's proxy, see TRUST_PROXY in main.ts); per-IP keys are a looser second layer.
 *
 * Per process: counters reset on restart and aren't shared between instances — fine for one instance; move to a shared
 * store (e.g. Redis) when running several.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly hits = new Map<string, number[]>();
  private readonly sweeper = setInterval(() => this.sweep(), 10 * MINUTE).unref();

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  /** Counts one hit for `key`; refuses (429) when `limit` hits already happened within `windowMs`. */
  hit(key: string, limit: number, windowMs: number) {
    this.check(key, limit, windowMs);
    this.record(key);
  }

  /** Refuses (429) when `key` already has `limit` hits within `windowMs`, without counting this one. */
  check(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    this.hits.set(key, recent);
    if (recent.length >= limit) {
      const minutes = Math.max(1, Math.ceil((recent[0] + windowMs - now) / MINUTE));
      throw new HttpException(
        `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  record(key: string) {
    const list = this.hits.get(key) ?? [];
    list.push(Date.now());
    this.hits.set(key, list);
  }

  /** Takes back the latest hit for `key` (an attempt that turned out not to count). */
  undo(key: string) {
    this.hits.get(key)?.pop();
  }

  clear(key: string) {
    this.hits.delete(key);
  }

  /** Drops keys with no hit in the last day (longer than any window used). */
  private sweep() {
    const cutoff = Date.now() - 24 * 60 * MINUTE;
    for (const [key, list] of this.hits) {
      if (!list.length || list[list.length - 1] < cutoff) this.hits.delete(key);
    }
  }
}

export const RATE_WINDOW = { MINUTE, TEN_MINUTES: 10 * MINUTE, FIFTEEN_MINUTES: 15 * MINUTE, HOUR: 60 * MINUTE } as const;

/** The key part for an email: trimmed and lower-cased, so "A@x.com " and "a@x.com" share a counter. */
export function emailKey(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}
