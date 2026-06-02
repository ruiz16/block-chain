// =============================================================================
// Rate Limiter — Sliding Window (In-Memory)
// =============================================================================
//
// In-memory sliding window rate limiter using a Map-based store.
// Tracks request counts per key (typically IP + route) within a configurable
// time window.
//
// DESIGN:
//   - Sliding window: each key has a count and a resetAt timestamp.
//     Once resetAt is past, the window slides and count resets.
//   - Singleton store with periodic cleanup every 60 seconds.
//   - Works in both serverless (per-instance) and long-running environments.
//
// PRODUCTION:
//   Swap MemoryStore for Upstash/Vercel KV in serverless environments
//   where multiple instances share no memory. The `RateLimitResult` interface
//   stays the same — only the store implementation changes.
//
// USAGE:
//   import { rateLimit } from '@/lib/rate-limit';
//
//   export async function POST(request: Request) {
//     const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
//     const result = rateLimit(`api:creditos:${ip}`, { interval: 60_000, max: 30 });
//
//     if (!result.success) {
//       return NextResponse.json(
//         { error: 'TOO_MANY_REQUESTS', detail: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
//         { status: 429, headers: rateLimitHeaders(result) },
//       );
//     }
//     // ... handler logic
//   }
// =============================================================================

/** Per-key rate limit entry in the store */
interface StoreEntry {
  count: number;
  resetAt: number; // epoch ms when the current window expires
}

/** Result returned by the rate limiter */
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // epoch ms when the window resets
}

/** Rate limiter configuration */
export interface RateLimitConfig {
  /** Time window in milliseconds (default: 60_000 = 1 minute) */
  interval: number;
  /** Maximum requests allowed per interval (default: 30) */
  max: number;
}

// ---------------------------------------------------------------------------
// In-Memory Store (singleton)
// ---------------------------------------------------------------------------

class MemoryStore {
  private readonly hits = new Map<string, StoreEntry>();

  /**
   * Increment the counter for a given key.
   * Returns the current rate limit state AFTER incrementing.
   */
  increment(key: string, intervalMs: number, max: number): RateLimitResult {
    const now = Date.now();
    const entry = this.hits.get(key);

    // No entry or window expired → start a new window
    if (!entry || now > entry.resetAt) {
      const resetAt = now + intervalMs;
      this.hits.set(key, { count: 1, resetAt });
      return { success: true, limit: max, remaining: max - 1, reset: resetAt };
    }

    // Inside current window
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);

    return {
      success: entry.count <= max,
      limit: max,
      remaining,
      reset: entry.resetAt,
    };
  }

  /** Remove expired entries to prevent memory leaks */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now > entry.resetAt) {
        this.hits.delete(key);
      }
    }
  }
}

/** Singleton store instance */
const store = new MemoryStore();

// Periodic cleanup every 60 seconds
setInterval(() => store.cleanup(), 60_000);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and increment the rate limit for a given key.
 *
 * @param key - Unique identifier (typically `route:ip`)
 * @param config - Optional overrides for interval and max
 * @returns The current rate limit state
 */
export function rateLimit(
  key: string,
  config: Partial<RateLimitConfig> = {},
): RateLimitResult {
  const { interval = 60_000, max = 30 } = config;
  return store.increment(key, interval, max);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build standard rate-limit response headers from a RateLimitResult.
 *
 *   - Retry-After: seconds until the window resets (RFC 7231)
 *   - X-RateLimit-Limit: max requests per window
 *   - X-RateLimit-Remaining: remaining requests in the current window
 */
export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return {
    'Retry-After': String(Math.max(1, retryAfter)),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
}
