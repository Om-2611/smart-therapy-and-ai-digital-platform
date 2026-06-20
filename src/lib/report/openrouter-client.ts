import OpenAI from 'openai'

// Free model by default; override with OPENROUTER_MODEL in .env to swap (e.g.
// to a stronger paid model or Claude) without touching code. The report runs
// once after the session — speed is irrelevant, so a larger free model is fine.
export const REPORT_MODEL =
  process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b:free'

// Lazily constructed so a missing key never breaks builds/imports — it only
// throws when a report is actually generated.
let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in .env')
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://staad.therapy',
        'X-Title': 'STAAD Therapy',
      },
    })
  }
  return client
}

export async function generateReportText(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: REPORT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  })
  return res.choices[0]?.message?.content ?? ''
}
