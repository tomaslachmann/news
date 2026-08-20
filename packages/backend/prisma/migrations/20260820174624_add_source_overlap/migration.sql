-- CreateEnum
CREATE TYPE "SynthesisAgreementCategory" AS ENUM ('CONFIRMED', 'PARTIAL', 'DISPUTED');

-- AlterTable: sourceOverlapPercentage stays nullable permanently (see schema.prisma's own
-- comment); agreementCategory starts nullable here only so the backfill below can run, then gets
-- NOT NULL enforced at the end of this migration.
ALTER TABLE "SynthesisResult" ADD COLUMN "sourceOverlapPercentage" INTEGER;
ALTER TABLE "SynthesisResult" ADD COLUMN "agreementCategory" "SynthesisAgreementCategory";

-- Ticket 38 was authored assuming SynthesisResult had 0 rows (verified at the time) and
-- deliberately specified no backfill path. That assumption was stale by the time this migration
-- was written -- 4 rows existed, real local-dev output with real headlines, not throwaway data --
-- so per the ticket's own "stop and raise it" clause this was raised with the project owner.
-- Decision: backfill agreementCategory to PARTIAL for these rows only (a neutral placeholder,
-- not a judgement the model ever actually made) rather than wipe them or leave the column
-- nullable. sourceOverlapPercentage is left null for these same rows -- computing it
-- retroactively from the still-present `dimensions` JSON was possible but out of scope for this
-- migration, and null is the column's own "undefined" state regardless.
--
-- Scoped to these 4 specific row ids -- the exact set verified by hand at authoring time -- not a
-- blanket `WHERE "agreementCategory" IS NULL`. Any row this migration doesn't already know about
-- (e.g. one inserted between authoring and the migration actually running) is a case nobody has
-- reviewed; it must fail the NOT NULL constraint below and get raised, not silently receive the
-- same placeholder. This list is also the queryable record of which agreementCategory values are
-- fabricated rather than a genuine model judgement, should that distinction ever matter later.
UPDATE "SynthesisResult" SET "agreementCategory" = 'PARTIAL'
WHERE id IN (
  'cmt1qm62x01i34pt20pchu7if',
  'cmt1rcnlj01iw4pt2vo1ym16v',
  'cmt1rj5b901js4pt2fefp2y5x',
  'cmt1rtyii01mu4pt2fvttx8wf'
);

ALTER TABLE "SynthesisResult" ALTER COLUMN "agreementCategory" SET NOT NULL;
