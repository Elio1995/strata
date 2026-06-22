# Architecture

This document covers the *why* — the design decisions that shape Strata. The
public surface and how-to live in [`README.md`](./README.md).

## Layering

```
+---------------------------------------------------+
|  Strata (top-level client)                        |
|  - holds the HttpClient, exposes namespaces       |
|  - constructed once per process / browser tab     |
+--------------------+------------------------------+
                     |
                     v
+---------------------------------------------------+
|  Namespaced endpoint classes                      |
|  forecast / geocoding / airQuality / marine /     |
|  historical                                       |
|  - map a typed request to a query-string call     |
|  - know which host to hit                         |
|  - no retry / timeout / dedup logic here          |
+--------------------+------------------------------+
                     |
                     v
+---------------------------------------------------+
|  HttpClient (transport)                           |
|  - serializeQuery -> stable URL                   |
|  - in-flight dedup (URL -> Promise)               |
|  - exponential backoff with jitter                |
|  - per-request AbortController for timeouts       |
|  - error classification (status -> StrataError)   |
+--------------------+------------------------------+
                     |
                     v
+---------------------------------------------------+
|  Pluggable fetch (default: globalThis.fetch)      |
+---------------------------------------------------+
```

Each layer knows nothing about the layers above it. The transport never imports
from the endpoint files; endpoints never import from `client.ts`. Tests target
each layer in isolation (`tests/query.test.ts`, `tests/http-client.test.ts`,
`tests/client.test.ts`).

## Why `fetch` (not axios / got / ky)

- **Universal runtime.** `fetch` is in Node 18+, every browser, Bun, Deno, and
  Cloudflare Workers. Axios still drags a Node-specific stack on the server.
- **Streaming-ready.** `Response.body` is a `ReadableStream` — if Strata ever
  wants to expose progress events for the historical endpoint (which returns
  multi-MB payloads), the transport is ready.
- **No dependency.** The published bundle has zero runtime dependencies. Tree
  shakers leave the SDK at roughly 4 KB gzipped.
- **Mock-friendly.** A `FetchLike` interface is one function — tests pass in a
  scripted mock and assert on URLs without intercepting the global.

The `fetch` we capture is bound to `globalThis` at construction time, not
re-resolved per call. That stays stable even if user code monkey-patches the
global later.

## Why exponential backoff with full jitter

Naive constant retries (`setTimeout(retry, 500)`) work in development and fall
over the moment several SDK instances retry in lockstep — a thundering herd
hits the upstream within the same millisecond and re-creates the spike.

Strata uses the classic AWS pattern: delay = `min(cap, base * 2^attempt)` then
multiplied by a uniform random factor in `[0.5, 1)`. The randomisation
spreads the herd across the window. The cap (default 10s) prevents a long
backoff from blowing past the caller's timeout budget.

The default schedule is **200ms → 400ms → 800ms** before jitter — fast enough
to recover from transient network blips without being aggressive against rate
limits.

## Retryable vs. terminal errors

| Code         | Source                          | Retryable | Reasoning                                  |
| ------------ | ------------------------------- | --------- | ------------------------------------------ |
| `NETWORK`    | thrown fetch / TCP error        | yes       | DNS / connection blips are transient       |
| `TIMEOUT`    | AbortController fired           | yes       | Upstream might just be slow                |
| `RATE_LIMIT` | HTTP 429                        | yes       | Backoff is exactly the right response      |
| `SERVER`     | HTTP 5xx                        | yes       | Open-Meteo's upstream sometimes flakes     |
| `BAD_REQUEST`| HTTP 4xx (other than 429)       | **no**    | Deterministic; retrying burns the quota    |
| `PARSE`      | response was non-JSON           | **no**    | Server returned HTML or an empty body      |
| `UNKNOWN`    | escape hatch                    | **no**    | Don't loop on something we can't classify  |

The whole point of the enum is to let callers `switch` on the code and decide
what to surface to the user without parsing error strings.

## Why request deduplication

In a typical web app, several components mount at once and each one calls
`useWeather()`. If three of them call `client.forecast.get(parisCoords)` in the
same tick, the SDK collapses them to a single fetch — the same Promise is
returned to all three callers, and the result is shared.

The dedup key is the **fully-built URL** (with query keys sorted, see
`serializeQuery`). That makes the dedup invariant the canonicalisation of
the request: two callers asking for the same data in different parameter orders
still get one fetch.

The window is exactly "while the fetch is in flight" — we delete the entry in
the `.finally` handler. This is intentionally narrower than a TTL cache:
deduplication is a correctness optimisation, not a freshness one. If you need
caching, layer it on top.

The dedup map lives on the `HttpClient` instance. That's why the README warns
against constructing a new `Strata` per request on the server — you'd defeat
the dedup benefit on every page render.

## Why three build outputs (ESM + CJS + UMD)

- **ESM** (`dist/index.mjs`) is the modern default. Bundlers tree-shake it.
- **CJS** (`dist/index.cjs`) keeps the package useful for legacy Node
  consumers, Jest projects that haven't migrated to native ESM, etc. The
  `exports` field maps `require()` to this file.
- **UMD** (`umd/strata.js`) lets the demo page load the SDK from a CDN with a
  single `<script>` tag, no bundler. It's also what `unpkg.com` and
  `cdn.jsdelivr.net` serve by default — which is where casual users land first.

The single bundled `dist/index.d.ts` is produced by `rollup-plugin-dts` so
editor tooling pulls one file regardless of the import path. Tree-shakers honour
`sideEffects: false` in `package.json` and drop endpoints you don't import.

## Why discriminated-union errors (and a real `Error` subclass)

Two patterns are common in TypeScript SDKs:

1. Return `Result<T, E>` so the type system forces error handling.
2. Throw a typed `Error` subclass.

Strata picks **(2)** because:

- `await` ergonomics — callers don't have to unwrap a result on the happy path.
- Errors propagate naturally across `async` boundaries.
- The Promise rejection handler in popular frameworks (React, TanStack Query)
  takes an `Error`, not a generic value.

The `StrataError` class is a single class with a `code` discriminator instead
of a class hierarchy. Hierarchies bloat the bundle, break across realms, and
encourage `instanceof` checks that fail when the class identity isn't shared.
A `switch (err.code)` block is exhaustively-checked by TypeScript and works
across bundles.

`Error.cause` is set when we wrap a fetch error, so the original stack
survives. `Object.setPrototypeOf` is called in the constructor to preserve
`instanceof` across ES5 down-compilation targets.

## Why no runtime schema validation

Strata is a **thin** SDK. It trusts Open-Meteo's contract — what the docs say
is what comes back. Adding Zod schemas would:

- Bloat the bundle from ~4 KB to ~20+ KB.
- Force a runtime dependency choice on consumers (Zod vs. Valibot vs. ArkType).
- Catch problems that Open-Meteo would already surface as a 4xx or 5xx.

If you want validation, the response types are exported and you can parse them
with whatever validator you prefer. The README's "Advanced topics" section has
a Zod recipe.

## Multi-host endpoints

Open-Meteo splits its endpoints across subdomains:

- `api.open-meteo.com` — forecast
- `geocoding-api.open-meteo.com` — place search
- `air-quality-api.open-meteo.com` — pollution
- `marine-api.open-meteo.com` — ocean
- `archive-api.open-meteo.com` — historical

We derive the right host from the configured `baseUrl` at construction time
(see `deriveGeocodingHost` etc.). When you pass `baseUrl: 'https://api.open-meteo.com'`
(the default), each endpoint substitutes the right subdomain. If you self-host
or point at a mirror, you can override per-endpoint by passing the absolute
host on a request — that escape hatch lives on `client.http.request({ baseUrl, path })`.

All hosts share **one `HttpClient`** — so retries, dedup, timeouts, and
backoff behave identically across endpoints. The host swap happens at URL
build time, not transport time.

## Tests

Vitest because the SDK is pure TypeScript with no DOM-specific concerns. We
intentionally don't pull in Jest — its ESM story is still rough.

The mock pattern (in `tests/helpers.ts`) is a scripted fetch: pass an array
of `{status, json}` and successive calls return successive scripted responses.
Once the script is exhausted, any extra fetch throws — which surfaces tests
that accidentally make more requests than the script expected. That's the same
shape any team could lift into their own SDK.

## What's intentionally out of scope

These would be natural next slices, deliberately deferred so this repo stays
focused:

- **Websocket / streaming endpoints.** Open-Meteo's forecast API is plain
  request/response. A streaming wrapper would need to mock the transport
  differently.
- **Response caching.** Dedup collapses concurrent requests; it doesn't store
  results between calls. A TTL cache would mean keying on the canonical URL
  and storing the parsed body — a different concern, easy to layer on top.
- **Batch endpoints.** Open-Meteo supports passing multiple coordinates in one
  request via comma-separated lat/lng. We surface the single-coord shape
  because it's what 95% of consumers need; batch is a clean follow-on PR.
- **Server-Side Events / live updates.** Open-Meteo doesn't push.
- **Custom retry strategies (per-error backoff curves).** The current strategy
  is a sensible default. If you need exponential backoff with a Fibonacci
  schedule or a different jitter profile, pass `backoff` at construction.
