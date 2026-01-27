# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Agent is a monorepo with a React frontend and Express backend, managed with pnpm workspaces.

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
- `packages/shared` - Shared types, constants, and utilities for client and server

### Frontend Stack

- **React 19** with TypeScript (strict mode)
- **Vite** as build tool with dev proxy (`/api` → `http://localhost:3000`)
- **Tailwind CSS** with OKLch color variables for theming
- **shadcn/ui** component library (New York style, Lucide icons)
- **TanStack Router** for file-based routing (`src/routes/`)
- **TanStack Query** for server state management
- **Zustand** for client state (`src/stores/`)
- **Axios** for API requests

### Frontend Patterns

- Path alias: `@/*` maps to `./src/*`
- Theme context via `ThemeProvider` with localStorage persistence
- `cn()` utility from `lib/utils.ts` combines clsx + tailwind-merge for class handling
- Components use class-variance-authority (CVA) for variant styling
- Toast notifications via Sonner

### Backend Stack

- **Express 5** with TypeScript
- **tsx** for development hot reload
- **Drizzle ORM** with MySQL (schema at `src/db/schema/`)
- **JWT authentication** with access/refresh token pattern
- Environment config via dotenv (`packages/server/.env`)

### Backend Architecture

```
packages/server/src/
├── controller/     # Request handlers
├── services/       # Business logic
├── repositories/   # Database operations
├── middleware/     # Auth middleware (authenticate, optionalAuthenticate)
├── routes/         # Route definitions
├── db/schema/      # Drizzle table definitions
├── types/          # TypeScript interfaces
└── utils/          # Helpers (errors.ts, jwtUtils.ts)
```

### Authentication Flow

- Access tokens: 15 min expiry, contains user info
- Refresh tokens: 7 days, stored in DB with rotation on use
- Multi-device session tracking with device info
- Custom `AuthError` class with error codes

### Shared Package Exports

Import from `@knowledge-agent/shared`:

- `@knowledge-agent/shared/types` - Auth types (TokenPair, AuthResponse, LoginRequest)
- `@knowledge-agent/shared/constants` - HTTP_STATUS, ERROR_CODES, AUTH_ERROR_CODES
- `@knowledge-agent/shared/utils` - isNullish, safeJsonParse, sleep

## TypeScript Configuration

- Bundler module resolution
- Full strict mode enabled
- `noUncheckedIndexedAccess` and `noImplicitOverride` enabled
- Unused locals/parameters warnings disabled at root level, enabled in client
