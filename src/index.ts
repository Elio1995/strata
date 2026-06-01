/**
 * Public entry point.
 *
 * Anything not re-exported here is internal and may change without a major
 * version bump. The exports are deliberately flat so consumers can do
 * `import { Strata, StrataError } from '@elio1995/strata'` and never need to
 * dig into subpaths.
 */

export { Strata } from './client';
export type { StrataOptions } from './client';

export { StrataError, classifyHttpStatus, isRetryable } from './errors';
export type { StrataErrorCode, StrataErrorInit } from './errors';

export type {
  ForecastRequest,
  ForecastResponse,
  GeocodeRequest,
  GeocodeResponse,
  GeocodeResult,
  AirQualityRequest,
  AirQualityResponse,
  AirQualityVariable,
  MarineRequest,
  MarineResponse,
  MarineVariable,
  HistoricalRequest,
  HistoricalResponse,
  Coordinate,
  CurrentVariable,
  DailyVariable,
  HourlyVariable,
  PrecipitationUnit,
  TemperatureUnit,
  Timeformat,
  WindSpeedUnit,
} from './endpoints';

export { VERSION } from './version';
