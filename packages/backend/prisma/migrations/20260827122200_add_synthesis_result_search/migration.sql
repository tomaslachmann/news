-- AlterTable: nullable, no backfill (ADR 0021) -- an existing row stays null until its Analysis
-- is reprocessed.
ALTER TABLE "SynthesisResult" ADD COLUMN     "searchText" TEXT;

-- Full-text search column + index (ticket 83). tsvector/to_tsvector/GIN are Postgres core, no
-- extension needed (unlike pg_trgm's own migration for entity search). GENERATED ALWAYS AS ...
-- STORED can't be expressed in Prisma's schema DSL, so it isn't modeled in schema.prisma -- same
-- "not modeled" precedent as the pg_trgm GIN index. Config 'simple' (lowercase + tokenize, no
-- stemming): Postgres ships no Czech text-search config.
ALTER TABLE "SynthesisResult" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("searchText", ''))) STORED;

CREATE INDEX "synthesisresult_searchvector_idx" ON "SynthesisResult" USING gin ("searchVector");
