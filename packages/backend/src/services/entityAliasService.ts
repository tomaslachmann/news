import type { EntityAliasCandidateItem } from '@news-triangulator/shared'
import { NotFoundError, ValidationError } from '../errors.js'
import * as entityRepo from '../repositories/entity.js'
import * as entityAliasRepo from '../repositories/entityAlias.js'
import { recordAdminActionSafe } from '../repositories/adminActionLog.js'

function parsePairIdOrThrow(pairId: string): [string, string] {
  try {
    return entityAliasRepo.parsePairId(pairId)
  } catch {
    throw new ValidationError('Neplatné ID páru entit')
  }
}

/** Same-entity candidate pairs ranked by name similarity (ticket 40 / ADR 0033) — the raw
 *  repository shape already matches `EntityAliasCandidateItem` field for field (both an `EntityType`
 *  Prisma enum and shared's `EntityTypeLabel` compile to the same string literals), so no separate
 *  mapping step exists yet; add one if the two shapes ever need to diverge. */
export async function getEntityAliasCandidates(): Promise<EntityAliasCandidateItem[]> {
  return entityAliasRepo.findCandidatePairs()
}

/** Confirms `pairId` as one real-world entity: `survivingEntityId` (the Admin's choice of which
 *  canonical name/entity survives) must be one of the pair's two ids — the other one is the
 *  merged-away side. */
export async function confirmEntityAliasMerge(
  pairId: string,
  survivingEntityId: string,
  actorId: string
): Promise<void> {
  const [entityIdA, entityIdB] = parsePairIdOrThrow(pairId)
  if (survivingEntityId !== entityIdA && survivingEntityId !== entityIdB) {
    throw new ValidationError('survivingEntityId musí být jednou z entit tohoto páru')
  }
  const mergedAwayEntityId = survivingEntityId === entityIdA ? entityIdB : entityIdA

  const [survivor, mergedAway] = await Promise.all([
    entityRepo.findEntityById(survivingEntityId),
    entityRepo.findEntityById(mergedAwayEntityId),
  ])
  if (!survivor || !mergedAway) throw new NotFoundError('Entita nenalezena')
  if (survivor.type !== mergedAway.type) {
    throw new ValidationError('Nelze sloučit entity různého typu')
  }

  try {
    await entityAliasRepo.mergeEntities(survivingEntityId, mergedAwayEntityId, actorId)
  } catch (err) {
    // A double-confirm race (two Admins, or a retried request) — not a bug, so it surfaces as a
    // normal validation failure rather than a 500.
    if (err instanceof entityAliasRepo.AlreadyMergedError) {
      throw new ValidationError('Tato entita už byla sloučena do jiné')
    }
    throw err
  }

  await recordAdminActionSafe({
    actorId,
    action: 'entity.alias_merged',
    targetType: 'entity_alias',
    targetId: mergedAwayEntityId,
  })
}

/** Permanent — a rejected pair is never re-evaluated or re-surfaced by a later
 *  `findCandidatePairs` call, mirroring `rejectStoryRelation`'s same REJECTED-permanence
 *  semantics (ticket 36). */
export async function rejectEntityAliasMerge(pairId: string, actorId: string): Promise<void> {
  const [entityIdA, entityIdB] = parsePairIdOrThrow(pairId)
  await entityAliasRepo.rejectCandidatePair(entityIdA, entityIdB, actorId)
  await recordAdminActionSafe({
    actorId,
    action: 'entity.alias_rejected',
    targetType: 'entity_alias',
    targetId: `${entityIdA}:${entityIdB}`,
  })
}
