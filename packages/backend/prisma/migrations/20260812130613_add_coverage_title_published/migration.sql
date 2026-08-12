-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CoverageStatus" AS ENUM ('PENDING', 'OK', 'EXTRACTION_FAILED');

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "seedUrl" TEXT NOT NULL,
    "seedHeadline" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coverage" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "outlet" TEXT NOT NULL,
    "title" TEXT,
    "articleUrl" TEXT NOT NULL,
    "publishedAt" TEXT,
    "extractedText" TEXT,
    "extractionResult" JSONB,
    "status" "CoverageStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SynthesisResult" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,

    CONSTRAINT "SynthesisResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SynthesisResult_analysisId_key" ON "SynthesisResult"("analysisId");

-- AddForeignKey
ALTER TABLE "Coverage" ADD CONSTRAINT "Coverage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SynthesisResult" ADD CONSTRAINT "SynthesisResult_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
