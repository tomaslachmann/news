-- CreateEnum
CREATE TYPE "PendingAdditionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PendingAddition" ADD COLUMN     "status" "PendingAdditionStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- CreateIndex
CREATE INDEX "PendingAddition_status_createdAt_idx" ON "PendingAddition"("status", "createdAt");
