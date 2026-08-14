-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchorHeadline" TEXT NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN "storyId" TEXT;

-- Backfill: one Story per existing Analysis, anchored to its current seedHeadline.
-- Row-by-row because we need a fresh Story id to pair with each Analysis id. IDs here are
-- Postgres-generated UUIDs, not Prisma's cuid() (no cuid generator exists in plain SQL) — every
-- Story created afterward via createAnalysis/createDraftAnalysis gets a cuid id as normal. Ids
-- are opaque strings everywhere they're used, so the two formats coexisting is harmless; this is
-- a one-time backfill of pre-existing rows, not an ongoing generation path.
DO $$
DECLARE
  rec RECORD;
  new_story_id TEXT;
BEGIN
  FOR rec IN SELECT "id", "seedHeadline" FROM "Analysis" LOOP
    new_story_id := gen_random_uuid()::text;
    INSERT INTO "Story" ("id", "anchorHeadline") VALUES (new_story_id, rec."seedHeadline");
    UPDATE "Analysis" SET "storyId" = new_story_id WHERE "id" = rec."id";
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "Analysis" ALTER COLUMN "storyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_storyId_key" ON "Analysis"("storyId");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
