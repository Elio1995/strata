/**
 * Shared types used by more than one endpoint.
 *
 * Open-Meteo accepts the same set of weather variables across forecast,
 * historical, and (in some form) marine endpoints, so they live here rather
 * than duplicated under each endpoint module.
 */

/** Temperature unit. Open-Meteo defaults to Celsius. */
export type TemperatureUnit = 'celsius' | 'fahrenheit';

/** Wind speed unit. Open-Meteo defaults to km/h. */
export type WindSpeedUnit = 'kmh' | 'ms' | 'mph' | 'kn';

/** Precipitation unit. Open-Meteo defaults to millimetres. */
export type PrecipitationUnit = 'mm' | 'inch';

/** Timeformat — `iso8601` is the human-readable default. */
export type Timeformat = 'iso8601' | 'unixtime';

/** A geographic coordinate. Latitude in [-90, 90], longitude in [-180, 180]. */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Hourly weather variables exposed by `/v1/forecast`.
 *
 * Open-Meteo's list is much longer; we surface the common ones to keep
 * autocomplete useful without becoming a wall of constants. Pass any string
 * via `hourly` if you need a variable that isn't enumerated here — the type
 * widens to `string` so it stays usable.
 */
export type HourlyVariable =
  | 'temperature_2m'
  | 'relative_humidity_2m'
  | 'dew_point_2m'
  | 'apparent_temperature'
  | 'precipitation'
  | 'rain'
  | 'snowfall'
  | 'cloud_cover'
  | 'wind_speed_10m'
  | 'wind_direction_10m'
  | 'wind_gusts_10m'
  | 'pressure_msl'
  | 'surface_pressure'
  | 'uv_index'
  | 'is_day'
  | 'weather_code'
  | (string & {});

/** Daily aggregated variables exposed by `/v1/forecast`. */
export type DailyVariable =
  | 'weather_code'
  | 'temperature_2m_max'
  | 'temperature_2m_min'
  | 'apparent_temperature_max'
  | 'apparent_temperature_min'
  | 'sunrise'
  | 'sunset'
  | 'uv_index_max'
  | 'precipitation_sum'
  | 'rain_sum'
  | 'snowfall_sum'
  | 'precipitation_hours'
  | 'precipitation_probability_max'
  | 'wind_speed_10m_max'
  | 'wind_gusts_10m_max'
  | 'wind_direction_10m_dominant'
  | (string & {});

/** Current-conditions variables exposed by `/v1/forecast`. */
export type CurrentVariable =
  | 'temperature_2m'
  | 'relative_humidity_2m'
  | 'apparent_temperature'
  | 'precipitation'
  | 'rain'
  | 'showers'
  | 'snowfall'
  | 'weather_code'
  | 'cloud_cover'
  | 'pressure_msl'
  | 'surface_pressure'
  | 'wind_speed_10m'
  | 'wind_direction_10m'
  | 'wind_gusts_10m'
  | 'is_day'
  | (string & {});
