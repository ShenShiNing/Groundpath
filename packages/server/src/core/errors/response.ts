import type { Request, Response } from 'express';
import type { ApiResponse } from '@groundpath/shared/types';
import type { ZodError } from '@groundpath/shared/schemas';

interface ErrorResponseOptions {
  details?: Record<string, unknown>;
  requestId?: string;
}

function resolveRequestId(res: Response, requestId?: string): string | undefined {
  if (requestId) {
    return requestId;
  }

  return (res.req as (Request & { requestId?: string }) | undefined)?.requestId;
}

export function formatZodErrorDetails(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return details;
}

/**
 * Send a standardized error response
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  options: ErrorResponseOptions = {}
): void {
  const requestId = resolveRequestId(res, options.requestId);
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(options.details && { details: options.details }),
      ...(requestId && { requestId }),
    },
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
