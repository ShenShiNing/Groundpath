# Knowledge Agent

A RAG (Retrieval-Augmented Generation) application for building and querying knowledge bases. Upload documents, automatically extract and embed text, then perform semantic search across your knowledge.

## Tech Stack

### Frontend

- React 19, Vite, TypeScript
- Tailwind CSS, shadcn/ui
- TanStack Router & Query
- Zustand for state management

### Backend

- Express 5, TypeScript
- Drizzle ORM with MySQL
- Qdrant for vector storage
- JWT authentication with OAuth (GitHub, Google)

### Shared

- Common types, constants, Zod schemas, and utilities

## Prerequisites

- Node.js >= 18
- pnpm >= 9
- MySQL 8.0+
- Qdrant (local or cloud)

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
cp packages/server/.env.example packages/server/.env
# Edit .env with your database, Qdrant, and API keys
```

3. Initialize database:

```bash
cd packages/server
pnpm db:push
```

4. Start development servers:

```bash
pnpm dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Scripts

| Command           | Description                            |
| ----------------- | -------------------------------------- |
| `pnpm dev`        | Run both client and server in parallel |
| `pnpm dev:client` | Run only Vite dev server               |
| `pnpm dev:server` | Run only Express server                |
| `pnpm build`      | Build all packages                     |
| `pnpm lint`       | Run ESLint                             |
| `pnpm format`     | Format code with Prettier              |

### Server-specific

| Command            | Description         |
| ------------------ | ------------------- |
| `pnpm test`        | Run tests           |
| `pnpm db:generate` | Generate migrations |
| `pnpm db:migrate`  | Run migrations      |
| `pnpm db:push`     | Push schema (dev)   |
| `pnpm db:studio`   | Open Drizzle Studio |

## Project Structure

```
packages/
├── client/         # React frontend
├── server/         # Express backend
│   └── src/
│       ├── modules/    # Feature modules (auth, document, rag, etc.)
│       └── shared/     # Config, DB, errors, middleware, utils
└── shared/         # Shared types, constants, schemas
```

## Features

- **Knowledge Bases** — Create isolated knowledge bases with configurable embedding providers
- **Document Management** — Upload PDF, DOCX, Markdown, and text files with version history
- **Folder Organization** — Organize documents in hierarchical folders
- **Text Extraction** — Automatic text extraction from uploaded documents
- **Vector Embeddings** — Support for OpenAI, Zhipu, and Ollama embedding providers
- **Semantic Search** — Query documents using natural language
- **Authentication** — JWT-based auth with OAuth (GitHub, Google) and email verification
- **Multi-device Sessions** — Track and manage login sessions across devices

## License

MIT
