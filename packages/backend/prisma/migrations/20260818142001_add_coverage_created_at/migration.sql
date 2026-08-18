-- AlterTable
ALTER TABLE "Coverage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Coverage_createdAt_idx" ON "Coverage"("createdAt");

