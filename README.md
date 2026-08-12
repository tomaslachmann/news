# News Triangulator

A tool for understanding what actually happened in a news story. Instead of reading one article and trusting its framing, News Triangulator gathers coverage of the same event across multiple independent sources and surfaces four things: what all sources agree on, where they factually contradict each other, what one source reports that the others leave out entirely, and where the difference is not in the facts at all but in the framing — word choice, emphasis, what gets the headline and what gets buried. Every claim stays traceable back to the source that made it.

---

## Documentation

- **[CONTEXT.md](./CONTEXT.md)** — domain vocabulary and glossary
- **[docs/spec.md](./docs/spec.md)** — full feature specification
- **[docs/spec-scaffold.md](./docs/spec-scaffold.md)** — scaffold specification
- **[docs/adr/](./docs/adr/)** — architecture decision records

---

## Prerequisites

- [mise](https://mise.jdx.dev/) — tool version manager (pins Node.js 22)
- [Docker](https://www.docker.com/) and Docker Compose
- Node.js 22 (installed automatically via mise)

---

## Dev Setup

```bash
# 1. Activate the correct Node.js version
mise install

# 2. Install all workspace dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in real values (at minimum DATABASE_URL and OPENAI_API_KEY)

# 4. Start Postgres
npm run db

# 5. Run database migrations
cd packages/backend && npx prisma migrate dev && cd ../..

# 6. Start both servers (Fastify on :3001, Vite on :5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

The backend health check is at [http://localhost:3001/api/health](http://localhost:3001/api/health).

---

## Docker Compose

To run all three services (PostgreSQL, Fastify backend, nginx + Vite frontend):

```bash
docker compose up
```

Services:
- **db** — PostgreSQL 16 on port 5432
- **backend** — Fastify API on port 3001 (runs `prisma migrate deploy` on startup)
- **frontend** — nginx serving the Vite build on port 80; proxies `/api/*` to the backend

To stop and remove containers (data volume persists):

```bash
docker compose down
```

To also remove the data volume:

```bash
docker compose down -v
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (Prisma format) |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for extraction and synthesis passes |
| `EXTRACTION_MODEL` | No | `gpt-4o` | Model used for the per-article extraction pass |
| `SYNTHESIS_MODEL` | No | `gpt-4o` | Model used for the cross-source synthesis pass |
| `JWT_SECRET` | Yes | — | Secret for signing JWT tokens (used by auth, ticket 10) |
| `ADMIN_EMAIL` | Yes | — | Email address of the initial admin account |
| `ADMIN_PASSWORD` | Yes | — | Password of the initial admin account |
| `POSTGRES_USER` | No | `news` | Postgres username (Docker Compose only) |
| `POSTGRES_PASSWORD` | No | `news` | Postgres password (Docker Compose only) |
| `POSTGRES_DB` | No | `news` | Postgres database name (Docker Compose only) |

Copy `.env.example` to `.env` and fill in real values. The `.env` file is git-ignored.

---

## Implementation Tickets

All implementation tickets live in [`.scratch/news-triangulator/issues/`](./.scratch/news-triangulator/issues/). Each ticket is a Markdown file with acceptance criteria checkboxes. When an implementing agent completes a ticket it checks off each criterion and sets the status to `done`.
