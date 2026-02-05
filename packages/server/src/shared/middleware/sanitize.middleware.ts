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
};

/**
 * Escape HTML special characters to prevent XSS attacks
 * Note: Does NOT escape '/' as it's commonly used in URLs and paths
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

/**
 * Fields that SHOULD be sanitized (displayed directly in UI, potential XSS vectors)
 * Only these fields will have HTML characters escaped.
 *
 * Strategy: Whitelist approach - only sanitize fields that are:
 * 1. Displayed directly in the UI (titles, names, etc.)
 * 2. Not expected to contain HTML/Markdown/code
 * 3. User-controlled and potentially injectable
 *
 * Content fields (textContent, message, description, etc.) are intentionally
 * NOT sanitized because:
 * 1. They may contain legitimate Markdown, code, or special characters
 * 2. Double-encoding would corrupt the data (& → &amp; → &amp;amp;)
 * 3. XSS prevention should happen at OUTPUT (React escapes by default)
 */
const SANITIZE_FIELDS = new Set([
  // User profile fields (displayed in UI)
  'username',
  'displayName',
  'bio',
  // Titles and names (displayed prominently)
  'title',
  'name',
  'folderName',
  // Search queries (reflected in UI)
  'search',
  'q',
]);

/**
 * Recursively sanitize an object's string values
 * Only sanitizes fields in the SANITIZE_FIELDS whitelist
 */
function sanitizeValue(value: unknown, key?: string): unknown {
  // Only sanitize fields in the whitelist
  if (typeof value === 'string') {
    if (key && SANITIZE_FIELDS.has(key)) {
      return escapeHtml(value);
    }
    return value; // Don't sanitize by default
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
 * Sanitize whitelisted string properties in an object
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
 *
 * Uses a WHITELIST approach: only sanitizes specific high-risk fields
 * that are displayed directly in the UI (titles, usernames, etc.)
 *
 * Content fields (textContent, message, description, etc.) are NOT sanitized
 * to prevent double-encoding and data corruption.
 *
 * XSS prevention strategy:
 * - Input: Minimal sanitization (only UI-displayed fields)
 * - Output: React escapes text by default, use dangerouslySetInnerHTML carefully
 * - Storage: Store original data, encode on output
 */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize request body (whitelist fields only)
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body as Record<string, unknown>);
  }

  // Sanitize query parameters (whitelist fields only)
  if (req.query && typeof req.query === 'object') {
    const sanitizedQuery = sanitizeObject(req.query as Record<string, unknown>);
    for (const key of Object.keys(req.query)) {
      (req.query as Record<string, unknown>)[key] = sanitizedQuery[key];
    }
  }

  next();
}

/**
 * Create a sanitize middleware with additional fields to sanitize
 */
export function createSanitizeMiddleware(additionalSanitizeFields: string[] = []) {
  const fieldsToSanitize = new Set([...SANITIZE_FIELDS, ...additionalSanitizeFields]);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const sanitize = (value: unknown, key?: string): unknown => {
      if (typeof value === 'string') {
        if (key && fieldsToSanitize.has(key)) {
          return escapeHtml(value);
        }
        return value;
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
