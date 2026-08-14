-- Embedding of Story.anchorHeadline (+ excerpt where available), used by automated Ingestion's
-- cheap candidate matching in place of an LLM call (ADR 0018). Existing rows default to an empty
-- array — an empty vector never scores above the match threshold, so pre-existing Stories are
-- simply never matched by this mechanism rather than left in a broken state.
ALTER TABLE "Story" ADD COLUMN "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
