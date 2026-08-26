-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('DOMESTIC', 'WORLD', 'ECONOMY', 'POLITICS', 'SPORT', 'CULTURE', 'SCIENCE_TECH', 'CRIME', 'LIFESTYLE', 'COMMENTARY', 'HEALTH', 'REGIONAL', 'OTHER');

-- AlterTable: nullable, no backfill (ADR 0021) -- every existing Coverage row stays uncategorized.
ALTER TABLE "Coverage" ADD COLUMN     "primaryCategory" "ArticleCategory";

-- AlterTable: unused until ticket 79 configures real per-category SourceFeed URLs.
ALTER TABLE "SourceFeed" ADD COLUMN     "category" "ArticleCategory";
