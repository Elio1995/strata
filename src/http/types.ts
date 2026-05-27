/**
 * Internal types for the HTTP layer.
 *
 * These are not re-exported from the package entry point — consumers interact
 * with `Strata` and `StrataError` only. Keeping them here lets us refactor the
 * transport without breaking the public surface.
 */

/** A fetch-compatible function. Defaults to `globalThis.fetch`. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** A primitive query-string value. Arrays are CSV-joined Open-Meteo style. */
export type QueryValue =
  | string
  | number
  | boolean
  | ReadonlyArray<string | number>
  | null
  | undefined;

/** A map of query parameters. `null` / `undefined` values are dropped. */
export type QueryParams = Readonly<Record<string, QueryValue>>;

export interface RequestOptions {
  /** Path portion of the URL (joined onto the configured baseUrl). */
  path: string;
  /** Query parameters — serialised in stable key order for deduplication. */
  query?: QueryParams;
  /**
   * Override the base URL for a single request. Used by endpoints that live on
   * a different host (e.g. the geocoding API on `geocoding-api.open-meteo.com`).
   * Retries, timeouts, and deduplication still apply.
   */
  baseUrl?: string;
  /** Per-request overrides. */
  timeout?: number;
  retries?: number;
  /** Optional AbortSignal — composed with the internal timeout signal. */
  signal?: AbortSignal;
}

export interface HttpClientConfig {
  /** Base URL for absolute requests. Required. */
  baseUrl: string;
  /** Number of retry attempts after the first failure. Default: 3. */
  retries: number;
  /** Per-request timeout in ms. Default: 10_000. */
  timeout: number;
  /** Optional `User-Agent` header. Browsers ignore this; Node respects it. */
  userAgent?: string;
  /** Pluggable fetch — pass a custom one for testing or to swap to undici. */
  fetch: FetchLike;
}
