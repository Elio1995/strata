import { describe, expect, it } from 'vitest';
import { joinUrl, serializeQuery } from '../src/http/query';

describe('serializeQuery', () => {
  it('returns an empty string for undefined or empty', () => {
    expect(serializeQuery(undefined)).toBe('');
    expect(serializeQuery({})).toBe('');
  });

  it('sorts keys so identical-content queries produce identical strings (dedup invariant)', () => {
    const a = serializeQuery({ latitude: 40.7, longitude: -74.0, hourly: ['temperature_2m'] });
    const b = serializeQuery({ hourly: ['temperature_2m'], longitude: -74.0, latitude: 40.7 });
    expect(a).toBe(b);
  });

  it('joins arrays with commas (Open-Meteo CSV format)', () => {
    const q = serializeQuery({ daily: ['temperature_2m_max', 'temperature_2m_min'] });
    // Comma is %2C once encoded.
    expect(q).toBe('?daily=temperature_2m_max%2Ctemperature_2m_min');
  });

  it('drops null, undefined, and empty-string values entirely', () => {
    const q = serializeQuery({
      a: 1,
      b: null,
      c: undefined,
      d: '',
      e: 'kept',
      f: [],
    });
    // 'a' and 'e' survive, sorted alphabetically; the rest are silently dropped.
    expect(q).toBe('?a=1&e=kept');
  });

  it('coerces booleans to "true" / "false" strings', () => {
    const q = serializeQuery({ daily: true, hourly: false });
    expect(q).toBe('?daily=true&hourly=false');
  });
});

describe('joinUrl', () => {
  it('tolerates trailing slashes on the base and leading slashes on the path', () => {
    expect(joinUrl('https://api.test', '/v1/foo')).toBe('https://api.test/v1/foo');
    expect(joinUrl('https://api.test/', '/v1/foo')).toBe('https://api.test/v1/foo');
    expect(joinUrl('https://api.test', 'v1/foo')).toBe('https://api.test/v1/foo');
    expect(joinUrl('https://api.test/', 'v1/foo')).toBe('https://api.test/v1/foo');
  });
});
