import { describe, expect, it } from 'vitest';
import { ApiRequestError, extractResponseError, unwrapResponse } from '../../../src/lib/http/error';

describe('http error helpers', () => {
  it('should unwrap successful responses', () => {
    expect(
      unwrapResponse({
        success: true,
        data: { id: 'doc-1', title: 'Alpha' },
      })
    ).toEqual({ id: 'doc-1', title: 'Alpha' });
  });

  it('should throw ApiRequestError for failed responses', () => {
    expect(() =>
      unwrapResponse({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: { field: 'name' },
        },
      })
    ).toThrowError(ApiRequestError);

    try {
      unwrapResponse({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: { field: 'name' },
        },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        details: { field: 'name' },
      });
    }
  });

  it('should extract structured response errors and fall back to http status', async () => {
    const structured = await extractResponseError({
      status: 422,
      json: async () => ({
        error: {
          code: 'INVALID_INPUT',
          message: 'Bad request',
        },
      }),
    } as unknown as Response);

    const fallback = await extractResponseError({
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    expect(structured).toEqual({
      code: 'INVALID_INPUT',
      message: 'Bad request',
    });
    expect(fallback).toEqual({
      code: 'REQUEST_FAILED',
      message: 'HTTP 503',
    });
  });
});
