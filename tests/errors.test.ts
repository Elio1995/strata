import { describe, expect, it } from 'vitest';
import { StrataError, classifyHttpStatus, isRetryable } from '../src/errors';

describe('classifyHttpStatus', () => {
  it('maps 429 to RATE_LIMIT explicitly (not generic 4xx)', () => {
    expect(classifyHttpStatus(429)).toBe('RATE_LIMIT');
  });

  it('maps other 4xx codes to BAD_REQUEST', () => {
    expect(classifyHttpStatus(400)).toBe('BAD_REQUEST');
    expect(classifyHttpStatus(404)).toBe('BAD_REQUEST');
    expect(classifyHttpStatus(422)).toBe('BAD_REQUEST');
  });

  it('maps 5xx codes to SERVER', () => {
    expect(classifyHttpStatus(500)).toBe('SERVER');
    expect(classifyHttpStatus(502)).toBe('SERVER');
    expect(classifyHttpStatus(503)).toBe('SERVER');
    expect(classifyHttpStatus(504)).toBe('SERVER');
  });

  it('falls back to UNKNOWN for unexpected statuses (1xx / 2xx / 3xx)', () => {
    expect(classifyHttpStatus(100)).toBe('UNKNOWN');
    expect(classifyHttpStatus(204)).toBe('UNKNOWN');
    expect(classifyHttpStatus(301)).toBe('UNKNOWN');
  });
});

describe('isRetryable', () => {
  it('retries transient error codes', () => {
    expect(isRetryable('NETWORK')).toBe(true);
    expect(isRetryable('TIMEOUT')).toBe(true);
    expect(isRetryable('RATE_LIMIT')).toBe(true);
    expect(isRetryable('SERVER')).toBe(true);
  });

  it('does not retry deterministic client errors', () => {
    expect(isRetryable('BAD_REQUEST')).toBe(false);
    expect(isRetryable('PARSE')).toBe(false);
    expect(isRetryable('UNKNOWN')).toBe(false);
  });
});

describe('StrataError', () => {
  it('preserves instanceof checks across the prototype chain', () => {
    const err = new StrataError({ code: 'NETWORK', message: 'oops' });
    expect(err).toBeInstanceOf(StrataError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StrataError');
    expect(err.code).toBe('NETWORK');
    expect(err.message).toBe('oops');
  });

  it('carries the cause through when wrapping an underlying error', () => {
    const cause = new TypeError('boom');
    const err = new StrataError({ code: 'NETWORK', message: 'wrapped', cause });
    expect(err.cause).toBe(cause);
  });
});
