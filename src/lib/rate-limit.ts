type RateLimitState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitState>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const state = buckets.get(key);
  if (!state || state.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (state.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: state.resetAt };
  }

  state.count += 1;
  return { allowed: true, remaining: limit - state.count, resetAt: state.resetAt };
}
