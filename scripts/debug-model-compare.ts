import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

const MODELS = [
  {
    id: 'nvidia/nv-embedqa-e5-v5',
    dims: 1024,
    needsInputType: true,
  },
  {
    id: 'nvidia/nv-embed-v1',
    dims: 2048,
    needsInputType: false,
  },
]

async function embedRaw(
  text: string,
  model: string,
  inputType: string | null
): Promise<number[]> {
  const body: Record<string, unknown> = {
    model,
    input: text,
    encoding_format: 'float',
  }
  if (inputType) body.input_type = inputType

  const res = await fetch(
    'https://integrate.api.nvidia.com/v1/embeddings',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(body),
    }
  )
  const data = await res.json() as {
    data: Array<{ embedding: number[] }>
    error?: { message: string }
  }
  if (data.error) {
    throw new Error(`${model}: ${data.error.message || JSON.stringify(data.error)}`)
  }
  if (!data.data?.[0]?.embedding) {
    throw new Error(`${model}: unexpected response format — ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.data[0].embedding
}

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0)
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  return dot / (magA * magB)
}

const TEST_PAIRS = [
  {
    label: 'Dyslexia passage vs reading query',
    passage: 'Dyslexia is characterised by difficulties with accurate and fluent word recognition, poor spelling, and decoding abilities. Children with dyslexia often struggle to connect letters with their sounds.',
    query: 'child struggles with reading and letter sounds',
  },
  {
    label: 'ADHD passage vs attention query',
    passage: 'Children with ADHD have difficulty sustaining attention, are easily distracted, and often act impulsively without thinking about consequences. Working memory deficits make it hard to hold information while completing tasks.',
    query: 'difficulty focusing and impulsive behaviour in sessions',
  },
  {
    label: 'Anxiety passage vs worry query',
    passage: 'Grounding techniques help regulate the nervous system by anchoring attention to the present moment through sensory awareness. The 5-4-3-2-1 method engages all five senses to interrupt anxious thought patterns.',
    query: 'client appears anxious and overwhelmed during session',
  },
  {
    label: 'Unrelated passage vs query (should be LOW)',
    passage: 'The capital of France is Paris. The Eiffel Tower was built in 1889 for the World Fair.',
    query: 'child struggles with reading and letter sounds',
  },
]

async function main() {
  console.log('=== EMBEDDING MODEL COMPARISON ===')
  console.log('Finding best model for Staad RAG therapy use case\n')

  const results: Record<string, number[]> = {}

  for (const model of MODELS) {
    console.log(`\nTesting: ${model.id}`)
    console.log('\u2500'.repeat(50))
    const scores: number[] = []

    for (const pair of TEST_PAIRS) {
      try {
        const passageEmb = await embedRaw(
          pair.passage,
          model.id,
          model.needsInputType ? 'passage' : null
        )
        const queryEmb = await embedRaw(
          pair.query,
          model.id,
          model.needsInputType ? 'query' : null
        )
        const score = cosine(passageEmb, queryEmb)
        scores.push(score)
        console.log(
          `  ${pair.label.padEnd(45)} \u2192 ${score.toFixed(4)}`
        )
      } catch (e) {
        console.log(`  ${pair.label.padEnd(45)} \u2192 ERROR: ${e}`)
        scores.push(0)
      }
      await new Promise(r => setTimeout(r, 300))
    }

    const relatedAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const unrelatedScore = scores[3]
    const separation = relatedAvg - unrelatedScore

    results[model.id] = scores
    console.log(`\n  Related avg:    ${relatedAvg.toFixed(4)}`)
    console.log(`  Unrelated:      ${unrelatedScore.toFixed(4)}`)
    console.log(`  Separation gap: ${separation.toFixed(4)} (higher = better discrimination)`)
  }

  console.log('\n\n=== SUMMARY ===')
  console.log('Model'.padEnd(45) + 'Related Avg'.padEnd(14) + 'Unrelated'.padEnd(12) + 'Gap')
  console.log('\u2500'.repeat(80))

  let bestModel = ''
  let bestGap = -1

  for (const model of MODELS) {
    const scores = results[model.id]
    if (!scores) continue
    const relatedAvg = scores.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const unrelated = scores[3]
    const gap = relatedAvg - unrelated
    const marker = gap > bestGap ? ' \u2190 BEST' : ''
    if (gap > bestGap) { bestGap = gap; bestModel = model.id }
    console.log(
      model.id.padEnd(45) +
      relatedAvg.toFixed(4).padEnd(14) +
      unrelated.toFixed(4).padEnd(12) +
      gap.toFixed(4) + marker
    )
  }

  console.log(`\n\u2705 Recommended model for Staad RAG: ${bestModel}`)
  console.log('\nReasoning: Best separation gap means the model correctly')
  console.log('scores related clinical text higher than unrelated text.')
  console.log('This is what matters for retrieval quality \u2014 not raw score height.')
}

main().catch(e => {
  console.error('Failed:', e)
  process.exit(1)
})
