// Vitest setup placeholder for client tests.
// Keep this file even if there are no tests yet, so setupFiles path remains valid.
// React 19 + manual createRoot tests require this flag for act(...) support.
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export {};
