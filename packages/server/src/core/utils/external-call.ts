import { Errors } from '@core/errors';
import { createLogger } from '@core/logger';

const logger = createLogger('external-call');

const NETWORK_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);

type ErrorLike = {
  cause?: unknown;
  code?: string;
  details?: Record<string, unknown>;
  message?: string;
  name?: string;
  response?: { status?: unknown };
  status?: unknown;
  statusCode?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

export interface ExternalCallPolicy {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface ExecuteExternalCallInput<T> {
  service: string;
  operation: string;
  policy: ExternalCallPolicy;
  signal?: AbortSignal;
  execute: (signal: AbortSignal) => Promise<T>;
  isRetryable?: (error: unknown) => boolean;
}

export async function executeExternalCall<T>(input: ExecuteExternalCallInput<T>): Promise<T> {
  const totalAttempts = input.policy.maxRetries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    throwIfAborted(input.signal);

    const timeoutController = new AbortController();
    const timeoutError = Errors.timeout(
      `External call "${input.service}.${input.operation}" timed out after ${input.policy.timeoutMs}ms`,
      { service: input.service, operation: input.operation, timeoutMs: input.policy.timeoutMs }
    );
    let timeoutHandle: NodeJS.Timeout | undefined;
    const combinedSignal = input.signal
      ? AbortSignal.any([input.signal, timeoutController.signal])
      : timeoutController.signal;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        timeoutController.abort('external-call-timeout');
        reject(timeoutError);
      }, input.policy.timeoutMs);
    });

    try {
      return await Promise.race([input.execute(combinedSignal), timeoutPromise]);
    } catch (error) {
      const timedOut =
        (!input.signal?.aborted && timeoutController.signal.aborted) ||
        (!input.signal?.aborted && isAbortError(error));
      const normalizedError = timedOut ? timeoutError : error;

      lastError = normalizedError;

      if (input.signal?.aborted) {
        throw createAbortError(input.signal.reason);
      }

      const shouldRetry = input.isRetryable
        ? input.isRetryable(normalizedError)
        : isRetryableExternalError(normalizedError);

      if (!shouldRetry || attempt >= totalAttempts) {
        throw normalizedError;
      }

      const delayMs = resolveRetryDelayMs(normalizedError, attempt, input.policy);
      logger.warn(
        {
          service: input.service,
          operation: input.operation,
          attempt,
          maxRetries: input.policy.maxRetries,
          delayMs,
          statusCode: extractStatusCode(normalizedError),
        },
        'External call failed with retryable error, retrying'
      );
      await wait(delayMs, input.signal);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  throw lastError;
}

export function isRetryableExternalError(error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }

  const statusCode = extractStatusCode(error);
  if (statusCode !== undefined) {
    return statusCode === 408 || statusCode === 429 || statusCode >= 500;
  }

  return isNetworkError(error);
}

function extractStatusCode(error: unknown, depth = 0): number | undefined {
  if (!error || typeof error !== 'object' || depth > 3) {
    return undefined;
  }

  const candidate = error as ErrorLike;

  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.response?.status === 'number') return candidate.response.status;
  if (typeof candidate.$metadata?.httpStatusCode === 'number') {
    return candidate.$metadata.httpStatusCode;
  }

  return extractStatusCode(candidate.cause, depth + 1);
}

function extractRetryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const details = (error as ErrorLike).details;
  if (!details) {
    return undefined;
  }

  const retryAfterMs = details.retryAfterMs;
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return retryAfterMs;
  }

  const retryAfterSeconds = details.retryAfter;
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return undefined;
}

function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as ErrorLike;
  if (candidate.code && NETWORK_ERROR_CODES.has(candidate.code)) {
    return true;
  }

  const message = candidate.message?.toLowerCase() ?? '';
  return (
    message.includes('network error') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('connection reset') ||
    message.includes('connection refused') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound')
  );
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  return (
    Boolean(error) &&
    typeof error === 'object' &&
    ((error as ErrorLike).name === 'AbortError' || (error as ErrorLike).code === 'REQUEST_ABORTED')
  );
}

function resolveRetryDelayMs(error: unknown, attempt: number, policy: ExternalCallPolicy): number {
  const retryAfterMs = extractRetryAfterMs(error);
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, policy.maxDelayMs);
  }

  const exponentialDelay = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  const jitterFactor = 0.5 + Math.random() * 0.5;
  return Math.max(1, Math.round(exponentialDelay * jitterFactor));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError(signal.reason));
      return;
    }

    const timeoutHandle = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutHandle);
      cleanup();
      reject(createAbortError(signal?.reason));
    };

    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal.reason);
  }
}

function createAbortError(reason?: unknown): DOMException {
  if (reason instanceof DOMException && reason.name === 'AbortError') {
    return reason;
  }

  if (reason instanceof Error && reason.name === 'AbortError') {
    return new DOMException(reason.message, 'AbortError');
  }

  return new DOMException('Aborted', 'AbortError');
}
