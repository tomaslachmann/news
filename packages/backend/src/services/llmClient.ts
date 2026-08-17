import OpenAI from 'openai'

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function callJsonModel(
  model: string,
  systemPrompt: string,
  userContent: string,
  temperature = 0
): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature,
  })
  const raw = response.choices[0]?.message?.content ?? '{}'
  return JSON.parse(raw)
}
