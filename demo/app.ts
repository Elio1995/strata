/**
 * Demo page logic — compiled to `app.js` and loaded after the UMD bundle.
 *
 * Kept in TypeScript so the file lints alongside the rest of the repo and
 * demonstrates the SDK with full type checking on the public surface.
 *
 * Build with:
 *   npx tsc demo/app.ts --module umd --target es2020 --strict --lib es2020,dom
 */

// The UMD bundle attaches itself to `window.Strata`. Mirror the types so the
// rest of this file is fully typed against the public surface.
declare const Strata: typeof import('../src/index');

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Showers',
  81: 'Heavy showers',
  82: 'Violent showers',
  95: 'Thunderstorm',
  96: 'Storm with hail',
  99: 'Storm with heavy hail',
};

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const form = $<HTMLFormElement>('#city-form');
const input = $<HTMLInputElement>('#city-input');
const errorBox = $<HTMLElement>('#error');
const loading = $<HTMLElement>('#loading');
const result = $<HTMLElement>('#result');

const strata = new Strata.Strata();

const fmtTemp = (n: number) => `${Math.round(n)}°`;
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });

async function lookup(name: string): Promise<void> {
  errorBox.classList.add('hidden');
  result.classList.add('hidden');
  loading.classList.remove('hidden');

  try {
    const geo = await strata.geocoding.search({ name, count: 1, language: 'en' });
    const city = geo.results?.[0];
    if (!city) {
      throw new Strata.StrataError({ code: 'BAD_REQUEST', message: `no places matched "${name}"` });
    }

    const forecast = await strata.forecast.get({
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone ?? 'auto',
      current: ['temperature_2m', 'weather_code'],
      daily: ['weather_code', 'temperature_2m_max', 'temperature_2m_min'],
      forecastDays: 7,
    });

    render(city, forecast);
  } catch (err) {
    showError(err);
  } finally {
    loading.classList.add('hidden');
  }
}

function render(
  city: import('../src/index').GeocodeResult,
  fc: import('../src/index').ForecastResponse,
): void {
  result.classList.remove('hidden');
  $<HTMLElement>('#city-name').textContent = `${city.name}${city.admin1 ? `, ${city.admin1}` : ''}`;
  $<HTMLElement>('#city-meta').textContent = [city.country, city.timezone]
    .filter(Boolean)
    .join(' · ');

  const today = fc.daily;
  const currentTemp = fc.current && Number(fc.current.temperature_2m);
  $<HTMLElement>('#today-temp').textContent =
    typeof currentTemp === 'number' && !Number.isNaN(currentTemp) ? fmtTemp(currentTemp) : '—';

  const max = today?.temperature_2m_max?.[0];
  const min = today?.temperature_2m_min?.[0];
  $<HTMLElement>('#today-range').textContent =
    typeof max === 'number' && typeof min === 'number'
      ? `High ${fmtTemp(max)} / Low ${fmtTemp(min)}`
      : 'No data for today';

  const strip = $<HTMLElement>('#forecast-strip');
  strip.innerHTML = '';
  const days = today?.time ?? [];
  for (let i = 0; i < days.length; i += 1) {
    const date = days[i];
    const dMax = today?.temperature_2m_max?.[i];
    const dMin = today?.temperature_2m_min?.[i];
    const code = today?.weather_code?.[i];
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-slate-800 bg-slate-900 p-3 text-center';
    card.innerHTML = `
      <p class="text-xs text-slate-400">${typeof date === 'string' ? fmtDay(date) : '—'}</p>
      <p class="mt-1 text-xs text-slate-500">${WEATHER_CODE_LABELS[Number(code)] ?? '—'}</p>
      <p class="mt-2 text-lg font-semibold tabular-nums">${typeof dMax === 'number' ? fmtTemp(dMax) : '—'}</p>
      <p class="text-xs text-slate-500 tabular-nums">${typeof dMin === 'number' ? fmtTemp(dMin) : '—'}</p>
    `;
    strip.appendChild(card);
  }

  $<HTMLElement>('#raw').textContent = JSON.stringify(
    {
      geocode: { name: city.name, latitude: city.latitude, longitude: city.longitude },
      forecast: { generationtime_ms: fc.generationtime_ms, timezone: fc.timezone },
    },
    null,
    2,
  );
}

function showError(err: unknown): void {
  errorBox.classList.remove('hidden');
  if (err instanceof Strata.StrataError) {
    errorBox.textContent = `${err.code}: ${err.message}`;
  } else if (err instanceof Error) {
    errorBox.textContent = err.message;
  } else {
    errorBox.textContent = 'Something went wrong.';
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (value.length >= 2) lookup(value);
});

// Pre-populate so the page is interesting on load.
input.value = 'Brooklyn';
lookup('Brooklyn');
