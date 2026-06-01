export { ForecastEndpoint } from './forecast';
export type { ForecastRequest, ForecastResponse } from './forecast';

export { GeocodingEndpoint } from './geocoding';
export type { GeocodeRequest, GeocodeResponse, GeocodeResult } from './geocoding';

export { AirQualityEndpoint } from './air-quality';
export type { AirQualityRequest, AirQualityResponse, AirQualityVariable } from './air-quality';

export { MarineEndpoint } from './marine';
export type { MarineRequest, MarineResponse, MarineVariable } from './marine';

export { HistoricalEndpoint } from './historical';
export type { HistoricalRequest, HistoricalResponse } from './historical';

export type {
  Coordinate,
  CurrentVariable,
  DailyVariable,
  HourlyVariable,
  PrecipitationUnit,
  TemperatureUnit,
  Timeformat,
  WindSpeedUnit,
} from './types';
