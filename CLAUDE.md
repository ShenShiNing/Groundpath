# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Agent is a RAG (Retrieval-Augmented Generation) application with a React frontend and Express backend, managed with pnpm workspaces. It supports document upload, text extraction, vector embedding, and semantic search across knowledge bases.

## Commands

### Development

```bash
pnpm dev              # Run both client and server in parallel
pnpm dev:client       # Run only Vite dev server (http://localhost:5173)
pnpm dev:server       # Run only Express server (PORT from packages/server/.env, default 3000)
```

### Building

```bash
pnpm build            # Build both packages
```

### Linting & Formatting

```bash
pnpm lint             # Run ESLint on all packages
pnpm lint:fix         # Auto-fix ESLint issues
pnpm format           # Format code with Prettier
pnpm format:check     # Check formatting without writing
```

### Testing

```bash
# Root level (runs all tests via vitest)
pnpm test             # Run all tests once
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
pnpm test:ui          # Open Vitest UI

# Run a single test file
pnpm test path/to/file.test.ts

# Package-specific tests
pnpm test:server      # Run only server tests
pnpm test:shared      # Run only shared tests
```

### Database (Drizzle ORM)

```bash
cd packages/server
pnpm db:generate      # Generate migration files from schema changes
pnpm db:migrate       # Run pending migrations
pnpm db:push          # Push schema directly (dev only)
pnpm db:studio        # Open Drizzle Studio GUI
pnpm db:sync-counters # Sync document/folder counters from actual DB state
```

### Package-specific commands

```bash
pnpm -F @knowledge-agent/client <command>   # Run command in client package
pnpm -F @knowledge-agent/server <command>   # Run command in server package
pnpm -F @knowledge-agent/shared <command>   # Run command in shared package
```

## Architecture

### Monorepo Structure

- `packages/client` - React 19 frontend with Vite, Tailwind CSS, and shadcn components
- `packages/server` - Express 5 backend with TypeScript
- `packages/shared` - Shared types, constants, schemas, and utilities

### Frontend Stack

- **React 19** with TypeScript (strict mode)
- **Vite** as build tool with dev proxy (`/api` → `http://localhost:3000`)
- **Tailwind CSS** with OKLch color variables for theming
- **shadcn/ui** component library (New York style, Lucide icons)
- **TanStack Router** for file-based routing (`src/routes/`)
- **TanStack Query** for server state management with hierarchical key factory (`src/lib/query/keys.ts`)
- **Zustand** for client state (`src/stores/`)
- **i18next** + react-i18next for internationalization (namespaced translations, browser language detection)
- **next-themes** for dark/light mode theming with localStorage persistence

### Frontend Patterns

- Path alias: `@/*` maps to `./src/*`
- `cn()` utility from `lib/utils.ts` combines clsx + tailwind-merge for class handling
- Components use class-variance-authority (CVA) for variant styling
- Toast notifications via Sonner

#### HTTP & Streaming Layer (`src/lib/http/`)

- `api-client.ts` — Axios instance with auto Bearer token injection, 401 refresh retry, CSRF header
- `stream-client.ts` — Fetch-based SSE streaming with token refresh and abort signal support
- `sse.ts` — `parseSSEStream()` for ReadableStream decoding, `createSSEDispatcher()` for type-safe event routing
- `auth.ts` — Single source of truth for access/refresh tokens via `tokenAccessors` pattern (avoids Zustand ↔ API circular deps)

#### Zustand Stores (`src/stores/`)

- `authStore` — Auth state with persist middleware (localStorage stores only user + isAuthenticated)
- `userStore` — Profile and session management
- `chatPanelStore` — Chat UI state, SSE message streaming, agent tool step tracking, citation handling
- `aiSettingsStore` — LLM provider settings UI state

#### React Query Key Factory (`src/lib/query/keys.ts`)

Hierarchical keys for cache invalidation: `documents.list()`, `documents.detail(id)`, `knowledgeBases.documents(kbId)`, `chat.searchConversations(params)`, `llm.models(provider, hasKey, baseUrl)`, etc.

### Backend Stack

- **Express 5** with TypeScript
- **tsx** for development hot reload
- **Drizzle ORM** with MySQL
- **Redis** (ioredis) for rate limiting, caching, and session support
- **Qdrant** for vector storage
- **JWT authentication** with access/refresh token pattern
- **Pino** for structured logging (auto-redacts tokens/keys/PII)

### Backend Architecture

```
packages/server/src/
├── modules/            # Feature modules (vertical slices)
│   ├── agent/          # Agent executor with tool system (kb-search, web-search tools)
│   ├── auth/           # Authentication, OAuth, email verification
│   ├── user/           # User profile management
│   ├── document/       # Document CRUD, versions, folders
│   ├── document-ai/    # AI-powered summary, analysis, generation, expansion (SSE streaming)
│   ├── knowledge-base/ # Knowledge base management
│   ├── embedding/      # Embedding providers (OpenAI, Zhipu, Ollama)
│   ├── vector/         # Qdrant vector operations
│   ├── rag/            # Document processing, chunking, search
│   ├── llm/            # LLM providers (OpenAI, Anthropic, DeepSeek, Zhipu, Ollama, Custom)
│   ├── chat/           # Chat sessions, message history, prompt assembly
│   ├── storage/        # File storage (local, R2) with signed URL support
│   └── logs/           # Operation, login, and system logs
├── shared/
│   ├── cache/          # Redis-backed cache service (with namespace isolation and TTL)
│   ├── config/         # Environment config (modular exports: serverConfig, authConfig, agentConfig, etc.)
│   ├── db/             # Database connection, schema definitions
│   ├── email/          # Email templates (verification)
│   ├── errors/         # AppError class and Errors factory
│   ├── logger/         # Pino logger (operation, request, system loggers)
│   ├── middleware/      # Auth, validation, rate limiting, CSRF, sanitize, security
│   ├── redis/          # Redis client singleton (buildRedisKey with prefix)
│   ├── scheduler/      # Cron/scheduled tasks (log cleanup, token cleanup, vector cleanup)
│   ├── server/         # Graceful shutdown
│   └── utils/          # JWT, pagination, cookies, file signing, request helpers
└── router.ts           # Main route aggregation
```

Each module follows the pattern: `controllers/` → `services/` → `repositories/`

### API Routes

```
/api/hello          — Health check
/api/auth           — Login, register, logout, refresh, password
/api/auth/email     — Email verification
/api/auth/oauth     — GitHub/Google OAuth
/api/user           — Profile management
/api/documents      — Document CRUD
/api/knowledge-bases — KB management
/api/rag            — Document processing & semantic search
/api/llm            — LLM provider config & model listing
/api/chat           — Conversations & SSE message streaming
/api/document-ai    — AI summary, analysis, generation
/api/logs           — Audit & operation logs
/api/files/*        — Signed file access
```

### Error Handling

Use `AppError` class with `Errors` factory for consistent error responses:

```typescript
import { Errors } from '@shared/errors';

// General errors
throw Errors.notFound('Document');
throw Errors.validation('Invalid input', { field: 'email' });

// Auth errors with typed codes
throw Errors.auth(AUTH_ERROR_CODES.TOKEN_EXPIRED, 'Token has expired');
```

### Authentication Flow

- Access tokens: 15 min expiry, contains user info + session ID
- Refresh tokens: 7 days, stored in DB with rotation on use, hashed before storage
- Token revocation: tokens issued before `tokenValidAfter` timestamp are rejected
- Multi-device session tracking with device info
- OAuth providers: GitHub, Google
- CSRF: origin/referer validation + double-submit token (`X-CSRF-Token` header must match cookie)
- Rate limiting: Redis-backed with Lua script, pre-built limiters for login/register/refresh/email

### Agent System (`modules/agent/`)

- `AgentExecutor` orchestrates multi-step tool-augmented chat
- Tools implement `ToolInterface` (`name`, `description`, `execute`)
- Built-in tools: `KBSearchTool` (knowledge base retrieval), `WebSearchTool` (Tavily API)
- Config: `agentConfig.maxIterations` (default 5, max 20), `toolTimeout` (15s)
- Frontend displays agent steps via `ToolStepCard` with real-time status (running/completed/error)

### Server Config Pattern (`shared/config/env.ts`)

Config is exported as modular objects — import specific configs, not the entire env:

```typescript
import { serverConfig, authConfig, embeddingConfig, agentConfig } from '@config/env';
```

Key config groups: `serverConfig`, `databaseConfig`, `redisConfig`, `authConfig`, `emailConfig`, `oauthConfig`, `storageConfig`, `documentConfig`, `embeddingConfig`, `vectorConfig`, `llmConfig`, `agentConfig`, `loggingConfig`, `featureFlags`

### Cache Service (`shared/cache/`)

- Redis-backed with namespace isolation and configurable TTL
- Two instances: `cacheService` (5 min TTL), `shortCache` (30s TTL)
- Predefined keys: `cacheKeys.user(id)`, `cacheKeys.knowledgeBase(id)`, `cacheKeys.document(id)`, etc.
- Invalidation: `invalidatePatterns.*` for bulk cache clearing

### Shared Package Exports

Import from `@knowledge-agent/shared`:

- `@knowledge-agent/shared/types` — All TypeScript interfaces (`ApiResponse<T>` discriminated union with `isSuccessResponse`/`isErrorResponse` type guards, `PaginatedResponse<T>`, domain DTOs)
- `@knowledge-agent/shared/constants` — `HTTP_STATUS`, `ERROR_CODES`, `AUTH_ERROR_CODES`, `EMAIL_ERROR_CODES`, `DOCUMENT_ERROR_CODES`, `KNOWLEDGE_BASE_ERROR_CODES`, `LLM_ERROR_CODES`, `CHAT_ERROR_CODES`, `DOCUMENT_AI_ERROR_CODES`, `AGENT_ERROR_CODES`
- `@knowledge-agent/shared/schemas` — Zod validation schemas for all domains (also re-exports `z` and `ZodError`)
- `@knowledge-agent/shared/utils` — `isNullish`, `safeJsonParse`, `sleep`, `parseDeviceInfo`

### Middleware (`shared/middleware/`)

- `authenticate` / `optionalAuthenticate` / `authenticateRefreshToken` — JWT auth with session & ban check
- `validateBody(schema)` / `validateQuery(schema)` / `validateParams(schema)` — Zod validation, returns typed result via `getValidatedQuery`/`getValidatedParams`
- `createRateLimiter(options)` — Redis Lua-script based; pre-built: `loginLimiter`, `registerLimiter`, `refreshLimiter`, `generalLimiter`, `emailLimiter`
- `requireCsrfProtection` — Double-submit token + origin validation
- `sanitizeMiddleware` — XSS input sanitization
- `requestIdMiddleware` — Injects `req.requestId` for request tracing

### Path Aliases (Server)

- `@shared/*` → `src/shared/*`
- `@modules/*` → `src/modules/*`
- `@config/*` → `src/shared/config/*`
- `@tests/*` → `tests/*`

## TypeScript Configuration

- Bundler module resolution with `verbatimModuleSyntax`
- Full strict mode enabled
- `noUncheckedIndexedAccess` and `noImplicitOverride` enabled

## Code Style

- Prettier: single quotes, 100 char width, 2-space indent, trailing commas (ES5), LF line endings
- ESLint: flat config (v9+), `@typescript-eslint/no-explicit-any: warn`, unused vars allow `_` prefix
- Husky + lint-staged: pre-commit runs ESLint + Prettier on staged files

## Answer

- When answering the question, please use Chinese.

## Code Quality & Architecture Guardrails (for Claude Code)

0. Git Workflow
   - Each feature must be developed on its own dedicated branch. Do not mix multiple features on the same branch.
   - After completing each staged/phase feature change, automatically create a Git commit and push to the remote repository.
   - Commit messages must strictly follow Git best practices (prefer Conventional Commits with a clear body when needed).
   - Commit messages must not include any tool-attribution text such as "generated by Claude Code/Codex".

1. Imports
   - Controllers/services/repositories must be imported via the module barrel (`@modules/foo`); avoid deep imports across layers.
   - Shared types/constants come from `@knowledge-agent/shared/*`; do not redefine magic strings or enums.

2. Domain Consistency
   - Multi-step flows (upload/delete/restore/versioning, etc.) must be orchestrated in a single service/use-case to avoid scattered side effects. When touching counts/vectors/storage, keep operations paired (delete → decrement; restore/rebuild → increment).
   - Counter/stat updates must be idempotent with floor protection (no negative totals).

3. Errors & Logging
   - Use only `AppError/Errors` for returning errors. For external calls, log whether the failure is retryable/non-retryable.
   - Logs should include `requestId/traceId` (when available), key entity IDs (userId/documentId/kbId), and the operation name.

4. Async & Timeouts
   - External calls (Qdrant, LLM/Embedding, storage) must have timeouts and error handling—no bare awaits.
   - Long/ retryable work should have a queue or background job entrypoint; avoid blocking the request path.

5. Security & Validation
   - All inputs must pass Zod/middleware validation before business logic; never trust raw `req.body/query/params`.
   - Minimize data exposure in responses; avoid leaking sensitive fields.

6. Testability
   - New public functions/flows should allow dependency injection or mocking; avoid hard-coded new client instances.
   - When changing core flows, add or update unit/integration tests accordingly.

7. Transactions & Concurrency
   - For consistency-sensitive flows (upload/delete/restore/versioning, counter updates), prefer DB transactions or per-entity mutexes to avoid race conditions.
   - Queue/background jobs must be idempotent: reprocessing should not double-count or duplicate vectors.

8. Timeouts & Retry Policy
   - External calls must define `timeout`, `maxRetries`, and `backoff`, configurable via `config/*`; avoid hardcoded values inside business logic.
   - Classify errors as retryable/non-retryable to prevent runaway retries.

9. Config & Defaults
   - All tunables (batch size, cron, concurrency, timeouts) live in config with documented defaults; reflect new env vars in both `.env.example` and Zod schema.

10. Observability

- Core flows log start/success/failure with latency and key IDs; prefer structured logs.
- Add metrics/traces (Prometheus/OpenTelemetry) for new critical paths; use `service.operation` naming.

11. Contracts

- Controllers accept only validated DTOs; services assume validated inputs.
- Responses use existing success/error wrappers for consistent shape.

12. Frontend state/rendering

- Provide Zustand selectors to avoid full-store subscriptions; wrap APIs with React Query (loading/error states included).
- Components must have typed props and stable keys for list rendering.

13. Tests

- Changes touching counters/vectors/storage need at least one integration test covering delta updates, idempotency, and failure rollback.
- Keep at least one real (non-mocked) contract/integration test for critical external dependencies.

14. Code organization

- Avoid giant files/functions (>~400 lines). Split or add a clear outline. Prefer small composable functions.
- Export by domain/use-case, keep helpers internal when possible.

15. Security & Privacy

- Never log tokens/keys/PII; mask when necessary. Expose only minimum required fields to clients.

16. Performance safeguards

- Set upper bounds and pagination for batch operations; limit concurrency (e.g., p-limit) around external calls.
- For large files/text, prefer streaming or chunked processing to avoid high memory usage.
