// ============================================================
// Claude 429 retry helper.
//
// Wraps a single fetch call and retries ONCE after 1.5s when the
// response is 429 / rate_limit. Other error types propagate unchanged.
// Used by every outbound Claude call in the Discovery pipeline so
// transient rate limits don't cascade into silent fallbacks.
// ============================================================

const RATE_LIMIT_DELAY_MS = 1500;

export interface ClaudeRetryContext {
  label: string; // e.g. "polishInsights", "enrichBusinessProfile"
}

/**
 * Execute a Claude fetch with one-shot 429 retry.
 * The `fetcher` must return a Response — typically `() => fetch(url, init)`.
 * Non-429 responses are returned immediately. 429s are retried once after
 * 1.5s; if the retry also 429s (or any other error), that Response/error
 * propagates to the caller.
 */
export async function claudeFetchWithRetry(
  fetcher: () => Promise<Response>,
  ctx: ClaudeRetryContext,
): Promise<Response> {
  const first = await fetcher();
  if (first.status !== 429) return first;

  console.warn(`[${ctx.label}] Claude 429 — retrying once after ${RATE_LIMIT_DELAY_MS}ms`);
  await new Promise<void>(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  const second = await fetcher();
  if (second.status === 429) {
    console.warn(`[${ctx.label}] Claude 429 on retry — caller will fall back`);
  }
  return second;
}
