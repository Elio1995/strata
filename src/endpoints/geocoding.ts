import type { HttpClient } from '../http/client';
import type { QueryParams } from '../http/types';

export interface GeocodeRequest {
  /** Free-text place name. Minimum 1 char; Open-Meteo recommends 2+. */
  name: string;
  /** Max results to return (1–100). Default: 10. */
  count?: number;
  /** ISO-639-1 language code (e.g. 'en', 'fr', 'de'). Default: 'en'. */
  language?: string;
  /** Response format. We hard-code 'json' inside the SDK; exposed for completeness. */
  format?: 'json';
}

export interface GeocodeResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  feature_code?: string;
  country_code?: string;
  country?: string;
  country_id?: number;
  population?: number;
  postcodes?: ReadonlyArray<string>;
  admin1?: string;
  admin2?: string;
  admin3?: string;
  admin4?: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone?: string;
}

export interface GeocodeResponse {
  results?: ReadonlyArray<GeocodeResult>;
  generationtime_ms: number;
}

/**
 * Geocoding lives on `geocoding-api.open-meteo.com`, not the main API host.
 * We derive the host from the configured `baseUrl` so a self-hosted Open-Meteo
 * mirror still resolves correctly. Retry / dedup / timeout behaviour is
 * inherited from the shared `HttpClient`.
 */
export class GeocodingEndpoint {
  private static readonly PATH = '/v1/search';
  private readonly host: string;

  constructor(
    private readonly http: HttpClient,
    baseUrl: string,
  ) {
    this.host = deriveGeocodingHost(baseUrl);
  }

  /**
   * Search for places by name. Returns up to `count` matches ordered by
   * relevance — usually you want `result.results?.[0]` for the most popular
   * match. Returns an empty `results` field when there are no hits.
   */
  async search(request: GeocodeRequest, signal?: AbortSignal): Promise<GeocodeResponse> {
    const query: QueryParams = {
      name: request.name,
      count: request.count,
      language: request.language,
      format: request.format ?? 'json',
    };

    return this.http.request<GeocodeResponse>({
      path: GeocodingEndpoint.PATH,
      query,
      baseUrl: this.host,
      signal,
    });
  }
}

/** Swap `api.open-meteo.com` to `geocoding-api.open-meteo.com`, leave others. */
function deriveGeocodingHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'api.open-meteo.com') {
      url.hostname = 'geocoding-api.open-meteo.com';
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return 'https://geocoding-api.open-meteo.com';
  }
}
