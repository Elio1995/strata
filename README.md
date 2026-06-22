# Strata

> A fully-typed TypeScript SDK for the Open-Meteo weather API. Retries with exponential backoff, request deduplication, timeouts, discriminated-union error types, and ESM + CJS + UMD bundles in one package.

Strata wraps the public [Open-Meteo](https://open-meteo.com) API (free, no
API key) behind the SDK patterns that real production HTTP clients ship with —
exponential backoff with jitter, AbortController-backed timeouts, in-flight
deduplication, typed endpoints, semantic-release-driven publishing, and the
multi-target build (ESM + CJS + UMD) you'd expect from a published package.

This repo exists to demonstrate how I build SDKs: small public surface,
defensive transport, end-to-end types, real tests, and CI-ready.

---

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Tech stack and why](#tech-stack-and-why)
- [Install](#install)
- [Quickstart](#quickstart)
- [API reference](#api-reference)
  - [forecast.get](#forecastget)
  - [geocoding.search](#geocodingsearch)
  - [airQuality.get](#airqualityget)
  - [marine.get](#marineget)
  - [historical.get](#historicalget)
- [Error handling](#error-handling)
- [Advanced topics](#advanced-topics)
  - [Retries and backoff](#retries-and-backoff)
  - [Timeouts and cancellation](#timeouts-and-cancellation)
  - [Request deduplication](#request-deduplication)
  - [Custom fetch (Node, undici, polyfills)](#custom-fetch-node-undici-polyfills)
  - [Runtime validation with Zod](#runtime-validation-with-zod)
- [Browser usage (UMD)](#browser-usage-umd)
- [TypeScript usage](#typescript-usage)
- [Tests](#tests)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [What's out of scope](#whats-out-of-scope)
- [Demo](#demo)
- [License](#license)

---

## What it does

You install the SDK, construct one client, and call typed methods:

```ts
import { Strata } from '@elio1995/strata';

const strata = new Strata();

const cities = await strata.geocoding.search({ name: 'Brooklyn' });
const city = cities.results?.[0];
if (!city) throw new Error('not found');

const fc = await strata.forecast.get({
  latitude: city.latitude,
  longitude: city.longitude,
  daily: ['temperature_2m_max', 'temperature_2m_min', 'weather_code'],
  forecastDays: 7,
  timezone: 'auto',
});

// Fully typed — `daily` is `(string | number)[]` per key, etc.
console.log(fc.daily?.time);                    // ["2026-06-24", "2026-06-25", ...]
console.log(fc.daily?.temperature_2m_max);      // [28.4, 30.1, 27.0, ...]
```

What you get back from `forecast.get` is the parsed JSON response with full
TypeScript types — no `any`, no untyped record lookups. The response includes
parallel arrays under `daily` and `hourly`, plus the unit map under
`daily_units` / `hourly_units` so the caller never has to remember what they
asked for.

---

## How it works

```
+---------------------------------------------------+
|  Strata (top-level client)                        |
|  - holds the HttpClient, exposes namespaces       |
+-----------------------+---------------------------+
                        |
                        v
+---------------------------------------------------+
|  Namespaced endpoints                             |
|  forecast / geocoding / airQuality / marine /     |
|  historical                                       |
+-----------------------+---------------------------+
                        |
                        v
+---------------------------------------------------+
|  HttpClient                                       |
|  - stable URL builder (sorted query)              |
|  - exponential backoff w/ jitter (3 attempts)     |
|  - AbortController timeouts (10s default)         |
|  - in-flight request dedup                        |
|  - error classification -> StrataError            |
+-----------------------+---------------------------+
                        |
                        v
+---------------------------------------------------+
|  Pluggable fetch (default: globalThis.fetch)      |
+---------------------------------------------------+
```

The interesting parts:

- **Stable URL builder.** Query keys are sorted before serialisation, so two
  callers passing the same params in different orders produce the same URL.
  That stability is what makes the dedup map a correctness optimisation, not
  a flaky one.
- **Exponential backoff with full jitter.** 200ms → 400ms → 800ms (then
  jittered to `[0.5x, 1x]`) so retrying SDK instances don't form a thundering
  herd against the same upstream after an outage.
- **AbortController timeouts.** Each request gets its own controller. Any
  caller-supplied `AbortSignal` is composed with the internal one — cancelling
  yours cancels the request immediately.
- **Discriminated-union errors.** Every rejection is a `StrataError` with a
  `code` field. Callers `switch` on the code and TypeScript checks the cases.
  No `instanceof` against framework-specific subclasses; no parsing error
  strings.
- **In-flight deduplication.** Identical concurrent calls share one fetch.
  Useful when multiple components call the same hook on first render.
- **Multi-host derivation.** Open-Meteo splits forecast, geocoding, air
  quality, marine, and archive across five subdomains. The SDK derives the
  right host per endpoint from a single configured base URL.

Design rationale and trade-offs in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Tech stack and why

| Layer          | Choice                          | Reasoning                                                                |
| -------------- | ------------------------------- | ------------------------------------------------------------------------ |
| Language       | TypeScript strict + `noUncheckedIndexedAccess` | Catches the index-out-of-bounds bugs that plague API clients |
| Transport      | Native `fetch`                  | Universal — Node 18+, every browser, Bun, Workers. Zero deps shipped     |
| Bundler        | Rollup 4                        | Best-in-class multi-format output (ESM + CJS + UMD from one config)      |
| Types bundling | `rollup-plugin-dts`             | Produces a single `dist/index.d.ts` so editor tooling resolves cleanly   |
| Tests          | Vitest                          | ESM-native, fast, Jest-compatible API. No CJS gymnastics                 |
| Lint/format    | Biome 1.9                       | One binary, one config — replaces ESLint + Prettier + import sorters     |
| Release        | semantic-release                | Tag, changelog, and npm publish from conventional commits (dry-run only) |
| Commit lint    | commitlint + conventional commits | Keeps the changelog generator from making things up                    |
| CI             | GitHub Actions                  | lint → typecheck → test → build on Node 20 and 22                        |
| Package mgr    | pnpm                            | Strict, fast, disk-efficient                                             |

---

## Install

```bash
# pnpm
pnpm add @elio1995/strata

# npm
npm install @elio1995/strata

# yarn
yarn add @elio1995/strata
```

> **Scope note.** This repo is configured for `semantic-release` but the
> publish step is intentionally **`npmPublish: false`** in
> [`release.config.cjs`](./release.config.cjs) — it's a portfolio project, not
> a registered package. To publish for real, flip the flag and add an
> `NPM_TOKEN` secret in CI.

Requires **Node.js 18.17+** (for native `fetch`). Browsers: any evergreen
release that supports `AbortController` and `fetch` (basically everything 2020+).

---

## Quickstart

```ts
import { Strata, StrataError } from '@elio1995/strata';

const strata = new Strata({
  retries: 3,         // total retry attempts after the first failure
  timeout: 10_000,    // per-request timeout in ms
  userAgent: 'my-app/1.0',  // server-side politeness; browsers ignore this
});

try {
  const cities = await strata.geocoding.search({ name: 'Tokyo', count: 1 });
  const city = cities.results?.[0];
  if (!city) throw new Error('not found');

  const forecast = await strata.forecast.get({
    latitude: city.latitude,
    longitude: city.longitude,
    current: ['temperature_2m', 'weather_code'],
    daily: ['temperature_2m_max', 'temperature_2m_min'],
    forecastDays: 5,
    timezone: city.timezone ?? 'auto',
  });

  console.log(`It's currently ${forecast.current?.temperature_2m}°C in ${city.name}.`);
} catch (err) {
  if (err instanceof StrataError) {
    console.error(`[${err.code}] ${err.message} (status=${err.status ?? 'n/a'})`);
  } else {
    throw err;
  }
}
```

---

## API reference

All methods accept an optional second argument `signal?: AbortSignal` for
cancellation. Requests and responses are typed end-to-end.

### `forecast.get`

`GET /v1/forecast` on `api.open-meteo.com`.

```ts
const forecast = await strata.forecast.get({
  latitude: 48.8566,
  longitude: 2.3522,
  current: ['temperature_2m', 'weather_code', 'wind_speed_10m'],
  hourly: ['temperature_2m', 'precipitation_probability'],
  daily: ['temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset'],
  forecastDays: 7,
  pastDays: 1,
  timezone: 'Europe/Paris',
  temperatureUnit: 'celsius',     // 'celsius' | 'fahrenheit'
  windSpeedUnit: 'kmh',           // 'kmh' | 'ms' | 'mph' | 'kn'
  precipitationUnit: 'mm',        // 'mm' | 'inch'
});
```

The response contains parallel arrays (`forecast.hourly.time`,
`forecast.hourly.temperature_2m`, ...) plus per-key unit strings (e.g.
`forecast.hourly_units.temperature_2m === '°C'`).

### `geocoding.search`

`GET /v1/search` on `geocoding-api.open-meteo.com`.

```ts
const result = await strata.geocoding.search({
  name: 'Lisbon',
  count: 5,
  language: 'en',
});
result.results?.forEach((c) => console.log(c.name, c.country, c.latitude, c.longitude));
```

Returns up to `count` matches ordered by relevance. `result.results` is
`undefined` when there are no hits — keep the optional chaining.

### `airQuality.get`

`GET /v1/air-quality` on `air-quality-api.open-meteo.com`.

```ts
const air = await strata.airQuality.get({
  latitude: 40.7128,
  longitude: -74.006,
  current: ['european_aqi', 'us_aqi', 'pm10', 'pm2_5'],
  hourly: ['ozone', 'nitrogen_dioxide'],
  forecastDays: 3,
});
console.log('AQI:', air.current?.european_aqi);
```

### `marine.get`

`GET /v1/marine` on `marine-api.open-meteo.com`.

```ts
const sea = await strata.marine.get({
  latitude: 51.51,
  longitude: 0.1,
  hourly: ['wave_height', 'swell_wave_period'],
  forecastDays: 2,
});
```

### `historical.get`

`GET /v1/archive` on `archive-api.open-meteo.com`.

```ts
const archive = await strata.historical.get({
  latitude: 40.7128,
  longitude: -74.006,
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  daily: ['temperature_2m_max', 'temperature_2m_min'],
});
```

Date format is `YYYY-MM-DD`. The archive is delayed by a few days from real
time; for "yesterday" data use `forecast.get` with `pastDays: 1`.

---

## Error handling

Every rejection is a `StrataError` with a discriminated `code`:

```ts
import { Strata, StrataError, type StrataErrorCode } from '@elio1995/strata';

const strata = new Strata();

try {
  await strata.forecast.get({ latitude: 0, longitude: 0 });
} catch (err) {
  if (!(err instanceof StrataError)) throw err;

  // `code` is a string-literal union — TypeScript checks exhaustiveness here.
  switch (err.code) {
    case 'TIMEOUT':     return retryLater();
    case 'RATE_LIMIT':  return backOff(err);
    case 'NETWORK':     return showOfflineBanner();
    case 'SERVER':      return reportToSentry(err);
    case 'BAD_REQUEST': return showValidationError(err.body);
    case 'PARSE':       return reportCorruptResponse(err);
    case 'UNKNOWN':     return reportToSentry(err);
  }
}
```

Each error carries `status`, `url`, `attempts`, and the response `body` (when
one was readable). Use `err.cause` for the underlying fetch / abort error.

| Code         | When                              | Retryable? |
| ------------ | --------------------------------- | ---------- |
| `NETWORK`    | DNS / TCP / fetch threw           | yes        |
| `TIMEOUT`    | request exceeded the timeout      | yes        |
| `RATE_LIMIT` | HTTP 429                          | yes        |
| `SERVER`     | HTTP 5xx                          | yes        |
| `BAD_REQUEST`| HTTP 4xx (other than 429)         | no         |
| `PARSE`      | response was not valid JSON       | no         |
| `UNKNOWN`    | escape hatch                      | no         |

The SDK retries the "yes" rows automatically; the "no" rows propagate to your
catch on the first failure.

---

## Advanced topics

### Retries and backoff

The default schedule is **200ms → 400ms → 800ms** before jitter, with 3 total
retry attempts. Each delay is multiplied by a uniform random factor in
`[0.5, 1)` — see [`ARCHITECTURE.md`](./ARCHITECTURE.md) § Why exponential
backoff with full jitter.

Override per-client:

```ts
const strata = new Strata({
  retries: 5,
  backoff: { baseMs: 500, capMs: 30_000 },
});
```

### Timeouts and cancellation

Per-request timeout in milliseconds:

```ts
const strata = new Strata({ timeout: 3_000 });
```

Cancel from the outside:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 1_000);
const forecast = await strata.forecast.get({ latitude: 0, longitude: 0 }, controller.signal);
```

A cancelled request rejects with `code === 'TIMEOUT'`.

### Request deduplication

Concurrent identical calls share one fetch:

```ts
const a = strata.forecast.get({ latitude: 51.5, longitude: -0.1 });
const b = strata.forecast.get({ latitude: 51.5, longitude: -0.1 });
// 1 fetch, 2 awaiters
console.log(await Promise.all([a, b]));
```

The dedup key is the fully-built URL with sorted query parameters, so
parameter order does not affect dedup. Dedup is in-flight only — once the
fetch resolves, the entry is released. (Caching is intentionally out of scope.)

### Custom fetch (Node, undici, polyfills)

Pass any fetch-compatible function:

```ts
import { fetch as undiciFetch } from 'undici';
const strata = new Strata({ fetch: undiciFetch });
```

This is also the test seam — pass a mock and assert on URLs without
intercepting the global.

### Runtime validation with Zod

Strata trusts Open-Meteo's contract and doesn't validate at runtime (see the
[ARCHITECTURE.md](./ARCHITECTURE.md) § Why no runtime schema validation). If
you want validation:

```ts
import { z } from 'zod';
const ForecastSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  daily: z.object({ time: z.array(z.string()), temperature_2m_max: z.array(z.number()) }).optional(),
});

const raw = await strata.forecast.get({ /* ... */ });
const validated = ForecastSchema.parse(raw);
```

---

## Browser usage (UMD)

```html
<script src="https://unpkg.com/@elio1995/strata/umd/strata.js"></script>
<script>
  const strata = new Strata.Strata();
  strata.forecast
    .get({ latitude: 40.7, longitude: -74.0, daily: ['temperature_2m_max'], forecastDays: 3 })
    .then((r) => console.log(r.daily?.temperature_2m_max));
</script>
```

`window.Strata.Strata` is the client class; `window.Strata.StrataError` is the
error class.

---

## TypeScript usage

Type aliases for every endpoint's request and response are exported from the
package root:

```ts
import type {
  ForecastRequest,
  ForecastResponse,
  GeocodeResponse,
  GeocodeResult,
  AirQualityVariable,
  StrataErrorCode,
} from '@elio1995/strata';
```

`tsconfig.json` is `strict` with `noUncheckedIndexedAccess` — array indexing
returns `T | undefined` and the response types match. The bundled types live
at `dist/index.d.ts` and are referenced via the `types` field in `package.json`.

---

## Tests

```bash
pnpm test            # one-shot
pnpm test:watch      # watch mode
pnpm test:coverage   # with v8 coverage
```

Four suites, 27 tests:

- **`tests/query.test.ts`** — URL builder invariants (sorted keys, CSV arrays,
  nullish drop).
- **`tests/errors.test.ts`** — error classification (status → code,
  retryable mapping) and `StrataError` semantics.
- **`tests/http-client.test.ts`** — retry semantics across success / 429 /
  4xx / 5xx / network / timeout, request dedup.
- **`tests/client.test.ts`** — end-to-end typed mapping for forecast /
  geocoding / air quality.

Each test passes in a scripted mock fetch (see `tests/helpers.ts`) so the suite
runs entirely offline.

CI runs `lint → typecheck → test → build` on Node 20 and 22 for every push
and PR — see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Scripts

| Command              | Purpose                                                |
| -------------------- | ------------------------------------------------------ |
| `pnpm build`         | Rollup build → `dist/index.{mjs,cjs,d.ts}` + `umd/strata.js` |
| `pnpm dev`           | Rollup in watch mode                                   |
| `pnpm clean`         | Remove `dist/`, `umd/`, `coverage/`                    |
| `pnpm test`          | Vitest one-shot                                        |
| `pnpm test:watch`    | Vitest watch mode                                      |
| `pnpm test:coverage` | Vitest + v8 coverage report                            |
| `pnpm typecheck`     | `tsc --noEmit`                                         |
| `pnpm lint`          | Biome check (lint + format + import order)             |
| `pnpm lint:fix`      | Biome auto-fix                                         |
| `pnpm release:dry`   | semantic-release dry run (no publish)                  |
| `pnpm demo`          | Open the demo page (after `pnpm build`)                |

---

## Project structure

```
src/
├── client.ts                 # top-level Strata class + options
├── errors.ts                 # StrataError + classifyHttpStatus + isRetryable
├── index.ts                  # public entry — re-exports
├── version.ts                # VERSION constant
├── endpoints/
│   ├── index.ts              # endpoint re-exports
│   ├── types.ts              # shared types (Coordinate, units, variable names)
│   ├── forecast.ts           # /v1/forecast
│   ├── geocoding.ts          # /v1/search (geocoding host)
│   ├── air-quality.ts        # /v1/air-quality (air-quality host)
│   ├── marine.ts             # /v1/marine (marine host)
│   └── historical.ts         # /v1/archive (archive host)
└── http/
    ├── index.ts
    ├── client.ts             # HttpClient — retries, timeouts, dedup
    ├── backoff.ts            # computeBackoff + sleep
    ├── query.ts              # serializeQuery + joinUrl
    └── types.ts              # FetchLike, RequestOptions, HttpClientConfig

tests/
├── helpers.ts                # scripted-fetch mock
├── query.test.ts             # URL builder
├── errors.test.ts            # error classification
├── http-client.test.ts       # retry / timeout / dedup
└── client.test.ts            # end-to-end typed mapping

demo/
├── index.html                # single-page weather demo (Tailwind via CDN)
├── app.ts                    # demo logic (compiled to app.js)
├── tsconfig.json             # demo-only TS config
└── README.md                 # how to run the demo

.github/workflows/
├── ci.yml                    # lint -> typecheck -> test -> build
└── release.yml               # semantic-release (dry-run only)

rollup.config.mjs             # ESM + CJS + UMD + dts bundle
tsconfig.json                 # strict + noUncheckedIndexedAccess
tsconfig.build.json           # extends, declaration-only for types
biome.json                    # lint + format
commitlint.config.cjs         # conventional commits
release.config.cjs            # semantic-release (npmPublish: false)
```

---

## Troubleshooting

| Symptom                                                       | Cause                                                        | Fix                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `Strata: no global fetch is available`                        | Running on Node < 18                                          | Upgrade Node, or pass `fetch: nodeFetch` / `fetch: undiciFetch`              |
| Repeated `RATE_LIMIT` from Open-Meteo                         | Hitting the public API without caching                       | Cache responses, batch requests, or sponsor an Open-Meteo dedicated tier     |
| `TIMEOUT` on a slow network                                   | 10s default isn't enough                                      | Pass `timeout: 30_000` to the constructor or per-request                     |
| `BAD_REQUEST` with body containing `Latitude must be in range`| You passed lat/lng in the wrong order                        | Lat first, lng second (matches Open-Meteo's URL params)                      |
| Identical requests still hit the server twice                 | New `Strata` instance per request                            | Construct once and reuse — the dedup map lives on the instance               |
| `instanceof StrataError` is `false`                           | Two bundles with different copies of the class               | Ensure only one copy of `@elio1995/strata` resolves (run `pnpm why`)         |
| Build fails with `outDir must be located inside ...`          | Rollup's TypeScript plugin path constraint                   | Already fixed in `rollup.config.mjs` — pull latest if you hit this           |
| `tsc` emits `.js` files next to your `.ts` sources            | An invocation passed a file path instead of `-p`             | Delete them, use `pnpm typecheck` (which is `tsc --noEmit`)                  |

---

## What's out of scope

These would be the natural next slices, deliberately deferred so this repo
stays focused:

- **Websocket / streaming endpoints.** Open-Meteo doesn't push.
- **Response caching.** Dedup collapses concurrent fetches; it doesn't store
  past results. A TTL cache is a clean follow-on PR.
- **Batch endpoints.** Open-Meteo supports comma-separated lat/lng for batch;
  the single-coord shape covers 95% of use.
- **Custom backoff strategies (Fibonacci, decorrelated jitter).** The current
  default is sensible; the `backoff` option exposes the knobs.
- **Server-Sent Events.** Not supported upstream.

---

## Demo

There's a single-page weather demo under [`demo/`](./demo/). After
`pnpm build`, run any static server (e.g. `npx serve demo`) and open it in
the browser. Type a city, watch the SDK geocode it, fetch a 7-day forecast,
and render the strip. See [`demo/README.md`](./demo/README.md) for details.

---

## License

MIT — see [`LICENSE`](./LICENSE). Weather data is provided by Open-Meteo
under CC-BY-4.0; attribute them if you ship something user-facing.
