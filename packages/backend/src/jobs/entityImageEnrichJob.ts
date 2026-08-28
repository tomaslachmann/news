import type { FastifyBaseLogger } from 'fastify'
import type { EntityRecord, EntityWikidataContext } from '../repositories/entity.js'
import type { NewEntityImage } from '../repositories/entityImage.js'
import { findWikidataEntityImage } from '../services/wikimediaImageClient.js'
import { findWikidataContext } from '../services/wikipediaClient.js'
import { JobName, type JobPayload } from './jobDefinitions.js'

export interface EntityImageEnrichJobDeps {
  findEntityById: (id: string) => Promise<EntityRecord | null>
  findEntityImageForEntity: (entityId: string) => Promise<{ id: string } | null>
  createEntityImage: (input: NewEntityImage) => Promise<void>
  updateEntityWikidataContext: (entityId: string, context: EntityWikidataContext) => Promise<void>
}

/** Handler for the `entity.image.enrich` job (ticket 41 / ADR 0034; extended in ticket 90 — the
 *  job name is kept, a rename would orphan its pg-boss queue for cosmetics): re-reads the Entity's
 *  current `wikidataId` by id (retry-safe — never trusts a value carried in the job payload, which
 *  could be stale) and enriches it from Wikimedia in two independent, best-effort steps —
 *  a depicting image, and external descriptive context (Wikidata one-liner + Czech Wikipedia
 *  intro).
 *
 *  Deliberately never rethrows: this is best-effort enrichment of an identity an Admin already
 *  confirmed by linking `wikidataId`, not a required step. The Entity no longer existing or its
 *  `wikidataId` having since been unlinked short-circuits the whole job; each enrichment step also
 *  skips itself on redelivery (image already present / context already fetched) and swallows its
 *  own external-call failure without touching the other step. Mirrors `runNarrativeJob`'s
 *  no-op-and-return conditions. */
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

  await enrichImage(entity, entity.wikidataId, deps, log)
  await enrichContext(entity, entity.wikidataId, deps, log)
}

async function enrichImage(
  entity: EntityRecord,
  wikidataId: string,
  deps: EntityImageEnrichJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  if (await deps.findEntityImageForEntity(entity.id)) {
    log?.info(
      { entityId: entity.id },
      'entity.image.enrich job: EntityImage already present, skipping image step'
    )
    return
  }

  let image
  try {
    image = await findWikidataEntityImage(wikidataId)
  } catch (err) {
    log?.warn(
      { entityId: entity.id, wikidataId, err },
      'entity.image.enrich job: Wikimedia image lookup failed, completing with no image'
    )
    return
  }

  if (!image) {
    log?.info(
      { entityId: entity.id, wikidataId },
      'entity.image.enrich job: no Wikimedia image for this Entity'
    )
    return
  }

  await deps.createEntityImage({ entityId: entity.id, provider: 'WIKIMEDIA', ...image })
}

async function enrichContext(
  entity: EntityRecord,
  wikidataId: string,
  deps: EntityImageEnrichJobDeps,
  log?: FastifyBaseLogger
): Promise<void> {
  // Proxy check, not an artifact check like enrichImage's: if the first run got a description but
  // Wikipedia was transiently down (the summary call is swallowed, see findWikidataContext), a
  // redelivery skips here and the extract is never backfilled. Accepted under best-effort framing
  // + ADR 0021's no-backfill posture — a description is the common case and losing an extract is
  // low-stakes; not worth an "attempted" marker column.
  if (entity.wikidataDescription || entity.wikipediaExtract) {
    log?.info(
      { entityId: entity.id },
      'entity.image.enrich job: external context already fetched, skipping context step'
    )
    return
  }

  let context
  try {
    context = await findWikidataContext(wikidataId)
  } catch (err) {
    log?.warn(
      { entityId: entity.id, wikidataId, err },
      'entity.image.enrich job: Wikidata/Wikipedia context lookup failed, completing with no context'
    )
    return
  }

  if (!context.description && !context.wikipediaExtract) {
    log?.info(
      { entityId: entity.id, wikidataId },
      'entity.image.enrich job: no external context for this Entity'
    )
    return
  }

  await deps.updateEntityWikidataContext(entity.id, context)
}
