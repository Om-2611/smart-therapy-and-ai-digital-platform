import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Idempotent Admin init (matches src/lib/rag/transcript-store.ts).
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

export interface ModuleEvent {
  module: string
  type: string
  detail: string
  timestamp: number
}

export interface SessionNote {
  content: string
  timestamp: string
}

export interface TranscriptLine {
  text: string
  speaker: string
  timestamp: number
  sessionMinute?: number
}

export interface ReportInputs {
  transcript: TranscriptLine[]
  moduleEvents: ModuleEvent[]
  therapistNotes: SessionNote[]
}

// Everything the report needs lives on the single persistent `sessions/{id}`
// Firestore doc: the (English) transcript, the in-module activity timeline, and
// the therapist's in-call notes.
export async function getReportInputs(sessionId: string): Promise<ReportInputs> {
  const snap = await db.collection('sessions').doc(sessionId).get()
  const d = snap.exists ? snap.data() ?? {} : {}
  return {
    transcript: Array.isArray(d.transcript) ? (d.transcript as TranscriptLine[]) : [],
    moduleEvents: Array.isArray(d.moduleEvents) ? (d.moduleEvents as ModuleEvent[]) : [],
    therapistNotes: Array.isArray(d.therapistNotes) ? (d.therapistNotes as SessionNote[]) : [],
  }
}
