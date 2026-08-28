-- Ticket 90 — external descriptive context for the entity wiki page. All nullable, no backfill
-- (ADR 0021); populated only for entities an Admin has linked to Wikidata.
ALTER TABLE "Entity" ADD COLUMN "wikidataDescription" TEXT;
ALTER TABLE "Entity" ADD COLUMN "wikipediaExtract" TEXT;
ALTER TABLE "Entity" ADD COLUMN "wikipediaUrl" TEXT;
