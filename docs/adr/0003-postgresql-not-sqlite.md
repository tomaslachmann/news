# ADR 0003 — PostgreSQL instead of SQLite for Analysis history

## Status
Accepted

## Context
The tool stores completed Analyses in a local database. SQLite is the natural default for a single-user local tool, but the deployment target is Docker Compose.

## Decision
Use PostgreSQL running as a separate Docker Compose service, not SQLite.

## Consequences
SQLite file locking is unreliable when accessed from multiple Docker containers simultaneously (the Fastify API container and any future background workers). PostgreSQL runs as a proper service inside the Compose network, which eliminates this class of problem.

The trade-off is a heavier local footprint (a running Postgres container) versus the zero-infrastructure simplicity of SQLite. For a Dockerised deployment this is acceptable — Postgres is already in the Compose file and the user never interacts with it directly.
