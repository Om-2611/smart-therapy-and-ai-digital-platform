import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import type { TranscriptChunk } from './types'

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

export async function appendTranscriptChunk(
  sessionId: string,
  chunk: TranscriptChunk
): Promise<void> {
  const ref = db.collection('sessions').doc(sessionId)

  await ref.set(
    {
      transcript: FieldValue.arrayUnion({
        text: chunk.text,
        speaker: chunk.speaker,
        timestamp: chunk.timestamp,
        sessionMinute: chunk.sessionMinute,
      }),
      transcriptLastUpdated: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

export async function getSessionTranscript(
  sessionId: string
): Promise<TranscriptChunk[]> {
  const ref = db.collection('sessions').doc(sessionId)
  const doc = await ref.get()
  if (!doc.exists) return []
  return (doc.data()?.transcript ?? []) as TranscriptChunk[]
}

export async function deleteSessionTranscript(
  sessionId: string
): Promise<void> {
  const ref = db.collection('sessions').doc(sessionId)
  const doc = await ref.get()
  if (!doc.exists) return
  await ref.update({
    transcript: FieldValue.delete(),
    transcriptLastUpdated: FieldValue.delete(),
  })
}

export async function checkAIConsent(
  sessionId: string
): Promise<boolean> {
  const ref = db.collection('sessions').doc(sessionId)
  const doc = await ref.get()
  if (!doc.exists) return false
  const consent = doc.data()?.aiConsent
  return consent?.therapist === true && consent?.client === true
}
