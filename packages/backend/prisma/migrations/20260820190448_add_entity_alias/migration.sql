-- Prisma's migration diff generated a spurious `DROP INDEX "entity_canonicalName_trgm_idx"` here
-- (removed) -- it doesn't understand that hand-written index (schema.prisma's own comment on
-- Entity explains why), so every migration touching this table looks like it's dropping an index
-- Prisma's own model doesn't know exists. Same non-issue as every other migration since ticket 12.

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "mergedFromEntityId" TEXT NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAliasRejection" (
    "id" TEXT NOT NULL,
    "entityIdA" TEXT NOT NULL,
    "entityIdB" TEXT NOT NULL,
    "rejectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityAliasRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_alias_key" ON "EntityAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_mergedFromEntityId_key" ON "EntityAlias"("mergedFromEntityId");

-- CreateIndex
CREATE INDEX "EntityAlias_entityId_idx" ON "EntityAlias"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAliasRejection_entityIdA_entityIdB_key" ON "EntityAliasRejection"("entityIdA", "entityIdB");

-- AddForeignKey
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_mergedFromEntityId_fkey" FOREIGN KEY ("mergedFromEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAliasRejection" ADD CONSTRAINT "EntityAliasRejection_entityIdA_fkey" FOREIGN KEY ("entityIdA") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAliasRejection" ADD CONSTRAINT "EntityAliasRejection_entityIdB_fkey" FOREIGN KEY ("entityIdB") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
