-- AlterTable: resolved once at PendingAddition-creation time and copied onto the Coverage
-- approvePendingAddition later creates -- nullable, no backfill (ADR 0021), same as
-- Coverage.primaryCategory (see 20260826232000_add_article_category).
ALTER TABLE "PendingAddition" ADD COLUMN     "primaryCategory" "ArticleCategory";
