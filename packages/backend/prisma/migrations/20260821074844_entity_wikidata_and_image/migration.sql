-- Prisma's migration diff generated a spurious `DROP INDEX "entity_canonicalName_trgm_idx"` here
-- (removed) -- same non-issue as every other migration since ticket 12 (see schema.prisma's own
-- comment on Entity, and the 20260820190448 migration's identical note).

-- CreateEnum
CREATE TYPE "EntityImageProvider" AS ENUM ('WIKIMEDIA');

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "wikidataId" TEXT;

-- CreateTable
CREATE TABLE "EntityImage" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "provider" "EntityImageProvider" NOT NULL,
    "externalId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "author" TEXT,
    "license" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntityImage_entityId_idx" ON "EntityImage"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityImage_provider_externalId_key" ON "EntityImage"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "EntityImage" ADD CONSTRAINT "EntityImage_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
