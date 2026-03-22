import type { Response } from 'express';
import type { ApiResponse } from '@groundpath/shared/types';

/**
 * Send a standardized error response
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
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
