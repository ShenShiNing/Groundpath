import type { Response } from 'express';
import type { ApiResponse } from '@knowledge-agent/shared/types';
import { localizeApiError } from '@core/i18n/error-translator';

/**
 * Send a standardized error response
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void {
  const error = localizeApiError({ code, message }, res);
  const response: ApiResponse = {
    success: false,
    error,
  };
  res.status(statusCode).json(response);
}

/**
 * Send a standardized success response
 */
export function sendSuccessResponse<T>(res: Response, data: T, statusCode: number = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
}
