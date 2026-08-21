-- CreateTable
CREATE TABLE "HomepageEntityStatSnapshot" (
    "id" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomepageEntityStatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomepageEntityStatItem" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "recentEventCount" INTEGER NOT NULL,
    "recentSourceCount" INTEGER NOT NULL,
    "previousEventCount" INTEGER,

    CONSTRAINT "HomepageEntityStatItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomepageEntityStatSnapshot_computedAt_idx" ON "HomepageEntityStatSnapshot"("computedAt");

-- CreateIndex
CREATE INDEX "HomepageEntityStatSnapshot_windowStart_windowEnd_idx" ON "HomepageEntityStatSnapshot"("windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "HomepageEntityStatItem_snapshotId_rank_idx" ON "HomepageEntityStatItem"("snapshotId", "rank");

-- CreateIndex
CREATE INDEX "HomepageEntityStatItem_entityId_idx" ON "HomepageEntityStatItem"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "HomepageEntityStatItem_snapshotId_entityId_key" ON "HomepageEntityStatItem"("snapshotId", "entityId");

-- AddForeignKey
ALTER TABLE "HomepageEntityStatItem" ADD CONSTRAINT "HomepageEntityStatItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "HomepageEntityStatSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomepageEntityStatItem" ADD CONSTRAINT "HomepageEntityStatItem_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
