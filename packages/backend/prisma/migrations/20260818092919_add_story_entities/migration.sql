-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "entities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "entityRelations" JSONB NOT NULL DEFAULT '[]';

