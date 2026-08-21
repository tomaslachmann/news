import type { FastifyBaseLogger } from 'fastify'
import type { EntityRecord } from '../repositories/entity.js'
import type { NewEntityImage } from '../repositories/entityImage.js'
import { findWikidataEntityImage } from '../services/wikimediaImageClient.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface EntityImageEnrichJobDeps {
  findEntityById: (id: string) => Promise<EntityRecord | null>
  findEntityImageForEntity: (entityId: string) => Promise<{ id: string } | null>
  createEntityImage: (input: NewEntityImage) => Promise<void>
}

/** Handler for the `entity.image.enrich` job (ticket 41 / ADR 0034): re-reads the Entity's
 *  current `wikidataId` by id (retry-safe — never trusts a value carried in the job payload,
 *  which could be stale), looks up its Wikimedia image, and persists it if one exists.
 *
 *  Deliberately never rethrows: this is best-effort enrichment of an identity an Admin already
 *  confirmed by linking `wikidataId`, not a required step — a missing/failed fetch just leaves
 *  the Entity imageless (docs/spec-entity-resolution.md). The Entity no longer existing, its
 *  `wikidataId` having since been unlinked, or an `EntityImage` already present (pg-boss
 *  redelivering an already-succeeded attempt) all short-circuit the same way, before any external
 *  call — mirroring `runNarrativeJob`'s no-op-and-return conditions. */
export async function runEntityImageEnrichJob(
  payload: JobPayload[typeof JobName.EntityImageEnrich],
  deps: EntityImageEnrichJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  const entity = await deps.findEntityById(payload.entityId)
  if (!entity || !entity.wikidataId) {
    log?.warn(
      { entityId: payload.entityId },
      'entity.image.enrich job: Entity no longer exists or has no wikidataId, skipping'
    )
    return
  }

  const existingImage = await deps.findEntityImageForEntity(entity.id)
  if (existingImage) {
    log?.warn(
      { entityId: entity.id },
      'entity.image.enrich job: EntityImage already present (redelivered job?), skipping'
    )
    return
  }

  let image
  try {
    image = await findWikidataEntityImage(entity.wikidataId)
  } catch (err) {
    log?.warn(
      { entityId: entity.id, wikidataId: entity.wikidataId, err },
      'entity.image.enrich job: Wikimedia lookup failed, completing with no image'
    )
    return
  }

  if (!image) {
    log?.info(
      { entityId: entity.id, wikidataId: entity.wikidataId },
      'entity.image.enrich job: no Wikimedia image found for this Entity'
    )
    return
  }

  await deps.createEntityImage({ entityId: entity.id, provider: 'WIKIMEDIA', ...image })
}
