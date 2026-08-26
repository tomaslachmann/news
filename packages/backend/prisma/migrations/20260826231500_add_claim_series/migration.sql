-- CreateTable
CREATE TABLE "ClaimSeries" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimSeriesMember" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "valueRefId" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedValue" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "sourceIds" TEXT[],
    "entityKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimSeriesMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimSeries_threadId_idx" ON "ClaimSeries"("threadId");

-- CreateIndex
CREATE INDEX "ClaimSeriesMember_seriesId_idx" ON "ClaimSeriesMember"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimSeriesMember_seriesId_analysisId_key" ON "ClaimSeriesMember"("seriesId", "analysisId");

-- AddForeignKey
ALTER TABLE "ClaimSeries" ADD CONSTRAINT "ClaimSeries_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSeriesMember" ADD CONSTRAINT "ClaimSeriesMember_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "ClaimSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSeriesMember" ADD CONSTRAINT "ClaimSeriesMember_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
