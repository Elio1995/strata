import type { HttpClient } from '../http/client';
import type { QueryParams } from '../http/types';
import type { Coordinate, Timeformat } from './types';

/** Marine variables — wave height, period, direction, swell components. */
export type MarineVariable =
  | 'wave_height'
  | 'wave_direction'
  | 'wave_period'
  | 'wind_wave_height'
  | 'wind_wave_direction'
  | 'wind_wave_period'
  | 'swell_wave_height'
  | 'swell_wave_direction'
  | 'swell_wave_period'
  | 'ocean_current_velocity'
  | 'ocean_current_direction'
  | (string & {});

export interface MarineRequest {
  latitude: number;
  longitude: number;
  hourly?: ReadonlyArray<MarineVariable>;
  daily?: ReadonlyArray<MarineVariable>;
  current?: ReadonlyArray<MarineVariable>;
  forecastDays?: number;
  pastDays?: number;
  timezone?: string;
  timeformat?: Timeformat;
}

export interface MarineResponse extends Coordinate {
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units?: Record<string, string>;
  current?: { time: string; interval: number } & Record<string, number | string>;
  hourly_units?: Record<string, string>;
  hourly?: { time: ReadonlyArray<string> } & Record<string, ReadonlyArray<number | string>>;
  daily_units?: Record<string, string>;
  daily?: { time: ReadonlyArray<string> } & Record<string, ReadonlyArray<number | string>>;
}

/**
 * Marine forecast lives on `marine-api.open-meteo.com`. Optional endpoint —
 * exposed for portfolio completeness; many SDK consumers will only need
 * forecast + geocoding.
 */
export class MarineEndpoint {
  private static readonly PATH = '/v1/marine';
  private readonly host: string;

  constructor(
    private readonly http: HttpClient,
    baseUrl: string,
  ) {
    this.host = deriveMarineHost(baseUrl);
  }

  async get(request: MarineRequest, signal?: AbortSignal): Promise<MarineResponse> {
    const query: QueryParams = {
      latitude: request.latitude,
      longitude: request.longitude,
      hourly: request.hourly,
      daily: request.daily,
      current: request.current,
      forecast_days: request.forecastDays,
      past_days: request.pastDays,
      timezone: request.timezone,
      timeformat: request.timeformat,
    };

    return this.http.request<MarineResponse>({
      path: MarineEndpoint.PATH,
      query,
      baseUrl: this.host,
      signal,
    });
  }
}

function deriveMarineHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'api.open-meteo.com') {
      url.hostname = 'marine-api.open-meteo.com';
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return 'https://marine-api.open-meteo.com';
  }
}
