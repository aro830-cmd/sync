// Pure helpers for calling Gemini; no server-only import so `node src/lib/retry.test.ts` can run them.

export class GeminiError extends Error {
  status: number;
  /** Out of quota (often per model and per minute): retrying the same call won't help, trying another model or key might. */
  quota = false;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Gemini errors arrive as raw JSON strings; turn them into one readable line. */
export function geminiError(e: unknown) {
  if (e instanceof GeminiError) return e;
  // Our own per-call timeout (AbortSignal.timeout) — treat like a gateway timeout so it's retried.
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
    return new GeminiError("Gemini took too long to answer.", 504);
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const { error } = JSON.parse(raw);
    const err = new GeminiError(`Gemini: ${String(error.message).split(". ")[0]}.`, Number(error.code) || 0);
    err.quota = err.status === 429 && /quota/i.test(String(error.message));
    return err;
  } catch {
    return new GeminiError(raw, 0);
  }
}

// Overload / rate-limit / server errors / timeouts are usually gone within seconds.
const RETRYABLE = new Set([429, 500, 503, 504]);

export async function withRetry<T>(fn: () => Promise<T>, waits = [2000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const err = geminiError(e);
      if (!RETRYABLE.has(err.status) || err.quota || i >= waits.length) throw err;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

/** Try each option (model, or model × key) in turn; move on when one is overloaded or out of quota. Other errors (bad key, bad request) surface at once. */
export async function withFallback<T, M = string>(models: M[], call: (model: M) => Promise<T>, waits?: number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await withRetry(() => call(models[i]), waits);
    } catch (e) {
      const err = geminiError(e);
      if (!RETRYABLE.has(err.status) || i >= models.length - 1) throw err;
    }
  }
}

