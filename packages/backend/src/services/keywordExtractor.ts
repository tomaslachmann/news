import { callJsonModel } from './llmClient.js'

const SYSTEM_PROMPT = `Jsi novinářský asistent. Dostaneš titulek a první odstavce českého zpravodajského článku.
Vytvoř 3–5 českých klíčových slov nebo frází, které by pomohly najít jiné české zpravodajské články o stejné události.
Zaměř se na konkrétní jména, místa, události nebo organizace.
Vrať pouze JSON objekt: {"keywords": ["klíčové slovo 1", "klíčové slovo 2", ...]}`

export async function extractKeywords(title: string, excerpt: string): Promise<string[]> {
  const model = process.env.EXTRACTION_MODEL ?? 'gpt-4o'
  const userContent = `Titulek: ${title}\n\n${excerpt}`
  const parsed = (await callJsonModel(model, SYSTEM_PROMPT, userContent, 'keywordExtractor', 0.2)) as {
    keywords?: unknown
  }

  if (!Array.isArray(parsed.keywords)) {
    throw new Error('Unexpected response shape from keyword extraction model')
  }

  return (parsed.keywords as unknown[])
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim())
    .slice(0, 5)
}
