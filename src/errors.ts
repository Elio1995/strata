/**
 * Discriminated-union error model for the SDK.
 *
 * Every public method either resolves with a typed response or rejects with a
 * `StrataError`. Callers can `switch` on `err.code` and get exhaustiveness
 * checks from TypeScript — there are no thrown strings, no untyped Error
 * subclasses, and no `instanceof` checks against third-party errors leaking
 * out of the SDK.
 */

/**
 * The canonical set of failure modes the SDK reports to callers.
 *
 * - `NETWORK`     — DNS, TCP, or connection-level failure before the request was sent
 * - `TIMEOUT`     — the request exceeded the configured timeout (AbortController)
 * - `BAD_REQUEST` — server returned 4xx other than 429 (validation, not found, etc.)
 * - `RATE_LIMIT`  — server returned 429
 * - `SERVER`      — server returned 5xx
 * - `PARSE`       — response was non-JSON or otherwise unreadable
 * - `UNKNOWN`     — escape hatch for anything else (we never throw raw Errors)
 */
export type StrataErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_REQUEST'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'PARSE'
  | 'UNKNOWN';

export interface StrataErrorInit {
  code: StrataErrorCode;
  message: string;
  /** HTTP status if the failure happened after a response was received. */
  status?: number;
  /** The URL we were trying to reach (with query string). */
  url?: string;
  /** How many retry attempts we made before giving up. */
  attempts?: number;
  /** The underlying cause — set when we wrap a fetch / abort / parse error. */
  cause?: unknown;
  /** Response body text, if we got one and could read it. */
  body?: string;
}

/**
 * Public error class. Always thrown by the SDK; never a bare `Error` or string.
 *
 * Use `err.code` to dispatch, not `instanceof`. The class identity is preserved
 * across ESM/CJS bundles because we only export one class from the entry point.
 */
export class StrataError extends Error {
  public readonly code: StrataErrorCode;
  public readonly status?: number;
  public readonly url?: string;
  public readonly attempts?: number;
  public readonly body?: string;

  constructor(init: StrataErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = 'StrataError';
    this.code = init.code;
    this.status = init.status;
    this.url = init.url;
    this.attempts = init.attempts;
    this.body = init.body;
    // Preserve the prototype chain when transpiled to ES5 targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Map an HTTP status code to the right `StrataErrorCode`.
 *
 * Centralised here so the HttpClient and any custom transport stay consistent.
 */
export function classifyHttpStatus(status: number): StrataErrorCode {
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500) return 'SERVER';
  if (status >= 400) return 'BAD_REQUEST';
  return 'UNKNOWN';
}

/**
 * Whether a given error code is worth retrying.
 *
 * 4xx (except 429) are deterministic client errors — retrying just burns the
 * quota. Network blips, timeouts, rate limits, and 5xx are all transient.
 */
export function isRetryable(code: StrataErrorCode): boolean {
  return code === 'NETWORK' || code === 'TIMEOUT' || code === 'RATE_LIMIT' || code === 'SERVER';
}
