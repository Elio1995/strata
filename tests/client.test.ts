import { describe, expect, it, vi } from 'vitest';
import { Strata } from '../src/client';

const forecastBody = {
  latitude: 40.71,
  longitude: -74.01,
  generationtime_ms: 0.42,
  utc_offset_seconds: -14400,
  timezone: 'America/New_York',
  timezone_abbreviation: 'EDT',
  elevation: 10,
  daily_units: {
    time: 'iso8601',
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
  },
  daily: {
    time: ['2026-06-24', '2026-06-25', '2026-06-26'],
    temperature_2m_max: [28.4, 30.1, 27.0],
    temperature_2m_min: [19.2, 20.5, 18.8],
  },
};

const geocodeBody = {
  generationtime_ms: 0.1,
  results: [
    {
      id: 5128581,
      name: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      country_code: 'US',
      country: 'United States',
      timezone: 'America/New_York',
      population: 8175133,
    },
  ],
};

describe('Strata client — typed endpoint mapping', () => {
  it('forecast.get returns the parsed body with daily arrays preserved', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(forecastBody)));
    const strata = new Strata({ fetch: fetchSpy, retries: 0, timeout: 1000 });

    const result = await strata.forecast.get({
      latitude: 40.7128,
      longitude: -74.006,
      daily: ['temperature_2m_max', 'temperature_2m_min'],
      forecastDays: 3,
      timezone: 'America/New_York',
    });

    expect(result.timezone).toBe('America/New_York');
    expect(result.daily?.time).toHaveLength(3);
    expect(result.daily?.temperature_2m_max).toEqual([28.4, 30.1, 27.0]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify the URL we built — sorted query string, CSV-joined daily array.
    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url).toContain('https://api.open-meteo.com/v1/forecast');
    expect(url).toContain('daily=temperature_2m_max%2Ctemperature_2m_min');
    expect(url).toContain('forecast_days=3');
    expect(url).toContain('latitude=40.7128');
    expect(url).toContain('longitude=-74.006');
    expect(url).toContain('timezone=America%2FNew_York');
  });

  it('geocoding.search hits the geocoding subdomain, not the main API host', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(geocodeBody)));
    const strata = new Strata({ fetch: fetchSpy, retries: 0 });

    const result = await strata.geocoding.search({ name: 'New York', count: 1 });

    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url.startsWith('https://geocoding-api.open-meteo.com/v1/search')).toBe(true);
    expect(url).toContain('name=New%20York');
    expect(url).toContain('count=1');
    expect(url).toContain('format=json');
    expect(result.results?.[0]?.name).toBe('New York');
  });

  it('airQuality.get hits the air-quality subdomain', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...forecastBody,
            current: { time: '2026-06-24T12:00', interval: 3600, european_aqi: 38 },
            current_units: { european_aqi: 'EAQI' },
          }),
        ),
    );
    const strata = new Strata({ fetch: fetchSpy, retries: 0 });

    await strata.airQuality.get({
      latitude: 40.7128,
      longitude: -74.006,
      current: ['european_aqi'],
    });

    const url = fetchSpy.mock.calls[0]?.[0] as string;
    expect(url.startsWith('https://air-quality-api.open-meteo.com/v1/air-quality')).toBe(true);
    expect(url).toContain('current=european_aqi');
  });
});
