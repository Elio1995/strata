/**
 * Exponential backoff with full jitter.
 *
 * Delay for attempt N is `base * 2^N`, then multiplied by a random factor in
 * [0.5, 1). The randomisation matters when many SDK instances are deployed in
 * parallel (think serverless cold starts hitting the same upstream after an
 * outage) — without jitter they all retry in lockstep and re-create the spike.
 *
 * Defaults to 200ms → 400ms → 800ms before jitter, capped at 10s.
 */
export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
  /** Override the jitter source — used in tests for determinism. */
  random?: () => number;
}

const DEFAULT_BASE_MS = 200;
const DEFAULT_CAP_MS = 10_000;

export function computeBackoff(attempt: number, opts: BackoffOptions = {}): number {
  const base = opts.baseMs ?? DEFAULT_BASE_MS;
  const cap = opts.capMs ?? DEFAULT_CAP_MS;
  const random = opts.random ?? Math.random;

  const exp = Math.min(cap, base * 2 ** attempt);
  const jitter = 0.5 + random() * 0.5; // [0.5, 1)
  return Math.floor(exp * jitter);
}

/** Sleep for a number of milliseconds, abortable via signal. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
