-- CreateTable
CREATE TABLE "ThreadFollow" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadFollow_threadId_endpoint_key" ON "ThreadFollow"("threadId", "endpoint");

-- CreateIndex
CREATE INDEX "ThreadFollow_threadId_idx" ON "ThreadFollow"("threadId");

-- CreateIndex
CREATE INDEX "ThreadFollow_endpoint_idx" ON "ThreadFollow"("endpoint");

-- AddForeignKey
ALTER TABLE "ThreadFollow" ADD CONSTRAINT "ThreadFollow_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
