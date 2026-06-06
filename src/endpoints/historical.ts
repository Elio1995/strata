import type { HttpClient } from '../http/client';
import type { QueryParams } from '../http/types';
import type {
  Coordinate,
  DailyVariable,
  HourlyVariable,
  PrecipitationUnit,
  TemperatureUnit,
  Timeformat,
  WindSpeedUnit,
} from './types';

/**
 * Historical / archive request. Open-Meteo serves this off `archive-api.open-meteo.com`
 * with the same shape as `/v1/forecast`, except you specify a date range instead
 * of a window relative to today.
 */
export interface HistoricalRequest {
  latitude: number;
  longitude: number;
  /** Inclusive start date in `YYYY-MM-DD` format. */
  startDate: string;
  /** Inclusive end date in `YYYY-MM-DD` format. */
  endDate: string;
  hourly?: ReadonlyArray<HourlyVariable>;
  daily?: ReadonlyArray<DailyVariable>;
  timezone?: string;
  temperatureUnit?: TemperatureUnit;
  windSpeedUnit?: WindSpeedUnit;
  precipitationUnit?: PrecipitationUnit;
  timeformat?: Timeformat;
}

export interface HistoricalResponse extends Coordinate {
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units?: Record<string, string>;
  hourly?: { time: ReadonlyArray<string> } & Record<string, ReadonlyArray<number | string>>;
  daily_units?: Record<string, string>;
  daily?: { time: ReadonlyArray<string> } & Record<string, ReadonlyArray<number | string>>;
}

export class HistoricalEndpoint {
  private static readonly PATH = '/v1/archive';
  private readonly host: string;

  constructor(
    private readonly http: HttpClient,
    baseUrl: string,
  ) {
    this.host = deriveArchiveHost(baseUrl);
  }

  async get(request: HistoricalRequest, signal?: AbortSignal): Promise<HistoricalResponse> {
    const query: QueryParams = {
      latitude: request.latitude,
      longitude: request.longitude,
      start_date: request.startDate,
      end_date: request.endDate,
      hourly: request.hourly,
      daily: request.daily,
      timezone: request.timezone,
      temperature_unit: request.temperatureUnit,
      wind_speed_unit: request.windSpeedUnit,
      precipitation_unit: request.precipitationUnit,
      timeformat: request.timeformat,
    };

    return this.http.request<HistoricalResponse>({
      path: HistoricalEndpoint.PATH,
      query,
      baseUrl: this.host,
      signal,
    });
  }
}

function deriveArchiveHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === 'api.open-meteo.com') {
      url.hostname = 'archive-api.open-meteo.com';
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return 'https://archive-api.open-meteo.com';
  }
}
