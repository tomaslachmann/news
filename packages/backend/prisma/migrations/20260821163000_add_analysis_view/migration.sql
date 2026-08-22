-- Prisma's migration diff generated a spurious `DROP INDEX "entity_canonicalName_trgm_idx"` here
-- (removed) -- same non-issue as every other migration since ticket 12 (see schema.prisma's own
-- comment on Entity).

-- CreateTable
CREATE TABLE "AnalysisView" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisView_createdAt_analysisId_idx" ON "AnalysisView"("createdAt", "analysisId");

-- AddForeignKey
ALTER TABLE "AnalysisView" ADD CONSTRAINT "AnalysisView_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
