import { describe, expect, it, vi } from 'vitest';
import { StrataError } from '../src/errors';
import { HttpClient } from '../src/http/client';
import { scriptedFetch } from './helpers';

describe('HttpClient — retry semantics', () => {
  it('returns the first successful response after two transient 5xx failures', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 503 },
      { status: 502 },
      { status: 200, json: { ok: true } },
    ]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 3,
        timeout: 1000,
        fetch,
      },
      // Deterministic backoff: 0ms so the test runs instantly.
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    const result = await client.request<{ ok: boolean }>({ path: '/x' });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('classifies 429 as RATE_LIMIT and retries until the budget is spent', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 429 },
      { status: 429 },
      { status: 429 },
      { status: 429 }, // retries=3 means 4 total attempts; this is the final failure
    ]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 3,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      code: 'RATE_LIMIT',
      attempts: 4,
      status: 429,
    });
    expect(calls).toHaveLength(4);
  });

  it('does NOT retry deterministic 4xx errors (BAD_REQUEST is terminal)', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 400, text: '{"reason":"missing latitude"}' },
      // If retry happened, this 200 would mask the bug.
      { status: 200, json: { ok: true } },
    ]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 3,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      attempts: 1,
    });
    expect(calls).toHaveLength(1);
  });

  it('propagates the body text on the error so callers can inspect failures', async () => {
    const { fetch } = scriptedFetch([{ status: 400, text: '{"reason":"bad coords"}' }]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 0,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    try {
      await client.request({ path: '/x' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(StrataError);
      const e = err as StrataError;
      expect(e.code).toBe('BAD_REQUEST');
      expect(e.body).toContain('bad coords');
    }
  });

  it('wraps an AbortError as TIMEOUT when the configured timeout fires', async () => {
    const { fetch } = scriptedFetch([{ delayMs: 50, status: 200, json: {} }]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 0,
        timeout: 10,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('records the number of attempts on the final error', async () => {
    const { fetch } = scriptedFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 2,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      code: 'SERVER',
      attempts: 3,
    });
  });

  it('wraps a thrown fetch error as NETWORK', async () => {
    const { fetch } = scriptedFetch([
      { throw: new TypeError('failed to fetch') },
      { throw: new TypeError('failed to fetch') },
      { throw: new TypeError('failed to fetch') },
    ]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 2,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await expect(client.request({ path: '/x' })).rejects.toMatchObject({
      code: 'NETWORK',
      attempts: 3,
    });
  });
});

describe('HttpClient — request deduplication', () => {
  it('collapses concurrent identical requests to one fetch', async () => {
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ n: 42 }))), 20),
        ),
    );

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 0,
        timeout: 1000,
        fetch: fetchSpy,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    const a = client.request<{ n: number }>({ path: '/x', query: { a: 1, b: 'two' } });
    const b = client.request<{ n: number }>({ path: '/x', query: { b: 'two', a: 1 } });
    const c = client.request<{ n: number }>({ path: '/x', query: { a: 1, b: 'two' } });

    const [ra, rb, rc] = await Promise.all([a, b, c]);
    expect(ra.n).toBe(42);
    expect(rb.n).toBe(42);
    expect(rc.n).toBe(42);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('runs requests with DIFFERENT params separately', async () => {
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify({ n: 1 }))), 5),
        ),
    );

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 0,
        timeout: 1000,
        fetch: fetchSpy,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    await Promise.all([
      client.request({ path: '/x', query: { a: 1 } }),
      client.request({ path: '/x', query: { a: 2 } }),
      client.request({ path: '/y' }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('releases the dedup entry once the request settles', async () => {
    const { fetch } = scriptedFetch([
      { status: 200, json: { n: 1 } },
      { status: 200, json: { n: 2 } },
    ]);

    const client = new HttpClient(
      {
        baseUrl: 'https://api.test',
        retries: 0,
        timeout: 1000,
        fetch,
      },
      { baseMs: 0, capMs: 0, random: () => 0 },
    );

    const first = await client.request<{ n: number }>({ path: '/x' });
    expect(first.n).toBe(1);
    expect(client.inFlightCount).toBe(0);
    const second = await client.request<{ n: number }>({ path: '/x' });
    expect(second.n).toBe(2);
  });
});
