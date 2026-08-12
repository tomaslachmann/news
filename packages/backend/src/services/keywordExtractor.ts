import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `Jsi novinářský asistent. Dostaneš titulek a první odstavce českého zpravodajského článku.
Vytvoř 3–5 českých klíčových slov nebo frází, které by pomohly najít jiné české zpravodajské články o stejné události.
Zaměř se na konkrétní jména, místa, události nebo organizace.
Vrať pouze JSON objekt: {"keywords": ["klíčové slovo 1", "klíčové slovo 2", ...]}`

export async function extractKeywords(title: string, excerpt: string): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: process.env.EXTRACTION_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Titulek: ${title}\n\n${excerpt}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { keywords?: unknown }

  if (!Array.isArray(parsed.keywords)) {
    throw new Error('Unexpected response shape from keyword extraction model')
  }

  return (parsed.keywords as unknown[])
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim())
    .slice(0, 5)
}
