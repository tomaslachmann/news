-- Ticket 93 / ADR 0042 — semi-automated entity → Wikidata linking.
-- EntityWikidataSuggestion: the ranked candidate set the scheduled scan surfaces for an unlinked
-- entity that did NOT clear the deterministic auto-link gate. One row per entity; a later scan
-- overwrites `candidates`; deleted the moment an Admin confirms or dismisses it.
CREATE TABLE "EntityWikidataSuggestion" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EntityWikidataSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntityWikidataSuggestion_entityId_key" ON "EntityWikidataSuggestion"("entityId");

ALTER TABLE "EntityWikidataSuggestion"
    ADD CONSTRAINT "EntityWikidataSuggestion_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EntityWikidataCandidateRejection: a Q-id an Admin has ruled out for an entity — permanent,
-- mirrors EntityAliasRejection. The scan filters these out of every future candidate set.
CREATE TABLE "EntityWikidataCandidateRejection" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "qid" TEXT NOT NULL,
    "rejectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityWikidataCandidateRejection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntityWikidataCandidateRejection_entityId_qid_key" ON "EntityWikidataCandidateRejection"("entityId", "qid");
CREATE INDEX "EntityWikidataCandidateRejection_entityId_idx" ON "EntityWikidataCandidateRejection"("entityId");

ALTER TABLE "EntityWikidataCandidateRejection"
    ADD CONSTRAINT "EntityWikidataCandidateRejection_entityId_fkey"
    FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
