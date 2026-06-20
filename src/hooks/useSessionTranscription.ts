'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { Track, RoomEvent, RemoteParticipant, RemoteTrack } from 'livekit-client'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useSessionRoom } from '@/components/StaadVideo'
import type { TranscriptChunk } from '@/lib/rag/types'

interface UseSessionTranscriptionOptions {
  sessionId: string
  enabled: boolean
  userRole: 'therapist' | 'client'
}

interface TranscriptionState {
  isRecording: boolean
  error: string | null
  chunkCount: number
}

// One independent Sarvam pipeline per participant audio track. Because each
// track belongs to a known participant, we tag the speaker directly instead of
// relying on probabilistic diarization.
interface Pipe {
  ws: WebSocket
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
}

const SARVAM_WS = 'wss://api.sarvam.ai/speech-to-text/ws'

// Sarvam streaming audio chunks are base64-encoded PCM (s16le) wrapped in JSON.
function pcmToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  const block = 0x8000
  for (let i = 0; i < bytes.length; i += block) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + block) as unknown as number[]
    )
  }
  return btoa(binary)
}

export function useSessionTranscription({
  sessionId,
  enabled,
  userRole,
}: UseSessionTranscriptionOptions) {
  const { room } = useSessionRoom()
  const pipesRef = useRef<Map<string, Pipe>>(new Map())
  const keyRef = useRef<string | null>(null)
  const startTimeRef = useRef<number>(0)
  const startedRef = useRef(false)
  const [state, setState] = useState<TranscriptionState>({
    isRecording: false,
    error: null,
    chunkCount: 0,
  })
  const shouldRun = enabled && userRole === 'therapist'

  const writeChunk = useCallback(
    async (text: string, speaker: TranscriptChunk['speaker']) => {
      const clean = text.trim()
      if (!clean) return
      const chunk: TranscriptChunk = {
        text: clean,
        speaker,
        timestamp: Date.now(),
        sessionMinute: Math.floor((Date.now() - startTimeRef.current) / 60000),
        isFinal: true,
      }
      try {
        await updateDoc(doc(db, 'sessions', sessionId), {
          transcript: arrayUnion({
            text: chunk.text,
            speaker: chunk.speaker,
            timestamp: chunk.timestamp,
            sessionMinute: chunk.sessionMinute,
          }),
          transcriptLastUpdated: serverTimestamp(),
        })
        setState((s) => ({ ...s, chunkCount: s.chunkCount + 1 }))
      } catch (e) {
        console.warn('[Transcription] Firestore write failed:', e)
      }
    },
    [sessionId]
  )

  const stopPipe = useCallback((key: string) => {
    const pipe = pipesRef.current.get(key)
    if (!pipe) return
    try { pipe.processor.disconnect() } catch {}
    try { pipe.source.disconnect() } catch {}
    try { pipe.ctx.close() } catch {}
    try { pipe.ws.close() } catch {}
    pipesRef.current.delete(key)
  }, [])

  // Open a Sarvam socket + audio graph for one participant track.
  const startPipe = useCallback(
    (key: string, track: MediaStreamTrack, speaker: TranscriptChunk['speaker']) => {
      if (pipesRef.current.has(key) || !keyRef.current) return

      // translate mode → English out; language auto-detected (multilingual).
      const params = new URLSearchParams({
        'api-subscription-key': keyRef.current,
        model: 'saaras:v3',
        mode: 'translate',
        high_vad_sensitivity: 'true',
        vad_signals: 'true',
      })
      const ws = new WebSocket(`${SARVAM_WS}?${params.toString()}`)

      const ctx = new AudioContext({ sampleRate: 16000 })
      const source = ctx.createMediaStreamSource(new MediaStream([track]))
      const processor = ctx.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        ws.send(
          JSON.stringify({
            audio: {
              data: pcmToBase64(int16),
              sample_rate: '16000',
              encoding: 'audio/wav',
            },
          })
        )
      }

      ws.onopen = () => {
        source.connect(processor)
        processor.connect(ctx.destination)
        setState((s) => ({ ...s, isRecording: true, error: null }))
        console.log(`[Transcription] Pipe open (${speaker})`)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type !== 'data') return
          const text: string = msg.data?.transcript || msg.data?.translation || ''
          if (text.trim()) writeChunk(text, speaker)
        } catch (e) {
          console.warn('[Transcription] Parse error:', e)
        }
      }

      ws.onerror = () => {
        setState((s) => ({ ...s, error: 'Transcription connection error' }))
      }

      ws.onclose = () => {
        console.log(`[Transcription] Pipe closed (${speaker})`)
      }

      pipesRef.current.set(key, { ws, ctx, source, processor })
    },
    [writeChunk]
  )

  const addRemoteMic = useCallback(
    (participant: RemoteParticipant) => {
      const track = participant
        .getTrackPublication(Track.Source.Microphone)
        ?.track?.mediaStreamTrack
      if (track) startPipe(participant.identity, track, 'client')
    },
    [startPipe]
  )

  const stopTranscription = useCallback(() => {
    for (const key of Array.from(pipesRef.current.keys())) stopPipe(key)
    startedRef.current = false
    setState((s) => ({ ...s, isRecording: false }))
    console.log('[Transcription] Stopped')
  }, [stopPipe])

  const startTranscription = useCallback(async () => {
    if (!shouldRun || !room || startedRef.current) return
    startedRef.current = true
    try {
      const res = await fetch('/api/sarvam-token', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + room.localParticipant.identity,
          'content-type': 'application/json',
        },
      })
      if (!res.ok) throw new Error('Failed to get transcription key')
      const { key } = await res.json()
      keyRef.current = key
      startTimeRef.current = Date.now()

      // Local mic = therapist (this hook only runs in the therapist browser).
      const localMic = room.localParticipant
        .getTrackPublication(Track.Source.Microphone)
        ?.track?.mediaStreamTrack
      if (localMic) startPipe('local', localMic, 'therapist')

      // Existing remote mics = client(s).
      room.remoteParticipants.forEach((p) => addRemoteMic(p))
    } catch (e) {
      console.error('[Transcription] Start failed:', e)
      startedRef.current = false
      setState((s) => ({ ...s, error: String(e), isRecording: false }))
    }
  }, [shouldRun, room, startPipe, addRemoteMic])

  // Attach a client pipe if the remote mic arrives after we start.
  useEffect(() => {
    if (!shouldRun || !room) return
    const onSubscribed = (
      track: RemoteTrack,
      _pub: unknown,
      participant: RemoteParticipant
    ) => {
      if (track.source === Track.Source.Microphone && keyRef.current) {
        addRemoteMic(participant)
      }
    }
    const onLeft = (participant: RemoteParticipant) => stopPipe(participant.identity)
    room.on(RoomEvent.TrackSubscribed, onSubscribed)
    room.on(RoomEvent.ParticipantDisconnected, onLeft)
    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed)
      room.off(RoomEvent.ParticipantDisconnected, onLeft)
    }
  }, [shouldRun, room, addRemoteMic, stopPipe])

  useEffect(() => {
    if (!shouldRun || !room) return
    if (room.state !== 'connected') return
    startTranscription()
    return () => { stopTranscription() }
  }, [shouldRun, room?.state, startTranscription, stopTranscription])

  useEffect(() => {
    return () => stopTranscription()
  }, [stopTranscription])

  return {
    ...state,
    stop: stopTranscription,
    start: startTranscription,
  }
}
