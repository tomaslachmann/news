-- AlterEnum
ALTER TYPE "AnalysisStatus" ADD VALUE 'DRAFT';

-- CreateTable
CREATE TABLE "PendingAddition" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "outlet" TEXT NOT NULL,
    "title" TEXT,
    "articleUrl" TEXT NOT NULL,
    "publishedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAddition_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PendingAddition" ADD CONSTRAINT "PendingAddition_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
