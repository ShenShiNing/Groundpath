# Knowledge Agent

A monorepo project with React frontend and Express backend, managed with pnpm workspaces.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Express 5, TypeScript
- **Shared**: Common types, constants, and utilities

## Prerequisites

- Node.js >= 18
- pnpm >= 9

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
cp packages/server/.env.example packages/server/.env
```

3. Start development servers:

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

## Project Structure

```
packages/
├── client/   # React frontend
├── server/   # Express backend
└── shared/   # Shared types, constants, utilities
```

## License

MIT
