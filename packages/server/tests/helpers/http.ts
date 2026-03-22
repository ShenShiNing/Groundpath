/**
 * Test-specific HTTP response body type for HTTP integration tests.
 *
 * Unlike the production `ApiResponse` discriminated union, this type keeps all
 * fields non-optional so test assertions can access `.error.code` or `.data.*`
 * without narrowing — a failed access will throw at runtime, which is the
 * desired behaviour in a test.
 */
export interface HttpTestBody<TData = Record<string, unknown>> {
  success: boolean;
  data: TData;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
  /** Allow mock-specific fields like `route` without explicit declaration. */
  [key: string]: unknown;
}
