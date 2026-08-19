-- CreateEnum
CREATE TYPE "MatchDecidedBy" AS ENUM ('THRESHOLD', 'LLM');

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "embeddingInputHash" TEXT,
ADD COLUMN     "embeddingModel" TEXT;

-- CreateTable
CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callSite" TEXT NOT NULL,
    "candidateStoryId" TEXT,
    "candidateAnalysisId" TEXT,
    "score" DOUBLE PRECISION,
    "thresholdMatched" BOOLEAN NOT NULL,
    "llmVerdict" BOOLEAN,
    "decidedBy" "MatchDecidedBy" NOT NULL,
    "scorerVersion" TEXT NOT NULL,

    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmbeddingCache" (
    "model" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbeddingCache_pkey" PRIMARY KEY ("model","inputHash")
);

-- CreateIndex
CREATE INDEX "MatchDecision_callSite_createdAt_idx" ON "MatchDecision"("callSite", "createdAt");
