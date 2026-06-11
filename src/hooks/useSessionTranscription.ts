'use client'
import { useEffect, useRef, useCallback, useState } from 'react'
import { Track } from 'livekit-client'
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

export function useSessionTranscription({
  sessionId,
  enabled,
  userRole,
}: UseSessionTranscriptionOptions) {
  const { room } = useSessionRoom()
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const startTimeRef = useRef<number>(0)
  const [state, setState] = useState<TranscriptionState>({
    isRecording: false,
    error: null,
    chunkCount: 0,
  })
  const shouldRun = enabled && userRole === 'therapist'

  const stopTranscription = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setState(s => ({ ...s, isRecording: false }))
    console.log('[Transcription] Stopped')
  }, [])

  const startAudioCapture = useCallback(() => {
    if (!room) return
    try {
      const audioTracks: MediaStreamTrack[] = []
      const localMic = room.localParticipant
        .getTrackPublication(Track.Source.Microphone)
        ?.track?.mediaStreamTrack
      if (localMic) audioTracks.push(localMic)

      room.remoteParticipants.forEach((participant) => {
        const audioTrack = participant
          .getTrackPublication(Track.Source.Microphone)
          ?.track?.mediaStreamTrack
        if (audioTrack) audioTracks.push(audioTrack)
      })

      if (audioTracks.length === 0) {
        console.warn('[Transcription] No audio tracks found')
        return
      }

      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const mixedStream = new MediaStream(audioTracks)
      const source = audioContext.createMediaStreamSource(mixedStream)
      sourceRef.current = source

      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        wsRef.current.send(int16.buffer)
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      console.log('[Transcription] Audio capture started \u2014 ' + audioTracks.length + ' track(s)')
    } catch (e) {
      console.error('[Transcription] Audio capture failed:', e)
      setState(s => ({ ...s, error: String(e) }))
    }
  }, [room])

  const startTranscription = useCallback(async () => {
    if (!shouldRun || wsRef.current || !room) return
    try {
      const tokenRes = await fetch('/api/deepgram-token', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + room.localParticipant.identity,
          'content-type': 'application/json',
        },
      })
      if (!tokenRes.ok) throw new Error('Failed to get transcription token')
      const { token } = await tokenRes.json()

      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'en-IN',
        smart_format: 'true',
        diarize: 'true',
        interim_results: 'false',
        utterance_end_ms: '1500',
        vad_events: 'true',
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      })

      const ws = new WebSocket('wss://api.deepgram.com/v1/listen?' + params, ['token', token])
      wsRef.current = ws
      startTimeRef.current = Date.now()

      ws.onopen = () => {
        console.log('[Transcription] WebSocket open')
        setState(s => ({ ...s, isRecording: true, error: null }))
        startAudioCapture()
      }

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type !== 'Results') return
          if (!data.is_final) return

          const alt = data.channel?.alternatives?.[0]
          if (!alt?.transcript?.trim()) return

          const words = alt.words ?? []
          const speakerNum = words[0]?.speaker ?? null
          const speaker: TranscriptChunk['speaker'] =
            speakerNum === 0 ? 'therapist' :
            speakerNum === 1 ? 'client' : 'unknown'

          const chunk: TranscriptChunk = {
            text: alt.transcript.trim(),
            speaker,
            timestamp: Date.now(),
            sessionMinute: Math.floor((Date.now() - startTimeRef.current) / 60000),
            isFinal: true,
          }

          await updateDoc(doc(db, 'sessions', sessionId), {
            transcript: arrayUnion({
              text: chunk.text,
              speaker: chunk.speaker,
              timestamp: chunk.timestamp,
              sessionMinute: chunk.sessionMinute,
            }),
            transcriptLastUpdated: serverTimestamp(),
          })

          setState(s => ({ ...s, chunkCount: s.chunkCount + 1 }))
          console.log('[Transcription] [' + chunk.speaker + ']: ' + chunk.text.slice(0, 50) + '...')
        } catch (e) {
          console.warn('[Transcription] Message parse error:', e)
        }
      }

      ws.onerror = (e) => {
        console.error('[Transcription] WebSocket error:', e)
        setState(s => ({ ...s, error: 'Transcription connection error', isRecording: false }))
      }

      ws.onclose = () => {
        console.log('[Transcription] WebSocket closed')
        setState(s => ({ ...s, isRecording: false }))
      }
    } catch (e) {
      console.error('[Transcription] Start failed:', e)
      setState(s => ({ ...s, error: String(e), isRecording: false }))
    }
  }, [shouldRun, room, sessionId, startAudioCapture])

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
