import 'dotenv/config'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
const MODEL = 'nvidia/nv-embedqa-e5-v5'
const TEST_THERAPIST = 'debug-test-001'

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0)
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
  return dot / (magA * magB)
}

async function embed(
  text: string,
  inputType: 'query' | 'passage' | null
): Promise<number[]> {
  const params: Record<string, unknown> = {
    model: MODEL,
    input: text,
    encoding_format: 'float',
  }
  if (inputType) params.input_type = inputType

  const response = await fetch(
    'https://integrate.api.nvidia.com/v1/embeddings',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify(params),
    }
  )

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>
    error?: { message: string }
  }

  if (data.error) throw new Error(JSON.stringify(data.error))
  return data.data[0].embedding
}

async function main() {
  console.log('=== EMBEDDING DEBUG ===\n')

  const passage = 'Dyslexia is characterised by difficulties with accurate and fluent word recognition, poor spelling, and decoding abilities.'
  const query = 'child struggles with reading and letter sounds'

  // Test A — no input_type (expected to fail — confirms API requires it)
  try {
    const pNone = await embed(passage, null)
    const qNone = await embed(query, null)
    console.log(`A) No input_type — unexpected success: ${cosine(pNone, qNone).toFixed(4)}`)
  } catch {
    console.log('A) No input_type: ✗ REJECTED (expected — API requires input_type)')
  }

  // Test B — both as passage
  console.log('\nB) Both as "passage":')
  const pPass = await embed(passage, 'passage')
  const qPass = await embed(query, 'passage')
  console.log(`   Similarity: ${cosine(pPass, qPass).toFixed(4)}`)

  // Test C — correct asymmetric (passage + query)
  console.log('\nC) Asymmetric: passage + query (CORRECT):')
  const pCorrect = await embed(passage, 'passage')
  const qCorrect = await embed(query, 'query')
  console.log(`   Similarity: ${cosine(pCorrect, qCorrect).toFixed(4)}`)

  console.log('\nExpected: C should be highest score (>0.80)')
  console.log('The correct combo is: store with "passage", search with "query"\n')

  // Now test full pgvector round-trip with correct types
  console.log('=== PGVECTOR ROUND-TRIP TEST ===\n')

  await sql`DELETE FROM document_chunks WHERE therapist_id = ${TEST_THERAPIST}`

  const storedEmb = await embed(passage, 'passage')
  await sql`
    INSERT INTO document_chunks
      (id, therapist_id, file_name, chunk_index, chunk_text, embedding)
    VALUES (
      gen_random_uuid(),
      ${TEST_THERAPIST},
      ${'debug-test.txt'},
      ${0},
      ${passage},
      ${JSON.stringify(storedEmb)}::vector
    )
  `
  console.log('✓ Stored chunk with input_type: "passage"')

  const searchEmb = await embed(query, 'query')
  const results = await sql`
    SELECT
      chunk_text,
      1 - (embedding <=> ${JSON.stringify(searchEmb)}::vector) AS similarity
    FROM document_chunks
    WHERE therapist_id = ${TEST_THERAPIST}
    ORDER BY embedding <=> ${JSON.stringify(searchEmb)}::vector
    LIMIT 1
  `

  console.log(`✓ Retrieved with input_type: "query"`)
  console.log(`✓ pgvector similarity: ${Number(results[0].similarity).toFixed(4)}`)

  console.log(`\n✅ pgvector returned top result — using top-k approach`)
  console.log(`   Stored dims: ${storedEmb.length}, Query dims: ${searchEmb.length}`)

  await sql`DELETE FROM document_chunks WHERE therapist_id = ${TEST_THERAPIST}`
  console.log('\n✓ Debug data cleaned up')
}

main().catch(e => {
  console.error('Debug failed:', e)
  process.exit(1)
})
