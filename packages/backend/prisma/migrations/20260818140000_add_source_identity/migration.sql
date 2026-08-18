-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domains" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFeed" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFeed_url_key" ON "SourceFeed"("url");

-- CreateIndex
CREATE INDEX "SourceFeed_sourceId_idx" ON "SourceFeed"("sourceId");

-- Seed: the 8 outlets previously hardcoded in config/rssFeeds.ts — replaced by this table so
-- adding/changing a source is a data change, not a deploy. Ids are fixed, readable strings (not
-- cuid()/gen_random_uuid()) since these are one-time authored rows, not a backfill from another
-- table — Prisma treats id as an opaque string everywhere, so the format difference is harmless.
INSERT INTO "Source" ("id", "name", "domains") VALUES
  ('src-idnes', 'iDnes', ARRAY['idnes.cz']),
  ('src-novinky', 'Novinky', ARRAY['novinky.cz']),
  ('src-aktualne', 'Aktuálně', ARRAY['aktualne.cz']),
  ('src-ct24', 'ČT24', ARRAY['ceskatelevize.cz']),
  ('src-seznamzpravy', 'Seznam Zprávy', ARRAY['seznamzpravy.cz']),
  ('src-irozhlas', 'iRozhlas', ARRAY['irozhlas.cz']),
  ('src-hn', 'Hospodářské noviny', ARRAY['hn.cz']),
  ('src-denik', 'Deník', ARRAY['denik.cz']);

INSERT INTO "SourceFeed" ("id", "sourceId", "url") VALUES
  ('feed-idnes', 'src-idnes', 'https://servis.idnes.cz/rss.aspx?c=zpravy'),
  ('feed-novinky', 'src-novinky', 'https://www.novinky.cz/rss'),
  ('feed-aktualne', 'src-aktualne', 'https://aktualne.cz/rss'),
  ('feed-ct24', 'src-ct24', 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy'),
  ('feed-seznamzpravy', 'src-seznamzpravy', 'https://www.seznamzpravy.cz/rss'),
  ('feed-irozhlas', 'src-irozhlas', 'https://www.irozhlas.cz/rss/irozhlas'),
  ('feed-hn', 'src-hn', 'https://archiv.hn.cz/rss'),
  ('feed-denik', 'src-denik', 'https://www.denik.cz/rss');

-- AddForeignKey
ALTER TABLE "SourceFeed" ADD CONSTRAINT "SourceFeed_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Coverage.outlet -> Coverage.sourceId. Safe as a direct NOT NULL add (no backfill
-- dance needed, unlike docs/audit.md's §8.8 plan) because this table has zero rows in every
-- environment this project runs in today.
ALTER TABLE "Coverage" DROP COLUMN "outlet",
ADD COLUMN     "sourceId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PendingAddition" DROP COLUMN "outlet",
ADD COLUMN     "sourceId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Coverage_sourceId_idx" ON "Coverage"("sourceId");

-- CreateIndex: "Each Source contributes at most one Coverage per Analysis" (CONTEXT.md),
-- enforced at the DB level for the first time (fixes P0-6, docs/audit.md). Partial — excluded
-- Coverage doesn't count, matching the existing app-level dedup checks (createAnalysis's
-- existingCoverages.some(...) already only ever sees non-excluded rows) — not expressible in
-- Prisma's schema DSL, so it isn't declared there.
CREATE UNIQUE INDEX "Coverage_analysisId_sourceId_notExcluded_key" ON "Coverage"("analysisId", "sourceId") WHERE "excluded" = false;

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAddition" ADD CONSTRAINT "PendingAddition_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
