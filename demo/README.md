# Strata demo

A single-page demo that exercises the published UMD bundle.

## Run

From the repo root:

```bash
# 1. Build the SDK so the UMD bundle exists.
pnpm build

# 2. Compile the demo's TypeScript shim to plain JS.
npx tsc -p demo/tsconfig.json

# 3. Serve the demo folder over any static server. Examples:
npx serve demo
# or
python3 -m http.server -d demo 8080
```

Open <http://localhost:3000> (or :8080) and type a city. Behind the scenes:

1. `strata.geocoding.search({ name })` hits `geocoding-api.open-meteo.com/v1/search`.
2. `strata.forecast.get({ latitude, longitude, ... })` hits `api.open-meteo.com/v1/forecast`.

Both calls go through the same retry / dedup / timeout machinery as any other SDK consumer.

## What it shows

- The SDK works in a real browser via the `<script>` UMD path (no bundler).
- Both endpoints are typed end-to-end.
- Errors come back as `StrataError` with a switchable `code`.
- The result panel includes the raw geocode + forecast metadata so you can see the wire shape.
