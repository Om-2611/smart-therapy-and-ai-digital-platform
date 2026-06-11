import { NextResponse } from 'next/server'
import { runAnalysis } from '@/lib/rag/analysis'
import { checkAIConsent, getSessionTranscript } from '@/lib/rag/transcript-store'
import type { ClientProfile } from '@/lib/rag/retrieval'
import type { AIInsight } from '@/lib/rag/types'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { sessionId, therapistId, clientProfile, transcriptWindowMinutes } = body

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'sessionId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!therapistId || typeof therapistId !== 'string') {
      return NextResponse.json(
        { error: 'therapistId is required and must be a string' },
        { status: 400 }
      )
    }

    if (!clientProfile || typeof clientProfile !== 'object') {
      return NextResponse.json(
        { error: 'clientProfile is required and must be an object' },
        { status: 400 }
      )
    }

    const profile: ClientProfile = {
      clientId: String(clientProfile.clientId ?? ''),
      name: String(clientProfile.name ?? 'Unknown'),
      age: Number(clientProfile.age ?? 0),
      conditions: Array.isArray(clientProfile.conditions)
        ? clientProfile.conditions.map(String)
        : [],
      sessionNumber: Number(clientProfile.sessionNumber ?? 1),
      therapistId,
    }

    if (!profile.clientId) {
      return NextResponse.json(
        { error: 'clientProfile.clientId is required' },
        { status: 400 }
      )
    }

    const consent = await checkAIConsent(sessionId)
    if (!consent) {
      return NextResponse.json(
        {
          error: 'AI analysis not consented',
          detail: 'Both therapist and client must consent to AI analysis',
        },
        { status: 403 }
      )
    }

    const existingTranscript = await getSessionTranscript(sessionId)
    if (existingTranscript.length === 0) {
      return NextResponse.json(
        { error: 'No transcript data found for this session' },
        { status: 404 }
      )
    }

    const insight: AIInsight = await runAnalysis({
      sessionId,
      therapistId,
      clientProfile: profile,
      transcriptWindowMinutes: transcriptWindowMinutes ?? 5,
    })

    const { getFirestore } = await import('firebase-admin/firestore')
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      })
    }

    const db = getFirestore()
    await db.collection('sessions').doc(sessionId).set(
      {
        aiInsight: insight,
        aiInsightGeneratedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    return NextResponse.json({ insight })
  } catch (error: any) {
    console.error('AI insight generation error:', error)
    return NextResponse.json(
      { error: error.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
