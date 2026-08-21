-- Prisma's migration diff generated a spurious `DROP INDEX "entity_canonicalName_trgm_idx"` here
-- (removed) -- same non-issue as every other migration since ticket 12 (see schema.prisma's own
-- comment on Entity, and the 20260820190448 migration's identical note).

-- CreateTable
CREATE TABLE "NarrativeImage" (
    "id" TEXT NOT NULL,
    "synthesisResultId" TEXT NOT NULL,
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

    CONSTRAINT "NarrativeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NarrativeImage_synthesisResultId_key" ON "NarrativeImage"("synthesisResultId");

-- AddForeignKey
ALTER TABLE "NarrativeImage" ADD CONSTRAINT "NarrativeImage_synthesisResultId_fkey" FOREIGN KEY ("synthesisResultId") REFERENCES "SynthesisResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
