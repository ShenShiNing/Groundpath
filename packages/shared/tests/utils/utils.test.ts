import { describe, expect, it } from 'vitest';
import { isNullish, safeJsonParse, sleep } from '../../src/utils/index';

describe('isNullish', () => {
  it('should return true for null', () => {
    expect(isNullish(null)).toBe(true);
  });

  it('should return true for undefined', () => {
    expect(isNullish(undefined)).toBe(true);
  });

  it('should return false for falsy non-nullish values', () => {
    expect(isNullish(0)).toBe(false);
    expect(isNullish('')).toBe(false);
    expect(isNullish(false)).toBe(false);
  });

  it('should return false for truthy values', () => {
    expect(isNullish('hello')).toBe(false);
    expect(isNullish(42)).toBe(false);
    expect(isNullish({})).toBe(false);
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('should return fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', { default: true })).toEqual({
      default: true,
    });
  });

  it('should return fallback for empty string', () => {
    expect(safeJsonParse('', null)).toBeNull();
  });
});

describe('sleep', () => {
  it('should resolve after the specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});
