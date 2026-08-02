# Contributing to Notez

Thanks for your interest in contributing to Notez! This guide covers the basics for getting started.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- MinIO (or any S3-compatible storage)
- Git

## Development Setup

```bash
# Clone the repository
git clone https://github.com/cogghaus/notez.git
cd notez

# Backend
cd backend
npm install
cp .env.example .env   # Edit with your database credentials
npx prisma migrate dev
npm run dev

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

Or use Docker Compose for services:

```bash
docker compose -f compose.local.yml up --build
```

## Branch Naming Convention

- `feature/<description>` -- new features
- `fix/<description>` -- bug fixes
- `refactor/<description>` -- code refactoring

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure tests pass: `cd backend && npx vitest run`
4. Ensure TypeScript compiles: `cd frontend && npx tsc --noEmit`
5. Open a PR with a clear title and description
6. PRs require review before merging to `main`

## Code Standards

- **TypeScript** for all new code (backend and frontend)
- **Bug fixes must include tests** -- write a failing test first, then fix the bug
- Keep functions small and focused
- Handle errors gracefully -- no unhandled promise rejections

## Project Structure

```
notez/
  backend/        # Fastify + TypeScript + Prisma
  frontend/       # React + Vite + TipTap + Tailwind
  notez-mcp/      # MCP server package (npm-publishable)
  docs/           # Documentation
  .github/        # CI/CD workflows
```

## Questions?

Open an issue for questions, feature requests, or bug reports.
