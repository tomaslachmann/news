-- CreateEnum
CREATE TYPE "StoryRelationType" AS ENUM ('RELATED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "StoryRelationConfidenceTier" AS ENUM ('HIGH', 'LOW');

-- CreateEnum
CREATE TYPE "StoryRelationStatus" AS ENUM ('PUBLISHED', 'PENDING_REVIEW', 'REJECTED');

-- CreateTable
CREATE TABLE "StoryRelation" (
    "id" TEXT NOT NULL,
    "fromStoryId" TEXT NOT NULL,
    "toStoryId" TEXT NOT NULL,
    "type" "StoryRelationType" NOT NULL,
    "confidenceTier" "StoryRelationConfidenceTier" NOT NULL,
    "reasoning" TEXT NOT NULL,
    "status" "StoryRelationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryRelation_fromStoryId_toStoryId_key" ON "StoryRelation"("fromStoryId", "toStoryId");

-- AddForeignKey
ALTER TABLE "StoryRelation" ADD CONSTRAINT "StoryRelation_fromStoryId_fkey" FOREIGN KEY ("fromStoryId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryRelation" ADD CONSTRAINT "StoryRelation_toStoryId_fkey" FOREIGN KEY ("toStoryId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

