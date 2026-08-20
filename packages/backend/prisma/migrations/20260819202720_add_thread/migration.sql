-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('ACTIVE', 'DORMANT', 'CLOSED');

-- CreateEnum
CREATE TYPE "ThreadRole" AS ENUM ('ORIGIN', 'DEVELOPMENT', 'REACTION', 'RESOLUTION');

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "firstEventAt" TIMESTAMP(3) NOT NULL,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "status" "ThreadStatus" NOT NULL DEFAULT 'ACTIVE',
    "memberCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadMember" (
    "threadId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "ThreadRole" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadMember_pkey" PRIMARY KEY ("threadId","storyId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Thread_slug_key" ON "Thread"("slug");

-- CreateIndex
CREATE INDEX "Thread_status_lastEventAt_idx" ON "Thread"("status", "lastEventAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadMember_storyId_key" ON "ThreadMember"("storyId");

-- CreateIndex
CREATE INDEX "ThreadMember_threadId_position_idx" ON "ThreadMember"("threadId", "position");

-- AddForeignKey
ALTER TABLE "ThreadMember" ADD CONSTRAINT "ThreadMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadMember" ADD CONSTRAINT "ThreadMember_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
