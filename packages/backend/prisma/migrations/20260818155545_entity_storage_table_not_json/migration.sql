/*
  Warnings:

  - You are about to drop the column `entities` on the `Story` table. All the data in the column will be lost.
  - You are about to drop the column `entityRelations` on the `Story` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'PLACE', 'COUNTRY');

-- CreateEnum
CREATE TYPE "EntityRelationType" AS ENUM ('REPRESENTS', 'HOLDS_POSITION_IN', 'WORKS_FOR', 'MEMBER_OF', 'LOCATED_IN', 'BASED_IN', 'PART_OF', 'INVOLVES', 'MEETS', 'ATTACKS', 'ACCUSES', 'ANNOUNCES');

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "entities",
DROP COLUMN "entityRelations";

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "storyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryEntity" (
    "storyId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StoryEntity_pkey" PRIMARY KEY ("storyId","entityId")
);

-- CreateTable
CREATE TABLE "StoryEntityRelation" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "type" "EntityRelationType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StoryEntityRelation_pkey" PRIMARY KEY ("id"),
    -- Prisma's schema DSL can't express a CHECK constraint (same reason Coverage's partial
    -- unique index is hand-written) — an entity can never assert a relation to itself.
    CONSTRAINT "StoryEntityRelation_no_self_relation" CHECK ("fromEntityId" <> "toEntityId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_key_key" ON "Entity"("key");

-- CreateIndex
CREATE INDEX "Entity_type_idx" ON "Entity"("type");

-- CreateIndex
CREATE INDEX "StoryEntity_entityId_idx" ON "StoryEntity"("entityId");

-- CreateIndex
CREATE INDEX "StoryEntityRelation_fromEntityId_idx" ON "StoryEntityRelation"("fromEntityId");

-- CreateIndex
CREATE INDEX "StoryEntityRelation_toEntityId_idx" ON "StoryEntityRelation"("toEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryEntityRelation_storyId_fromEntityId_toEntityId_type_key" ON "StoryEntityRelation"("storyId", "fromEntityId", "toEntityId", "type");

-- AddForeignKey
ALTER TABLE "StoryEntity" ADD CONSTRAINT "StoryEntity_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntity" ADD CONSTRAINT "StoryEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntityRelation" ADD CONSTRAINT "StoryEntityRelation_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntityRelation" ADD CONSTRAINT "StoryEntityRelation_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryEntityRelation" ADD CONSTRAINT "StoryEntityRelation_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
