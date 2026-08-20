-- AlterTable
ALTER TABLE "StoryEntity" ADD COLUMN     "salience" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Fuzzy entity-name search (ticket 12). No prior migration enables any Postgres extension —
-- this is the first. Prisma's schema DSL can't express an operator-class GIN index, so this is
-- raw SQL only, same convention as Coverage's partial unique index and
-- StoryEntityRelation's CHECK constraint.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "entity_canonicalName_trgm_idx" ON "Entity" USING gin ("canonicalName" gin_trgm_ops);
