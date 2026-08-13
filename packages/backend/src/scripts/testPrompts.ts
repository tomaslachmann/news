import { discoverCoverage } from '../services/discovery.js'
import { scrapeArticle, MIN_TEXT_LENGTH } from '../services/articleScraper.js'
import { runExtractionPass } from '../services/extractionPass.js'
import { runSynthesisPass } from '../services/synthesisPass.js'

const KEYWORDS = ['Fiala', 'vláda', 'rozpočet']

async function main() {
  console.log(`Discovering articles for keywords: ${KEYWORDS.join(', ')}…`)
  const { candidates } = await discoverCoverage(KEYWORDS)
  console.log(`Found ${candidates.length} candidates`)

  const toTest = candidates.slice(0, 3)
  const sources = []

  for (const candidate of toTest) {
    console.log(`\n── ${candidate.outlet}: ${candidate.url}`)
    let scraped
    try {
      scraped = await scrapeArticle(candidate.url)
    } catch (err) {
      console.error(`  Scrape failed: ${(err as Error).message}`)
      continue
    }

    if (scraped.fullText.length < MIN_TEXT_LENGTH) {
      console.log(`  Skipped (paywall/short content, ${scraped.fullText.length} chars)`)
      continue
    }

    console.log(`  Title: ${scraped.title}`)
    console.log(`  Text: ${scraped.fullText.length} chars`)

    console.log(`  Running extraction pass…`)
    const extraction = await runExtractionPass(scraped.fullText)
    console.log(`  factualClaims: ${extraction.factualClaims.length}`)
    console.log(`  attributedClaims: ${extraction.attributedClaims.length}`)
    console.log(`  interpretiveStatements: ${extraction.interpretiveStatements.length}`)
    console.log(`  framingSignals: ${extraction.framingSignals.length}`)

    sources.push({ outlet: candidate.outlet, articleUrl: candidate.url, extraction })
  }

  if (sources.length >= 2) {
    console.log('\n── Running synthesis pass…')
    const synthesis = await runSynthesisPass(sources)
    console.log(`  agreement: ${synthesis.agreement.length}`)
    console.log(`  contradiction: ${synthesis.contradiction.length}`)
    console.log(`  uniqueReporting: ${synthesis.uniqueReporting.length}`)
    console.log(`  framing: ${synthesis.framing.length}`)

    console.log('\n=== SYNTHESIS RESULT ===')
    console.log(JSON.stringify(synthesis, null, 2))
  } else {
    console.log(`\nOnly ${sources.length} articles extracted successfully — need 2+ for synthesis.`)
    if (sources.length === 1) {
      console.log('\n=== EXTRACTION RESULT (single source) ===')
      console.log(JSON.stringify(sources[0]?.extraction, null, 2))
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
