import {
  AirQualityEndpoint,
  ForecastEndpoint,
  GeocodingEndpoint,
  HistoricalEndpoint,
  MarineEndpoint,
} from './endpoints';
import type { BackoffOptions } from './http/backoff';
import { HttpClient } from './http/client';
import type { FetchLike } from './http/types';

/**
 * User-facing options when instantiating the SDK.
 */
export interface StrataOptions {
  /**
   * Base URL of the Open-Meteo weather API. Defaults to the public host.
   *
   * Endpoints on other hosts (geocoding, air quality, marine, archive) are
   * derived automatically — if you override this with a self-hosted mirror,
   * the SDK will derive `geocoding-api.{your-host}` etc. The mapping isn't
   * perfect; pass `null` and call the endpoints directly via `client.http`
   * if you need to override per-endpoint hosts entirely.
   */
  baseUrl?: string;
  /** Total retry attempts after the first failure. Default: 3. */
  retries?: number;
  /** Per-request timeout in milliseconds. Default: 10_000. */
  timeout?: number;
  /** Optional `User-Agent` header. Set when running server-side for politeness. */
  userAgent?: string;
  /** Pluggable fetch — defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Tuning knobs for the retry backoff. Mostly used in tests. */
  backoff?: BackoffOptions;
}

const DEFAULT_BASE_URL = 'https://api.open-meteo.com';
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The top-level client. Construct once and reuse — instances are stateful
 * (they hold the in-flight dedup map), so creating one per request defeats
 * the dedup benefit on the server.
 *
 * @example
 * ```ts
 * const strata = new Strata();
 * const cities = await strata.geocoding.search({ name: 'Brooklyn' });
 * const [city] = cities.results ?? [];
 * if (!city) throw new Error('not found');
 *
 * const forecast = await strata.forecast.get({
 *   latitude: city.latitude,
 *   longitude: city.longitude,
 *   daily: ['temperature_2m_max', 'temperature_2m_min'],
 *   forecastDays: 7,
 * });
 * ```
 */
export class Strata {
  /** Weather forecast — `GET /v1/forecast`. */
  readonly forecast: ForecastEndpoint;
  /** Place-name → coordinates — `GET /v1/search` on the geocoding host. */
  readonly geocoding: GeocodingEndpoint;
  /** Air quality (pollution + AQI) — `GET /v1/air-quality`. */
  readonly airQuality: AirQualityEndpoint;
  /** Ocean conditions — `GET /v1/marine`. Optional endpoint. */
  readonly marine: MarineEndpoint;
  /** Historical / reanalysis archive — `GET /v1/archive`. Optional endpoint. */
  readonly historical: HistoricalEndpoint;

  /** The shared HTTP transport. Exposed for advanced cases (custom endpoints). */
  readonly http: HttpClient;

  constructor(options: StrataOptions = {}) {
    const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    const fetchImpl = options.fetch ?? resolveDefaultFetch();

    this.http = new HttpClient(
      {
        baseUrl,
        retries: options.retries ?? DEFAULT_RETRIES,
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
        userAgent: options.userAgent,
        fetch: fetchImpl,
      },
      options.backoff ?? {},
    );

    this.forecast = new ForecastEndpoint(this.http);
    this.geocoding = new GeocodingEndpoint(this.http, baseUrl);
    this.airQuality = new AirQualityEndpoint(this.http, baseUrl);
    this.marine = new MarineEndpoint(this.http, baseUrl);
    this.historical = new HistoricalEndpoint(this.http, baseUrl);
  }
}

/**
 * Find a fetch implementation. We capture it once at construction so calls
 * later in the lifecycle still work even if global fetch is monkey-patched.
 */
function resolveDefaultFetch(): FetchLike {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error(
    'Strata: no global `fetch` is available in this environment. ' +
      'Pass a `fetch` option (e.g. `node-fetch`, `undici`) when constructing the client, ' +
      'or upgrade to Node.js 18+.',
  );
}
