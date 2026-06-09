import type { FetchLike } from '../src/http/types';

/** A scripted fetch — call it the n-th time and you get the n-th response. */
export interface ScriptedCall {
  status?: number;
  json?: unknown;
  text?: string;
  /** Throw instead of returning a Response. Simulates a network error. */
  throw?: Error;
  /** Delay before responding, in ms. Simulates a slow server / lets timeouts trip. */
  delayMs?: number;
}

export interface ScriptedFetch {
  fetch: FetchLike;
  calls: Array<{ url: string; init?: RequestInit }>;
}

/**
 * Build a mock fetch that walks a script of canned responses. Once the script
 * is exhausted the mock throws — that surfaces tests that accidentally make
 * more requests than the script expected.
 */
export function scriptedFetch(script: ReadonlyArray<ScriptedCall>): ScriptedFetch {
  let index = 0;
  const calls: ScriptedFetch['calls'] = [];

  const fetch: FetchLike = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    const step = script[index];
    index += 1;
    if (!step) {
      throw new Error(`scriptedFetch: script exhausted at call ${index} for ${url}`);
    }

    // Honour abort signals so the HttpClient's timeout can short-circuit a
    // slow / blocked upstream. This mirrors real fetch behaviour.
    const signal = init?.signal;
    if (step.delayMs) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          const reason = (signal as { reason?: unknown }).reason ?? new Error('aborted');
          reject(reason);
          return;
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, step.delayMs);
        const onAbort = () => {
          clearTimeout(timer);
          const reason =
            (signal as { reason?: unknown } | undefined)?.reason ?? new Error('aborted');
          reject(reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }

    if (step.throw) throw step.throw;

    const status = step.status ?? 200;
    const headers = { 'content-type': 'application/json' } as const;
    if (step.text !== undefined) {
      return new Response(step.text, { status, headers });
    }
    return new Response(JSON.stringify(step.json ?? {}), { status, headers });
  };

  return { fetch, calls };
}
