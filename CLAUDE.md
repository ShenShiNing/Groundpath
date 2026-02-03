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

### Testing (Server)

```bash
cd packages/server
pnpm test             # Run all tests once
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
```

### Database (Drizzle ORM)

```bash
cd packages/server
pnpm db:generate      # Generate migration files from schema changes
pnpm db:migrate       # Run pending migrations
pnpm db:push          # Push schema directly (dev only)
pnpm db:studio        # Open Drizzle Studio GUI
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
- **TanStack Query** for server state management
- **Zustand** for client state (`src/stores/`)

### Frontend Patterns

- Path alias: `@/*` maps to `./src/*`
- Theme context via `ThemeProvider` with localStorage persistence
- `cn()` utility from `lib/utils.ts` combines clsx + tailwind-merge for class handling
- Components use class-variance-authority (CVA) for variant styling
- Toast notifications via Sonner

### Backend Stack

- **Express 5** with TypeScript
- **tsx** for development hot reload
- **Drizzle ORM** with MySQL
- **Qdrant** for vector storage
- **JWT authentication** with access/refresh token pattern
- **Pino** for structured logging

### Backend Architecture

```
packages/server/src/
├── modules/            # Feature modules (vertical slices)
│   ├── auth/           # Authentication, OAuth, email verification
│   ├── user/           # User profile management
│   ├── document/       # Document CRUD, versions, folders
│   ├── knowledge-base/ # Knowledge base management
│   ├── embedding/      # Embedding providers (OpenAI, Zhipu, Ollama)
│   ├── vector/         # Qdrant vector operations
│   ├── rag/            # Document processing, chunking, search
│   ├── storage/        # File storage (local, R2)
│   └── logs/           # Operation and login logs
├── shared/
│   ├── config/         # Environment and auth config
│   ├── db/             # Database connection and schema
│   ├── errors/         # AppError class and Errors factory
│   ├── middleware/     # Auth, validation, rate limiting
│   ├── logger/         # Pino logger setup
│   └── utils/          # JWT, pagination, request helpers
└── router.ts           # Main route aggregation
```

Each module follows the pattern: `controllers/` → `services/` → `repositories/`

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

- Access tokens: 15 min expiry, contains user info
- Refresh tokens: 7 days, stored in DB with rotation on use
- Multi-device session tracking with device info
- OAuth providers: GitHub, Google

### Shared Package Exports

Import from `@knowledge-agent/shared`:

- `@knowledge-agent/shared/types` - All TypeScript interfaces
- `@knowledge-agent/shared/constants` - HTTP_STATUS, ERROR_CODES, AUTH_ERROR_CODES
- `@knowledge-agent/shared/schemas` - Zod validation schemas
- `@knowledge-agent/shared/utils` - isNullish, safeJsonParse, sleep, parseDeviceInfo

### Path Aliases (Server)

- `@shared/*` → `src/shared/*`
- `@modules/*` → `src/modules/*`
- `@config/*` → `src/shared/config/*`
- `@tests/*` → `tests/*`

## TypeScript Configuration

- Bundler module resolution
- Full strict mode enabled
- `noUncheckedIndexedAccess` and `noImplicitOverride` enabled

## Answer

- When answering the question, please use Chinese.

## Code standards

- Compliant with best practices
- High scalability
- High readability
- High security
- After the code has been modified, check for and remove the obsolete code.
