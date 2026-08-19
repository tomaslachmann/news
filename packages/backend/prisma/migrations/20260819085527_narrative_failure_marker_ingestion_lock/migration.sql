-- AlterTable
ALTER TABLE "SynthesisResult" ADD COLUMN     "narrativeGenerationFailedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IngestionRunLock" (
    "id" TEXT NOT NULL,
    "runningSince" TIMESTAMP(3),
    "runId" TEXT,

    CONSTRAINT "IngestionRunLock_pkey" PRIMARY KEY ("id")
);

-- Seed the single lease row this lock is claimed against — a fixed, one-time-authored row
-- (P2-22, docs/audit.md), same convention as the Source seed data in the source-identity
-- migration. tryClaimIngestionLock's conditional UPDATE has nothing to match against without it.
INSERT INTO "IngestionRunLock" ("id") VALUES ('ingestion');
