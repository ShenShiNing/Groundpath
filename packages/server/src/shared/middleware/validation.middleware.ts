import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { HTTP_STATUS, ERROR_CODES } from '@knowledge-agent/shared';
import type { ApiResponse } from '@knowledge-agent/shared';
import type { ZodError, ZodType } from '@knowledge-agent/shared/schemas';

/**
 * Format Zod validation errors into a structured object
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!details[path]) details[path] = [];
    details[path].push(issue.message);
  }
  return details;
}

/**
 * Middleware factory to validate request body against a Zod schema
 */
export function validateBody<T extends ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Validation failed',
          details: formatZodErrors(result.error),
        },
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory to validate request query against a Zod schema
 */
export function validateQuery<T extends ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Validation failed',
          details: formatZodErrors(result.error),
        },
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }
    res.locals.validated = { ...res.locals.validated, query: result.data };
    next();
  };
}

/**
 * Middleware factory to validate request params against a Zod schema
 */
export function validateParams<T extends ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Normalize params: Express 5 can have string | string[], flatten to string
    const normalized = Object.fromEntries(
      Object.entries(req.params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
    );

    const result = schema.safeParse(normalized);
    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Validation failed',
          details: formatZodErrors(result.error),
        },
      };
      res.status(HTTP_STATUS.BAD_REQUEST).json(response);
      return;
    }
    res.locals.validated = { ...res.locals.validated, params: result.data };
    next();
  };
}

/**
 * Type-safe helper to get validated query from res.locals
 * Use after validateQuery middleware
 */
export function getValidatedQuery<T>(res: Response): T {
  return res.locals.validated?.query as T;
}

/**
 * Type-safe helper to get validated params from res.locals
 * Use after validateParams middleware
 */
export function getValidatedParams<T>(res: Response): T {
  return res.locals.validated?.params as T;
}
