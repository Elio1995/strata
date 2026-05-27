import { StrataError, type StrataErrorCode, classifyHttpStatus, isRetryable } from '../errors';
import { type BackoffOptions, computeBackoff, sleep } from './backoff';
import { joinUrl, serializeQuery } from './query';
import type { FetchLike, HttpClientConfig, RequestOptions } from './types';

/**
 * Low-level HTTP transport.
 *
 * Responsible for:
 *   1. Building the absolute URL (base + path + sorted query string).
 *   2. Applying the per-request timeout via AbortController.
 *   3. Retrying transient failures with exponential backoff + full jitter.
 *   4. Deduplicating identical concurrent in-flight requests so a sudden burst
 *      from several components rendering the same hook collapses to one fetch.
 *   5. Wrapping every failure in a `StrataError` with a discriminated `code`.
 *
 * The class is intentionally generic — it knows nothing about Open-Meteo's
 * schema. Endpoint files in `src/endpoints/` layer the typing on top.
 */
export class HttpClient {
  private readonly config: HttpClientConfig;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly backoffOptions: BackoffOptions;

  constructor(config: HttpClientConfig, backoffOptions: BackoffOptions = {}) {
    this.config = config;
    this.backoffOptions = backoffOptions;
  }

  /**
   * Fully-typed JSON request. The caller asserts the response shape via the
   * `T` type parameter — there is no runtime schema validation by design (the
   * SDK is thin; consumers who want Zod can layer it on).
   */
  async request<T>(opts: RequestOptions): Promise<T> {
    const url = opts.baseUrl
      ? joinUrl(opts.baseUrl, opts.path) + serializeQuery(opts.query)
      : this.buildUrl(opts);
    // Same URL = same response from Open-Meteo's perspective. Concurrent callers
    // share the same promise; we only delete the entry once the underlying
    // request settles, so the dedup window is exactly "while a fetch is in flight".
    const existing = this.inFlight.get(url) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = this.executeWithRetry<T>(url, opts).finally(() => {
      this.inFlight.delete(url);
    });
    this.inFlight.set(url, promise);
    return promise;
  }

  /** Expose the URL builder so tests can assert the exact wire format. */
  buildUrl(opts: Pick<RequestOptions, 'path' | 'query'>): string {
    return joinUrl(this.config.baseUrl, opts.path) + serializeQuery(opts.query);
  }

  /** Number of in-flight requests — useful for assertions and metrics. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  private async executeWithRetry<T>(url: string, opts: RequestOptions): Promise<T> {
    const retries = opts.retries ?? this.config.retries;
    let attempt = 0;
    let lastError: StrataError | undefined;

    while (attempt <= retries) {
      try {
        return await this.executeOnce<T>(url, opts, attempt);
      } catch (err) {
        const error = err instanceof StrataError ? err : this.wrapUnknown(err, url, attempt);
        lastError = error;

        if (attempt >= retries || !isRetryable(error.code)) {
          throw new StrataError({
            code: error.code,
            message: error.message,
            status: error.status,
            url,
            attempts: attempt + 1,
            cause: error.cause,
            body: error.body,
          });
        }

        const delay = computeBackoff(attempt, this.backoffOptions);
        await sleep(delay, opts.signal);
        attempt += 1;
      }
    }

    // Unreachable in practice — the loop either returns or throws — but keep
    // the type system happy with a deterministic fallback.
    throw (
      lastError ??
      new StrataError({
        code: 'UNKNOWN',
        message: 'retry loop exited without a result',
        url,
        attempts: attempt,
      })
    );
  }

  private async executeOnce<T>(url: string, opts: RequestOptions, attempt: number): Promise<T> {
    const timeoutMs = opts.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('strata:timeout')), timeoutMs);

    // Compose the caller-supplied signal with our timeout signal.
    const onCallerAbort = () => controller.abort(opts.signal?.reason);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort(opts.signal.reason);
      else opts.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (this.config.userAgent) headers['user-agent'] = this.config.userAgent;

      const response = await this.invokeFetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await this.safeReadBody(response);
        throw new StrataError({
          code: classifyHttpStatus(response.status),
          message: `request failed with status ${response.status}`,
          status: response.status,
          url,
          attempts: attempt + 1,
          body,
        });
      }

      try {
        return (await response.json()) as T;
      } catch (err) {
        throw new StrataError({
          code: 'PARSE',
          message: 'response body was not valid JSON',
          status: response.status,
          url,
          attempts: attempt + 1,
          cause: err,
        });
      }
    } catch (err) {
      if (err instanceof StrataError) throw err;
      throw this.wrapUnknown(err, url, attempt);
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onCallerAbort);
    }
  }

  private async invokeFetch(url: string, init: RequestInit): Promise<Response> {
    const fetchImpl: FetchLike = this.config.fetch;
    return fetchImpl(url, init);
  }

  private async safeReadBody(response: Response): Promise<string | undefined> {
    try {
      const text = await response.text();
      return text.length > 0 ? text : undefined;
    } catch {
      return undefined;
    }
  }

  private wrapUnknown(err: unknown, url: string, attempt: number): StrataError {
    // AbortError when our internal timeout fires — name varies between Node /
    // browser / undici, so check both the property and the message we set.
    const name = err instanceof Error ? err.name : undefined;
    const message = err instanceof Error ? err.message : String(err);
    const isAbort =
      name === 'AbortError' || message.includes('strata:timeout') || message.includes('aborted');

    const code: StrataErrorCode = isAbort ? 'TIMEOUT' : 'NETWORK';
    return new StrataError({
      code,
      message: isAbort
        ? `request timed out after retry attempt ${attempt + 1}`
        : `network error: ${message}`,
      url,
      attempts: attempt + 1,
      cause: err,
    });
  }
}
