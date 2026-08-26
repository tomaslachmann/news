-- AlterTable
ALTER TABLE "Thread" ADD COLUMN "openQuestions" JSONB NOT NULL DEFAULT '[]';
