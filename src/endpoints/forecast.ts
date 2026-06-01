import type { HttpClient } from '../http/client';
import type { QueryParams } from '../http/types';
import type {
  Coordinate,
  CurrentVariable,
  DailyVariable,
  HourlyVariable,
  PrecipitationUnit,
  TemperatureUnit,
  Timeformat,
  WindSpeedUnit,
} from './types';

/**
 * Request shape for `/v1/forecast`.
 *
 * The mandatory fields are the coordinate; everything else is optional. Pass
 * a `hourly`, `daily`, or `current` array to ask for those bundles in the
 * response — they're keyed by the variable name in the response object.
 */
export interface ForecastRequest {
  latitude: number;
  longitude: number;
  hourly?: ReadonlyArray<HourlyVariable>;
  daily?: ReadonlyArray<DailyVariable>;
  current?: ReadonlyArray<CurrentVariable>;
  /** Number of days for the daily/hourly forecast (1–16). Default: 7. */
  forecastDays?: number;
  /** Number of past days to include alongside the forecast. Default: 0. */
  pastDays?: number;
  timezone?: string;
  temperatureUnit?: TemperatureUnit;
  windSpeedUnit?: WindSpeedUnit;
  precipitationUnit?: PrecipitationUnit;
  timeformat?: Timeformat;
}

/**
 * The response object follows Open-Meteo's flat shape: parallel arrays inside
 * `hourly`, `daily`, and a single object inside `current`. We surface the
 * units alongside the values so callers don't have to remember what they
 * asked for.
 */
export interface ForecastResponse extends Coordinate {
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

function toQuery(req: ForecastRequest): QueryParams {
  return {
    latitude: req.latitude,
    longitude: req.longitude,
    hourly: req.hourly,
    daily: req.daily,
    current: req.current,
    forecast_days: req.forecastDays,
    past_days: req.pastDays,
    timezone: req.timezone,
    temperature_unit: req.temperatureUnit,
    wind_speed_unit: req.windSpeedUnit,
    precipitation_unit: req.precipitationUnit,
    timeformat: req.timeformat,
  };
}

/**
 * The forecast namespace, attached to `StrataClient.forecast`.
 *
 * Kept as a class (not a bag of functions) so each namespace can hold its own
 * `HttpClient` reference cleanly and is easy to extend with helpers (`get` is
 * the wire-level call; add `forecastDaily`, `forecastHourly`, etc., as syntactic
 * sugar without breaking the v1 surface).
 */
export class ForecastEndpoint {
  private static readonly PATH = '/v1/forecast';

  constructor(private readonly http: HttpClient) {}

  /**
   * Call `GET /v1/forecast` with the given request and return the typed result.
   *
   * No runtime validation — the SDK trusts Open-Meteo's contract. Callers who
   * want validation can pipe the response through Zod or Valibot on their end.
   */
  async get(request: ForecastRequest, signal?: AbortSignal): Promise<ForecastResponse> {
    return this.http.request<ForecastResponse>({
      path: ForecastEndpoint.PATH,
      query: toQuery(request),
      signal,
    });
  }
}
