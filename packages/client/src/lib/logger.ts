export type ClientLogMetadata = Record<string, unknown>;

export function logClientError(scope: string, error: unknown, metadata?: ClientLogMetadata): void {
  if (metadata) {
    console.error(`[${scope}]`, error, metadata);
    return;
  }

  console.error(`[${scope}]`, error);
}

export function logClientWarning(
  scope: string,
  message: string,
  metadata?: ClientLogMetadata
): void {
  if (metadata) {
    console.warn(`[${scope}] ${message}`, metadata);
    return;
  }

  console.warn(`[${scope}] ${message}`);
}
