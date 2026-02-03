import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// Input Sanitization Middleware
// ============================================================================

/**
 * HTML entities to escape for XSS prevention
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML special characters to prevent XSS attacks
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Fields that should NOT be sanitized (passwords, tokens, URLs, API keys, etc.)
 * These fields contain user credentials or data that must be preserved exactly
 */
const SKIP_SANITIZE_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'refreshToken',
  'accessToken',
  'code',
  'verificationCode',
  // API configuration fields
  'apiKey',
  'baseUrl',
  'url',
]);

/**
 * Recursively sanitize an object's string values
 * Skips sensitive fields like passwords and tokens
 */
function sanitizeValue(value: unknown, key?: string): unknown {
  // Skip sanitization for sensitive fields
  if (key && SKIP_SANITIZE_FIELDS.has(key)) {
    return value;
  }

  if (typeof value === 'string') {
    return escapeHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return value;
}

/**
 * Sanitize all string properties in an object
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeValue(value, key);
  }

  return result;
}

/**
 * Input sanitization middleware
 * Escapes HTML special characters in request body to prevent XSS attacks
 *
 * Note: This is a defense-in-depth measure. Output encoding should also
 * be implemented on the frontend when rendering user-generated content.
 */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body as Record<string, unknown>);
  }

  // Sanitize query parameters (mutate in place since req.query is read-only in Express 5)
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = sanitizeObject(req.query as Record<string, unknown>);
    for (const key of Object.keys(req.query)) {
      (req.query as Record<string, unknown>)[key] = sanitizedQuery[key];
    }
  }

  next();
}

/**
 * Create a sanitize middleware with custom skip fields
 */
export function createSanitizeMiddleware(additionalSkipFields: string[] = []) {
  const skipFields = new Set([...SKIP_SANITIZE_FIELDS, ...additionalSkipFields]);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const sanitize = (value: unknown, key?: string): unknown => {
      if (key && skipFields.has(key)) {
        return value;
      }

      if (typeof value === 'string') {
        return escapeHtml(value);
      }

      if (Array.isArray(value)) {
        return value.map((item) => sanitize(item));
      }

      if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          result[k] = sanitize(v, k);
        }
        return result;
      }

      return value;
    };

    if (req.body && typeof req.body === 'object') {
      req.body = sanitize(req.body) as typeof req.body;
    }

    if (req.query && typeof req.query === 'object') {
      const sanitizedQuery = sanitize(req.query) as Record<string, unknown>;
      for (const key of Object.keys(req.query)) {
        (req.query as Record<string, unknown>)[key] = sanitizedQuery[key];
      }
    }

    next();
  };
}
