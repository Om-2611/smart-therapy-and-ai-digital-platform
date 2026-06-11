import { analyseWithLLM } from './nvidia-client'
import { SYSTEM_PROMPT, buildAnalysisPrompt } from './prompt'
import { retrieveRAGContext, type ClientProfile } from './retrieval'
import type { AIInsight } from './types'

export interface AnalysisOptions {
  sessionId: string
  therapistId: string
  clientProfile: ClientProfile
  transcriptWindowMinutes?: number
}

export async function runAnalysis(
  options: AnalysisOptions
): Promise<AIInsight> {
  const {
    sessionId,
    therapistId,
    clientProfile,
    transcriptWindowMinutes = 5,
  } = options

  console.log(`[Analysis] Starting for session ${sessionId}`)
  console.log(`[Analysis] Client: ${clientProfile.name}, Window: ${transcriptWindowMinutes}min`)

  const context = await retrieveRAGContext(
    sessionId,
    therapistId,
    clientProfile,
    transcriptWindowMinutes
  )

  console.log(`[Analysis] Context retrieved — transcript: ${context.transcript.slice(0, 80)}...`)
  console.log(`[Analysis] Study material chunks: ${context.studyMaterial.length}`)
  console.log(`[Analysis] Previous notes: ${context.previousNotes.length}`)

  const userPrompt = buildAnalysisPrompt(context)

  console.log('[Analysis] Calling NVIDIA NIM LLM...')
  const llmStart = Date.now()
  const raw = await analyseWithLLM(SYSTEM_PROMPT, userPrompt)
  const llmDuration = Date.now() - llmStart
  console.log(`[Analysis] LLM responded in ${llmDuration}ms`)

  const insight = parseInsight(raw, transcriptWindowMinutes)

  console.log(`[Analysis] Parsed — emotions: [${insight.emotions.join(', ')}], risk: ${insight.riskFlag}`)

  return insight
}

function parseInsight(
  raw: string,
  transcriptWindowMinutes: number
): AIInsight {
  let parsed: Record<string, unknown>

  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('[Analysis] LLM returned invalid JSON, using fallback')
    return {
      emotions: [],
      summary: 'Analysis failed: could not parse LLM response',
      steps: ['Review the transcript manually'],
      module: '',
      riskFlag: false,
      generatedAt: Date.now(),
      transcriptWindowMinutes,
    }
  }

  const emotions = normalizeArray(parsed.emotions)
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const steps = normalizeArray(parsed.steps)
  const module = typeof parsed.module === 'string' ? parsed.module : ''
  const riskFlag = typeof parsed.riskFlag === 'boolean' ? parsed.riskFlag : false

  return {
    emotions,
    summary,
    steps,
    module,
    riskFlag,
    generatedAt: Date.now(),
    transcriptWindowMinutes,
  }
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .slice(0, 10)
}
