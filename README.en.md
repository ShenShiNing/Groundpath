# Groundpath

English version of README. Chinese version: [README.md](./README.md)

Last updated: March 22, 2026

> Brand is now `溯知 / Groundpath`. Repository name is `groundpath` and workspace scope is `@groundpath/*`.

Trace the source. Reach the answer.

Groundpath is a RAG (Retrieval-Augmented Generation) application for personal and team knowledge management. It provides an end-to-end workflow from document ingestion, chunking and embedding, semantic retrieval, and multi-turn chat with citations, plus Document AI features (summary, analysis, generation).

This repository is a `pnpm` monorepo:

- `packages/client`: React + Vite frontend
- `packages/server`: Express + TypeScript backend
- `packages/shared`: shared types, constants, Zod contracts, and utilities

## 1. Feature Details

### 1.1 Account and Security

- Email/password registration and login, token refresh, logout, logout-all
- Email verification codes (send/verify), code-based registration, password reset
- OAuth login (GitHub, Google)
- Session management: view active sessions and revoke specific devices
- Security mechanisms:
  - Access Token + Refresh Token
  - Refresh Token Rotation
  - CSRF protection (double-submit token)
  - Redis-based rate limiting (login/register/refresh/email endpoints)
  - Helmet security headers, input sanitization, unified error code responses

### 1.2 Knowledge Bases and Document Management

- Knowledge base CRUD with isolated retrieval scope
- Knowledge-base-level embedding config (`provider/model/dimensions`), stable after creation
- Document capabilities:
  - Upload: `pdf / docx / md / txt`
  - Metadata edits (title/description/folder)
  - Content editing (Markdown/TXT)
  - Download and preview
  - Version history, upload new version, restore to historical version
  - Trash, restore, permanent delete
- Folder tree management within a knowledge base

### 1.3 RAG Retrieval and Chat

- Async document processing pipeline: chunking -> embedding -> Qdrant write
- Structured document index (Document Index): extracts outlines, node content, and references for Structured RAG
- Retrieval filters by `userId / knowledgeBaseId / documentIds / scoreThreshold`
- **Agentic RAG**: automatically enters agent mode when LLM supports tool calling
  - LLM autonomously decides when and how many times to invoke tools
  - Legacy tool: knowledge base search (`kb_search`)
  - Structured RAG rollout tools: `outline_search`, `node_read`, `ref_follow`, `vector_fallback_search`
  - Web search tool: `web_search` (powered by Tavily)
  - Real-time tool step display with expandable results
  - Graceful fallback to legacy streaming RAG for models without tool calling support
- Multi-turn conversation:
  - Conversation create/list/search/rename/delete
  - SSE streaming responses with abort support
  - Citation sources returned to client with document jump
  - Ask within selected document scope
  - Message retry

### 1.4 Document AI

- Document summary: sync + SSE streaming
- Hierarchical summary for long documents (auto chunk then merge)
- Document analysis: keywords, entities, topics, structure
- Content generation by prompt/template/style
- Expansion of existing content with `before/after/replace`
- Optional VLM-based image descriptions for extracted PDF images to improve structured retrieval context

### 1.5 Model and Storage Extensibility

- LLM providers: `openai / anthropic / zhipu / deepseek / ollama / custom`
- Embedding providers: `zhipu / openai / ollama`
- Web search: Tavily API (provides web search capability for agent mode)
- Storage backends: `local` or `Cloudflare R2`
- Signed file URLs supported (can be disabled in development for debugging)

### 1.6 Internationalization

- Frontend built on i18next + react-i18next with browser language detection and multi-language support
- Namespaced translations (organized by module)

### 1.7 Logging and Operations

- Login logs, operation logs, system logs
- OpenAPI / Swagger docs: `/api-docs`
- Scheduled tasks (UTC):
  - Log cleanup
  - Refresh token cleanup
  - Soft-deleted vector cleanup
  - Optional counter synchronization
  - Optional structured RAG alert checks
  - Optional document-index backfill
  - Recovery for stuck document-processing jobs
  - Immutable document build artifact cleanup
- Graceful shutdown for HTTP, MySQL, and Redis connections

## 2. Deployment Guide (Detailed)

This repository now includes Docker orchestration and GitHub Actions. The default path is `docker compose`, while the manual/service-based deployment flow remains available below.

### 2.1 Docker Compose Quick Start

Shortest path:

```bash
pnpm docker:up
```

Default URLs after startup:

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3000`
- Swagger: `http://localhost:8080/api-docs`
- Health checks: `http://localhost:8080/health/live`, `http://localhost:8080/health/ready`

Compose starts these services by default:

- `client`: Nginx serving the frontend and proxying `/api`, `/api-docs`, and `/health*`
- `server`: Express API server
- `mysql`, `redis`, `qdrant`: backend dependencies

To override default ports, passwords, or runtime secrets, set shell env vars before startup:

```bash
# Linux/macOS
JWT_SECRET=replace-with-32-char-secret ENCRYPTION_KEY=replace-with-32-char-secret pnpm docker:up

# Windows PowerShell
$env:JWT_SECRET='replace-with-32-char-secret'
$env:ENCRYPTION_KEY='replace-with-32-char-secret'
pnpm docker:up
```

To stop and clean up:

```bash
pnpm docker:down
pnpm docker:down:volumes
```

### 2.2 Prerequisites

Required:

- Node.js >= 18
- pnpm >= 9
- MySQL 8+
- Redis 6+
- Qdrant (local or cloud)

Optional:

- Ollama (for local models)
- SMTP service (email verification/password reset)
- Cloudflare R2 (production file storage)

### 2.3 Install Dependencies

```bash
pnpm install
```

### 2.4 Configure Environment Variables

The backend loads env files from `packages/server` in this order:

- `.env.{NODE_ENV}.local`
- `.env.{NODE_ENV}`
- `.env`

Create env file:

```bash
# Linux/macOS
cp packages/server/.env.example packages/server/.env

# Windows PowerShell
Copy-Item packages/server/.env.example packages/server/.env
```

Minimum required settings:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET` (at least 32 chars)
- `ENCRYPTION_KEY` (at least 32 chars)
- `EMAIL_VERIFICATION_SECRET`

Common important settings:

- `FRONTEND_URL` (CORS and signed URL base)
- `QDRANT_URL`
- `STORAGE_TYPE=local|r2`
- `EMBEDDING_PROVIDER=zhipu|openai|ollama`
- `ZHIPU_API_KEY` / `OPENAI_API_KEY` (required by selected provider)
- `TAVILY_API_KEY` (required for agent web search feature)
- `STRUCTURED_RAG_ENABLED` / `STRUCTURED_RAG_ROLLOUT_MODE` (enable structured RAG routing and gradual rollout)
- `IMAGE_DESCRIPTION_ENABLED`, `VLM_PROVIDER`, `VLM_MODEL`, `VLM_API_KEY` (required when image descriptions are enabled)
- `DOCUMENT_PROCESSING_RECOVERY_*`, `DOCUMENT_BUILD_CLEANUP_*`, `BACKFILL_SCHEDULE_*` (recovery, build cleanup, and index backfill schedules)

### 2.5 Initialize Database

For development (quick schema sync):

```bash
pnpm -F @groundpath/server db:push
```

For production (recommended):

```bash
pnpm -F @groundpath/server db:migrate
```

Before pushing or releasing, run the structure checks:

```bash
pnpm -F @groundpath/server db:drift-check
pnpm -F @groundpath/server db:verify
```

### 2.6 Start Development Environment

```bash
pnpm dev
```

Default ports:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`

Note: in development, Vite already proxies `/api` to `http://localhost:3000`.

### 2.7 Build and Start in Production

1. Build all packages:

```bash
pnpm build
```

2. Start backend service:

```bash
pnpm -F @groundpath/server start
```

3. Serve frontend static assets:

- Build output: `packages/client/dist`
- Host this directory with Nginx/Caddy/static hosting service

### 2.8 Reverse Proxy Recommendation (Nginx)

The frontend uses relative `/api` paths. Same-domain deployment is recommended.

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/groundpath/client-dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE requires proxy buffering disabled
    proxy_buffering off;
  }

  location /api-docs {
    proxy_pass http://127.0.0.1:3000;
  }

  location /api-docs/ {
    proxy_pass http://127.0.0.1:3000;
  }

  location /health {
    proxy_pass http://127.0.0.1:3000;
  }

  location /health/ {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

If deployed behind reverse proxy, set `TRUST_PROXY` (for example `1` or `true`) so rate limiting and audit IPs are correct.

### 2.9 Post-Deployment Checklist

- `GET /health/live` returns `200`
- `GET /health/ready` returns `200` after dependencies are ready
- `GET /api/hello` still returns success for legacy probes
- `GET /api-docs` opens Swagger UI successfully
- You can create a knowledge base after login
- Uploaded documents eventually reach `processingStatus=completed`
- Chat page receives SSE streaming responses
- Agent mode displays tool steps correctly
- Trash restore/permanent-delete flows work correctly
- Scheduled cleanup tasks produce normal logs

## 3. How It Works

### 3.1 Core Component Responsibilities

- MySQL (Drizzle):
  - Structured data for users, sessions, knowledge bases, documents, versions, chunks, chat, and logs
- Redis:
  - Rate-limit counters and cache/session helper capabilities
- Qdrant:
  - Vector storage and similarity search for document chunks
- Storage (Local/R2):
  - Raw files and versioned files
- LLM/Embedding providers:
  - Text generation, summary/analysis, embeddings
- Tavily API:
  - Web search capability for agent mode

### 3.2 Core Flow A: Document Ingestion to Searchable State

1. User uploads a document (`/api/documents` or `/api/knowledge-bases/:id/documents`).
2. Backend validates type, writes file storage, and persists `document + document_version` in a transaction.
3. Document status is set to `pending`, and async RAG processing is triggered.
4. RAG service loads current-version text, then performs chunking, embedding, and optional structured Document Index builds (outline/nodes/reference edges).
5. It uses an "insert new vectors first, then delete old vectors" strategy to reduce retrieval gaps during updates.
6. Chunk and knowledge-base counters are updated, and status is finalized as `completed`.

### 3.3 Core Flow B: Retrieval-Augmented Chat (SSE)

1. Client sends message to `/api/chat/conversations/:id/messages`.
2. Server selects mode based on LLM capabilities:
   - **Agent mode** (LLM supports tool calling): LLM autonomously orchestrates legacy retrieval, structured node retrieval, or web search as needed
   - **Legacy mode** (fallback): hardcoded RAG retrieval first, then streaming LLM call
3. SSE event stream:
   - `tool_start`: tool call initiated (agent mode)
   - `tool_end`: tool call completed with results and duration (agent mode)
   - `sources`: citation sources
   - `chunk`: incremental text
   - `done`: completion event
   - `error`: error event
4. Assistant message is persisted with citations and agentTrace metadata.

### 3.4 Core Flow C: Document AI

- Summary: direct for short text, hierarchical for long text (chunk summary -> merged summary)
- Analysis: keywords/entities/topics via LLM, structure via local computation
- Generation/expansion: can include retrieved context from knowledge base

### 3.5 Consistency and Fault Tolerance

- Critical document operations use MySQL transactions
- Compensating delete is performed if storage upload succeeded but transaction failed
- Vector physical-delete failures degrade to soft-delete, then cleanup by scheduled tasks
- Processing uses "in-memory lock + database state" to avoid duplicate concurrent processing

## 4. Common Commands

| Command                                              | Description                                   |
| ---------------------------------------------------- | --------------------------------------------- |
| `pnpm dev`                                           | Start frontend and backend in parallel        |
| `pnpm dev:client`                                    | Start frontend only                           |
| `pnpm dev:server`                                    | Start backend only                            |
| `pnpm docker:up`                                     | Start the full stack with Docker Compose      |
| `pnpm docker:down`                                   | Stop the Docker Compose stack                 |
| `pnpm docker:down:volumes`                           | Stop the stack and remove Docker volumes      |
| `pnpm build`                                         | Build all packages                            |
| `pnpm lint`                                          | Run ESLint                                    |
| `pnpm lint:fix`                                      | Auto-fix ESLint issues                        |
| `pnpm format`                                        | Format code with Prettier                     |
| `pnpm test`                                          | Run tests                                     |
| `pnpm test:coverage`                                 | Run tests with coverage                       |
| `pnpm test:server`                                   | Run backend tests only                        |
| `pnpm test:shared`                                   | Run shared-package tests only                 |
| `pnpm -F @groundpath/server db:push`                 | Sync schema in development                    |
| `pnpm -F @groundpath/server db:drift-check`          | Check schema/migration drift                  |
| `pnpm -F @groundpath/server db:check`                | Run database consistency checks               |
| `pnpm -F @groundpath/server db:migrate`              | Run database migrations                       |
| `pnpm -F @groundpath/server db:verify`               | Run drift check and DB consistency validation |
| `pnpm -F @groundpath/server db:studio`               | Open Drizzle Studio GUI                       |
| `pnpm -F @groundpath/server db:sync-counters`        | Manually sync knowledge base counters         |
| `pnpm -F @groundpath/server document-index:backfill` | Manually enqueue document-index backfill      |
| `pnpm -F @groundpath/client preview`                 | Preview the built frontend locally            |
| `pnpm architecture:check`                            | Validate backend dependency architecture      |

## 4.1 Architecture Gate

- Pull requests and branch pushes automatically run `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm architecture:check`, and Docker image build verification.
- Pushes to `main` and manual dispatch publish versioned `server` / `client` images to GitHub Container Registry (GHCR).
- When adding backend cross-module reuse, prefer the owning module's `public/*` exports instead of new deep imports.

## 5. Open Source License

This project is released under the **MIT License**.

- You may use, modify, and distribute it as long as copyright and license notices are retained.
- The project is provided "as is" without warranty of fitness for a particular purpose.

For production use, evaluate and own the risks related to configuration, data security, and third-party services.
