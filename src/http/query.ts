import type { QueryParams } from './types';

/**
 * Serialise a query map to a `?a=1&b=2,3` string.
 *
 * Open-Meteo accepts CSV-encoded arrays (e.g. `hourly=temperature_2m,wind_speed_10m`),
 * so arrays are joined with commas rather than repeated keys. Keys are sorted so
 * the resulting string is stable — that stability is what makes request
 * deduplication safe (see `HttpClient.request`).
 *
 * Empty / nullish values are dropped, not sent as `=`.
 */
export function serializeQuery(query: QueryParams | undefined): string {
  if (!query) return '';

  const keys = Object.keys(query).sort();
  const parts: string[] = [];

  for (const key of keys) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(','))}`);
      continue;
    }

    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }

  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/** Join a base URL and a path, tolerating trailing/leading slashes. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  return `${base}${rel}`;
}
