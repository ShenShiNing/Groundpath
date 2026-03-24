import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { HTTP_STATUS, ERROR_CODES } from '@groundpath/shared';
import type { ZodType } from '@groundpath/shared/schemas';
import { formatZodErrorDetails, sendErrorResponse } from '@core/errors/response';

/**
 * Middleware factory to validate request body against a Zod schema
 */
export function validateBody<T extends ZodType>(schema: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        {
          details: formatZodErrorDetails(result.error),
        }
      );
      return;
    }
    req.body = result.data;
    res.locals.validated = { ...res.locals.validated, body: result.data };
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
      sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        {
          details: formatZodErrorDetails(result.error),
        }
      );
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
      sendErrorResponse(
        res,
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.VALIDATION_ERROR,
        'Validation failed',
        {
          details: formatZodErrorDetails(result.error),
        }
      );
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

/**
 * Type-safe helper to get validated body from res.locals
 * Use after validateBody middleware
 */
export function getValidatedBody<T>(res: Response): T {
  return res.locals.validated?.body as T;
}
