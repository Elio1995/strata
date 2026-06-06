import type { HttpClient } from '../http/client';
import type { QueryParams } from '../http/types';
import type { Coordinate, Timeformat } from './types';

/**
 * Air-quality variables surfaced by `/v1/air-quality`.
 *
 * The model behind the endpoint is the Copernicus CAMS European air quality
 * forecast — the values are µg/m³ for the chemical pollutants and an index for
 * the European AQI (`european_aqi`).
 */
export type AirQualityVariable =
  | 'pm10'
  | 'pm2_5'
  | 'carbon_monoxide'
  | 'nitrogen_dioxide'
  | 'sulphur_dioxide'
  | 'ozone'
  | 'aerosol_optical_depth'
  | 'dust'
  | 'uv_index'
  | 'uv_index_clear_sky'
  | 'european_aqi'
  | 'us_aqi'
  | (string & {});

export interface AirQualityRequest {
  latitude: number;
  longitude: number;
  hourly?: ReadonlyArray<AirQualityVariable>;
  current?: ReadonlyArray<AirQualityVariable>;
  /** Forecast window in days (1–7). Default: 5. */
  forecastDays?: number;
  pastDays?: number;
  timezone?: string;
  timeformat?: Timeformat;
}

export interface AirQualityResponse extends Coordinate {
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units?: Record<string, string>;
  current?: { time: string; interval: number } & Record<string, number | string>;
  hourly_units?: Record<string, string>;
  hourly?: { time: ReadonlyArray<string> } & Record<string, ReadonlyArray<number | string>>;
}

/**
 * Air quality endpoint lives on the air-quality subdomain on Open-Meteo's side
 * (`air-quality-api.open-meteo.com`). Same host derivation pattern as geocoding.
 */
export class AirQualityEndpoint {
  private static readonly PATH = '/v1/air-quality';
  private readonly host: string;

  constructor(
    private readonly http: HttpClient,
    baseUrl: string,
  ) {
    this.host = deriveAirQualityHost(baseUrl);
  }

  async get(request: AirQualityRequest, signal?: AbortSignal): Promise<AirQualityResponse> {
    const query: QueryParams = {
      latitude: request.latitude,
      longitude: request.longitude,
      hourly: request.hourly,
      current: request.current,
      forecast_days: request.forecastDays,
      past_days: request.pastDays,
      timezone: request.timezone,
      timeformat: request.timeformat,
    };

    return this.http.request<AirQualityResponse>({
      path: AirQualityEndpoint.PATH,
      query,
      baseUrl: this.host,
      signal,
    });
  }
}

function deriveAirQualityHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'api.open-meteo.com') {
      url.hostname = 'air-quality-api.open-meteo.com';
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return 'https://air-quality-api.open-meteo.com';
  }
}
