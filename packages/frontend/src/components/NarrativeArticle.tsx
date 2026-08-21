import { Link } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { indexNarrativeRefs, resolveSourceRefs, type NarrativeRefIndex } from '@/lib/narrativeRefs'
import type {
  NarrativeBlock,
  NarrativeDocument,
  NarrativeInline,
  NarrativeLeadImage,
} from '@/services/analyses'
import './NarrativeArticle.css'

/** The Narrative's illustrative lead image (ticket 51) — always captioned "Ilustrační foto" plus
 *  attribution, so it can never be mistaken for documentary evidence of the event (CLAUDE.md's
 *  premise, restated in the ticket's Notes: this tool never fabricates or misrepresents what
 *  actually happened). Renders nothing at all when `image` is undefined — no broken-image state,
 *  no layout reserved for a missing image. */
function LeadImage({ image }: { image: NarrativeLeadImage }) {
  return (
    <figure className="nlead">
      <img src={image.imageUrl} alt="" className="nlead__img" />
      <figcaption className="nlead__cap">
        Ilustrační foto
        {(image.author || image.license) && (
          <>
            {' — '}
            {[image.author, image.license].filter(Boolean).join(', ')}
          </>
        )}
        {', '}
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">
          Wikimedia Commons
        </a>
      </figcaption>
    </figure>
  )
}

/** `/entity/:key` (ticket 43) is already shipped in this codebase, so every entity ref links
 *  unconditionally — same posture `EntityMentionsSection` (AnalysisPage.tsx) already takes for its
 *  own entity links. No route-existence check is needed here or there. */
function EntityInline({
  run,
  refs,
}: {
  run: Extract<NarrativeInline, { type: 'entity' }>
  refs: NarrativeRefIndex
}) {
  const ref = refs.entities.get(run.entityId)
  if (!ref) return <>{run.text}</>

  const link = (
    <Link to={`/entity/${ref.entityKey}`} className="nref nref--entity">
      {run.text}
    </Link>
  )
  if (!ref.imageUrl) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent>
        <img src={ref.imageUrl} alt={ref.canonicalName} className="nref__img" loading="lazy" />
        <p>{ref.canonicalName}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function SourceInline({
  run,
  refs,
}: {
  run: Extract<NarrativeInline, { type: 'source' }>
  refs: NarrativeRefIndex
}) {
  const cited = resolveSourceRefs(run.sourceIds, refs)
  if (cited.length === 0) return <span className="nref nref--source">{run.text}</span>

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="nref nref--source" tabIndex={0}>
          {run.text}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="nref__srclist">
          {cited.map((s) => (
            <li key={s.id}>
              <a href={s.articleUrl} target="_blank" rel="noopener noreferrer">
                {s.outlet}
              </a>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function ValueInline({ run }: { run: Extract<NarrativeInline, { type: 'value' }> }) {
  return <span className="nref nref--value">{run.text}</span>
}

function renderInline(children: NarrativeInline[], refs: NarrativeRefIndex) {
  return children.map((run, i) => {
    switch (run.type) {
      case 'entity':
        return <EntityInline key={i} run={run} refs={refs} />
      case 'source':
        return <SourceInline key={i} run={run} refs={refs} />
      case 'value':
        return <ValueInline key={i} run={run} />
      case 'text':
      default:
        return run.text
    }
  })
}

/** A `quote` block always names exactly one `sourceId` (ADR 0034) — attributed via a `<footer>`,
 *  not just styled to look like a quote, so a reader can tell whose exact wording it is. */
function QuoteBlock({
  block,
  refs,
}: {
  block: Extract<NarrativeBlock, { type: 'quote' }>
  refs: NarrativeRefIndex
}) {
  const source = refs.sources.get(block.sourceId)
  return (
    <blockquote className="nquote">
      <p>{renderInline(block.children, refs)}</p>
      {source && (
        <footer className="nquote__attr">
          <cite>{source.outlet}</cite>
        </footer>
      )}
    </blockquote>
  )
}

/** The Cross-Source Narrative (ADR 0012 / ADR 0034), rendered as continuous prose from its
 *  structured `NarrativeDocument.blocks` — replaces ticket 20's segment-based rendering (ticket
 *  48). Entity/source/value inline runs resolve against the document's own top-level ref
 *  declarations and render as distinct in-text annotations rather than raw markup. `leadImage`
 *  (ticket 51) renders above the prose when present, absent entirely otherwise. */
export function NarrativeArticle({
  document,
  leadImage,
}: {
  document: NarrativeDocument
  leadImage?: NarrativeLeadImage
}) {
  const refs = indexNarrativeRefs(document)

  return (
    <div className="prose">
      {leadImage && <LeadImage image={leadImage} />}
      {document.blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const Heading = block.level === 2 ? 'h2' : 'h3'
            return <Heading key={i}>{renderInline(block.children, refs)}</Heading>
          }
          case 'quote':
            return <QuoteBlock key={i} block={block} refs={refs} />
          case 'list': {
            const List = block.style === 'ordered' ? 'ol' : 'ul'
            return (
              <List key={i} className="nlist">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item.children, refs)}</li>
                ))}
              </List>
            )
          }
          case 'paragraph':
          default:
            return <p key={i}>{renderInline(block.children, refs)}</p>
        }
      })}
    </div>
  )
}
