-- CreateIndex
CREATE INDEX "Analysis_status_createdAt_idx" ON "Analysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Coverage_analysisId_excluded_status_idx" ON "Coverage"("analysisId", "excluded", "status");

-- CreateIndex
CREATE INDEX "StoryRelation_toStoryId_idx" ON "StoryRelation"("toStoryId");

-- CreateIndex
CREATE INDEX "StoryRelation_status_createdAt_idx" ON "StoryRelation"("status", "createdAt");

