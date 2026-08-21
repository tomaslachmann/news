import { z } from 'zod'
import type { FastifyBaseLogger } from 'fastify'
import type {
  EntityTypeLabel,
  NarrativeBlock,
  NarrativeDocument,
  NarrativeEntityRef,
  NarrativeInline,
  NarrativeSourceRef,
  NarrativeValueRef,
} from '@news-triangulator/shared'
import { isVerbatimQuote } from './quoteVerification.js'
import { parseCzechNumeralValue } from './czechNumeral.js'

/** ADR 0034's transport format: the LLM emits plain block/list-item text with inline tags —
 *  `<nt:e id>text</nt:e>`, `<nt:v id>text</nt:v>`, `<nt:s id1,id2>text</nt:s>` — never a
 *  structured `NarrativeInline[]` array directly. The backend is the only thing that ever turns
 *  this into the persisted `NarrativeInline` AST (see `parseInlineMarkup` below), and only once
 *  verification has passed. */

const LlmNarrativeEntityRefSchema = z.object({
  id: z.string(),
  /** Must be one of the Story's own known Entity keys, given to the model as input — never
   *  invented. Checked against that list by `findNarrativeVerificationFailures` (a
   *  `knownEntityKeys` miss is treated the same as a dangling ref) so a hallucinated key fails
   *  verification instead of silently resolving to itself as a display name. */
  entityKey: z.string(),
})

const LlmNarrativeSourceRefSchema = z.object({
  id: z.string(),
  articleUrl: z.string(),
})

// `sourceIds` here are ids into this same document's own `sourceRefs` declarations, not the
// model doing arithmetic — see NarrativeValueRef's `normalizedValue`/`unit`, which are computed
// server-side from `text` in `buildNarrativeDocument`, never emitted by the model.
const LlmNarrativeValueRefSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
})

const AssertionDimensionSchema = z.enum(['agreement', 'contradiction', 'unique_reporting', 'framing'])
export type AssertionDimension = z.infer<typeof AssertionDimensionSchema>

const LlmNarrativeAssertionSchema = z.object({
  id: z.string(),
  dimension: AssertionDimensionSchema,
  dimensionItemId: z.string(),
  entityRefs: z.array(z.string()),
  sourceRefs: z.array(z.string()),
  valueRefs: z.array(z.string()),
})

const LlmNarrativeListItemSchema = z.object({ text: z.string() })

const LlmNarrativeBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), level: z.union([z.literal(2), z.literal(3)]), text: z.string() }),
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('quote'), sourceId: z.string(), text: z.string() }),
  z.object({
    type: z.literal('list'),
    style: z.enum(['ordered', 'bullet']),
    items: z.array(LlmNarrativeListItemSchema),
  }),
])
export type LlmNarrativeBlock = z.infer<typeof LlmNarrativeBlockSchema>

export const LlmNarrativeDocumentSchema = z.object({
  blocks: z.array(LlmNarrativeBlockSchema),
  assertions: z.array(LlmNarrativeAssertionSchema),
  entityRefs: z.array(LlmNarrativeEntityRefSchema),
  sourceRefs: z.array(LlmNarrativeSourceRefSchema),
  valueRefs: z.array(LlmNarrativeValueRefSchema),
})
export type LlmNarrativeDocument = z.infer<typeof LlmNarrativeDocumentSchema>

const INLINE_TAG_RE = /<nt:(e|v|s)\s+([^>]+)>([\s\S]*?)<\/nt:\1>/g

/** Tokenizes one block/list-item's raw transport text into the persisted `NarrativeInline` AST.
 *  Pure and side-effect-free — reused both by `findNarrativeVerificationFailures` (to inspect
 *  which ref ids a passage cites, without persisting anything) and by `buildNarrativeDocument`
 *  (the one place its output is actually persisted, immediately after verification passes — ADR
 *  0034's "parsed exactly once"). */
export function parseInlineMarkup(text: string): NarrativeInline[] {
  const runs: NarrativeInline[] = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_TAG_RE)) {
    const [full, kind, idsRaw, inner] = match as unknown as [string, 'e' | 'v' | 's', string, string]
    const index = match.index ?? 0
    if (index > lastIndex) {
      const plain = text.slice(lastIndex, index)
      if (plain) runs.push({ type: 'text', text: plain })
    }
    if (kind === 'e') {
      runs.push({ type: 'entity', entityId: idsRaw.trim(), text: inner })
    } else if (kind === 'v') {
      runs.push({ type: 'value', valueId: idsRaw.trim(), text: inner })
    } else {
      runs.push({
        type: 'source',
        sourceIds: idsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
        text: inner,
      })
    }
    lastIndex = index + full.length
  }

  if (lastIndex < text.length) {
    const plain = text.slice(lastIndex)
    if (plain) runs.push({ type: 'text', text: plain })
  }

  return runs
}

/** Plain display text of a passage, with every `<nt:...>` tag replaced by its own inner text —
 *  used to verbatim-check a `quote` block's text against its cited Source without the transport
 *  markup getting in the way (a quote can itself contain a tagged entity mention). */
function stripInlineMarkup(text: string): string {
  return parseInlineMarkup(text)
    .map((run) => run.text)
    .join('')
}

export interface NarrativeVerificationContext {
  /** Keyed by Coverage `articleUrl` — same keying convention `quoteVerification.ts`'s callers
   *  already use. Also doubles as the set of `articleUrl`s a `sourceRef` is allowed to name. */
  sourceTextByArticleUrl: Map<string, string>
  /** The Story's own known Entity keys, the same list given to the model as input — an
   *  `entityRef.entityKey` outside this set is grounding the model refused to do, not just a
   *  structural dangling-ref. */
  knownEntityKeys: Set<string>
  dimensionItemIdsByDimension: Record<AssertionDimension, Set<string>>
}

function blockText(
  block: LlmNarrativeBlock,
  where: string,
  check: (text: string, where: string) => void
): void {
  if (block.type === 'list') {
    block.items.forEach((item, itemIndex) => check(item.text, `${where}.items[${itemIndex}]`))
    return
  }
  check(block.text, where)
}

/** Flags every id in `ids` that isn't in `declared` — the same "cites an undeclared top-level ref"
 *  check repeated for entityRefs/sourceRefs/valueRefs on both inline runs and assertions. */
function flagUndeclaredRefs(
  ids: string[],
  declared: Set<string>,
  label: string,
  where: string,
  failures: string[]
): void {
  for (const id of ids) {
    if (!declared.has(id)) failures.push(`${where}: ${label} references undeclared ref "${id}"`)
  }
}

/** The document-level semantic checks schema validation can't express (ADR 0034): a ref
 *  (entity/source/value) tagged inline or cited by an assertion that doesn't resolve to a
 *  declared top-level ref (or, for an entity/source ref, doesn't resolve to a *real* one — a
 *  known Entity key or a given source's articleUrl), leftover raw `<nt:...>` transport markup
 *  from an unclosed or mismatched tag, a `quote` block's text that isn't a verbatim substring of
 *  its one cited Source, and an assertion citing a `dimensionItemId` that doesn't exist in the
 *  dimension it names. Returns every failure found (empty when the document is fully valid)
 *  rather than stopping at the first one, so a repair prompt can address them all at once. */
export function findNarrativeVerificationFailures(
  doc: LlmNarrativeDocument,
  ctx: NarrativeVerificationContext
): string[] {
  const failures: string[] = []
  const entityRefIds = new Set(doc.entityRefs.map((r) => r.id))
  const sourceRefIds = new Set(doc.sourceRefs.map((r) => r.id))
  const valueRefIds = new Set(doc.valueRefs.map((r) => r.id))
  const sourceRefById = new Map(doc.sourceRefs.map((r) => [r.id, r]))

  for (const ref of doc.entityRefs) {
    if (!ctx.knownEntityKeys.has(ref.entityKey)) {
      failures.push(
        `entityRefs: ref "${ref.id}" cites entityKey "${ref.entityKey}", not one of this Story's known entities`
      )
    }
  }
  for (const ref of doc.sourceRefs) {
    if (!ctx.sourceTextByArticleUrl.has(ref.articleUrl)) {
      failures.push(
        `sourceRefs: ref "${ref.id}" cites articleUrl "${ref.articleUrl}", not one of the given sources`
      )
    }
  }

  const checkText = (text: string, where: string) => {
    for (const run of parseInlineMarkup(text)) {
      // A well-formed tag's own inner text never legitimately contains transport syntax — this
      // heuristic is what catches an unclosed tag (the whole rest of the string, including its
      // literal `<nt:e e1>`, becomes one plain-text run) or a same-kind tag nested inside another
      // (the outer tag's non-greedy match stops at the first same-kind closing tag, leaving the
      // inner tag's raw markup embedded in the outer run's own text) — either way, "raw markup
      // survived parsing" is itself the bug ADR 0034 says must never reach persistence.
      if (run.text.includes('<nt:') || run.text.includes('</nt:')) {
        failures.push(
          `${where}: leftover raw inline markup (unclosed or nested tag) near "${run.text.slice(0, 60)}"`
        )
      }
      if (run.type === 'entity' && !entityRefIds.has(run.entityId)) {
        failures.push(`${where}: entity ref "${run.entityId}" is not declared in entityRefs`)
      } else if (run.type === 'value' && !valueRefIds.has(run.valueId)) {
        failures.push(`${where}: value ref "${run.valueId}" is not declared in valueRefs`)
      } else if (run.type === 'source') {
        flagUndeclaredRefs(run.sourceIds, sourceRefIds, 'source', where, failures)
      }
    }
  }

  doc.blocks.forEach((block, blockIndex) => {
    const where = `blocks[${blockIndex}]`
    blockText(block, where, checkText)

    if (block.type !== 'quote') return
    const ref = sourceRefById.get(block.sourceId)
    if (!ref) {
      failures.push(`${where}: quote sourceId "${block.sourceId}" is not declared in sourceRefs`)
      return
    }
    const sourceText = ctx.sourceTextByArticleUrl.get(ref.articleUrl) ?? ''
    const quoteText = stripInlineMarkup(block.text)
    if (!isVerbatimQuote(quoteText, sourceText)) {
      failures.push(
        `${where}: quote text is not a verbatim substring of the cited Source (${ref.articleUrl})`
      )
    }
  })

  doc.assertions.forEach((assertion, index) => {
    const where = `assertions[${index}]`
    const idSet = ctx.dimensionItemIdsByDimension[assertion.dimension]
    if (!idSet.has(assertion.dimensionItemId)) {
      failures.push(
        `${where}: dimensionItemId "${assertion.dimensionItemId}" does not exist in dimension "${assertion.dimension}"`
      )
    }
    flagUndeclaredRefs(assertion.entityRefs, entityRefIds, 'entityRefs', where, failures)
    flagUndeclaredRefs(assertion.sourceRefs, sourceRefIds, 'sourceRefs', where, failures)
    flagUndeclaredRefs(assertion.valueRefs, valueRefIds, 'valueRefs', where, failures)
  })

  return failures
}

export class NarrativeVerificationError extends Error {}

/** Retries the whole document once on a repair prompt scoped to every failure found (never a
 *  per-block retry — ADR 0034: "there is no meaningful way to drop one bad block from an
 *  otherwise-coherent article"). A second failure — either a repair response that doesn't even
 *  match the schema, or one that still fails semantic verification — throws
 *  `NarrativeVerificationError` rather than dropping anything, so the caller's job fails and falls
 *  back to `narrative.generate`'s existing pg-boss retry (ADR 0028). Deliberately a separate
 *  function from `quoteVerification.ts`'s `verifyAndRepair`: that one's contract is
 *  drop-and-continue, which Synthesis still needs unchanged — this document-level check needs
 *  retry-once-then-fail instead. */
export async function verifyNarrativeDocumentOrThrow(
  parsed: LlmNarrativeDocument,
  ctx: NarrativeVerificationContext,
  repair: (failures: string[]) => Promise<unknown>,
  log?: FastifyBaseLogger
): Promise<LlmNarrativeDocument> {
  let failures = findNarrativeVerificationFailures(parsed, ctx)
  if (failures.length === 0) return parsed

  log?.warn(
    { failureCount: failures.length, failures },
    'Narrative document verification failed; retrying once'
  )

  const repairedParse = LlmNarrativeDocumentSchema.safeParse(await repair(failures))
  if (!repairedParse.success) {
    throw new NarrativeVerificationError('Narrative repair response did not match the expected schema')
  }

  failures = findNarrativeVerificationFailures(repairedParse.data, ctx)
  if (failures.length > 0) {
    log?.warn(
      { failureCount: failures.length, failures },
      'Narrative document still failing verification after retry'
    )
    throw new NarrativeVerificationError(
      `Narrative document failed verification after retry: ${failures.join('; ')}`
    )
  }

  return repairedParse.data
}

export interface KnownEntity {
  key: string
  canonicalName: string
  type: EntityTypeLabel
  /** This Entity's `EntityImage.imageUrl` (ticket 41), if any — resolved here, never asked of the
   *  LLM (same treatment as `canonicalName`); `buildUserContent` (narrativePass.ts) deliberately
   *  strips this back out of what's sent to the model, since it has no use for an image URL. */
  imageUrl: string | null
}

export interface NarrativeBuildContext {
  entitiesByKey: Map<string, KnownEntity>
  outletByArticleUrl: Map<string, string>
}

function buildBlock(block: LlmNarrativeBlock): NarrativeBlock {
  switch (block.type) {
    case 'heading':
      return { type: 'heading', level: block.level, children: parseInlineMarkup(block.text) }
    case 'quote':
      return { type: 'quote', sourceId: block.sourceId, children: parseInlineMarkup(block.text) }
    case 'list':
      return {
        type: 'list',
        style: block.style,
        items: block.items.map((item) => ({ children: parseInlineMarkup(item.text) })),
      }
    case 'paragraph':
      return { type: 'paragraph', children: parseInlineMarkup(block.text) }
  }
}

/** Turns a verified `LlmNarrativeDocument` into the persisted `NarrativeDocument` — parses every
 *  block's transport markup into the `NarrativeInline` AST (the only place this ever happens, and
 *  only after `verifyNarrativeDocumentOrThrow` has already passed), and fills in the two fields
 *  the LLM never computes itself: an entity ref's `canonicalName` (looked up from the Story's own
 *  known entities) and a value ref's `normalizedValue`/`unit` (the deterministic Czech-numeral
 *  parser, ADR 0014's "never trust an LLM with a computation a deterministic check can verify
 *  instead"). `entitiesByKey`/`outletByArticleUrl` must be derived from the same known-entities/
 *  sources lists `findNarrativeVerificationFailures` checked against — given that, every lookup
 *  below is guaranteed to hit (verification already rejected any ref that wouldn't); the `??`
 *  fallback is a defensive no-op, never a real "hallucinated ref" degrade path. */
export function buildNarrativeDocument(
  doc: LlmNarrativeDocument,
  ctx: NarrativeBuildContext
): NarrativeDocument {
  const entityRefs: NarrativeEntityRef[] = doc.entityRefs.map((ref) => ({
    id: ref.id,
    entityKey: ref.entityKey,
    canonicalName: ctx.entitiesByKey.get(ref.entityKey)?.canonicalName ?? ref.entityKey,
    imageUrl: ctx.entitiesByKey.get(ref.entityKey)?.imageUrl ?? null,
  }))

  const sourceRefs: NarrativeSourceRef[] = doc.sourceRefs.map((ref) => ({
    id: ref.id,
    articleUrl: ref.articleUrl,
    outlet: ctx.outletByArticleUrl.get(ref.articleUrl) ?? ref.articleUrl,
  }))

  const valueRefs: NarrativeValueRef[] = doc.valueRefs.map((ref) => {
    const { normalizedValue, unit } = parseCzechNumeralValue(ref.text)
    return { id: ref.id, text: ref.text, sourceIds: ref.sourceIds, normalizedValue, unit }
  })

  return {
    version: 1,
    blocks: doc.blocks.map(buildBlock),
    assertions: doc.assertions,
    entityRefs,
    sourceRefs,
    valueRefs,
  }
}
