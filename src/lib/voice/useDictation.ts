'use client'

// Speech-to-text for the module text fields ("talk instead of typing").
//
// This is the input counterpart to staadVoice.ts, which only ever did output
// (speech synthesis). It uses the browser's own SpeechRecognition — the same
// Web Speech API family staadVoice already depends on — so it needs no token,
// no server round-trip and no new key. That also means it is Chrome/Edge only;
// `supported` is false elsewhere and callers hide the button.
//
// It is deliberately NOT the Sarvam pipeline in useSessionTranscription: that
// one transcribes the whole session off the LiveKit track into the session
// record. This is a short, user-initiated dictation bound to one input.

import { useCallback, useEffect, useRef, useState } from 'react'
import { staadCancel, type VoiceLanguage } from './staadVoice'

/* The Web Speech API is not in TypeScript's DOM lib, so the slice we use is
   typed here rather than pulling in a dependency for four fields. */
interface SpeechRecognitionAlternativeLike { transcript: string }
interface SpeechRecognitionResultLike {
  readonly length: number
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike { results: SpeechRecognitionResultListLike }
interface SpeechRecognitionErrorEventLike { error: string }
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/* Only one field may hold the microphone at a time. Without this, clicking a
   second mic (Thought Challenger has three inputs) leaves two recognisers
   fighting over the same device and both return empty results. */
let activeStop: (() => void) | null = null

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone blocked — allow it in the browser address bar.',
  'service-not-allowed': 'Microphone blocked — allow it in the browser address bar.',
  'audio-capture': 'No microphone found.',
  network: 'Speech service unreachable — check your connection.',
}

export interface UseDictationOptions {
  /** Voice language for the session; recognition follows the same EN/HI/TE switch as speech output. */
  language: VoiceLanguage
  /** Receives the full replacement text for the field on every update. */
  onText: (next: string) => void
  /** Reads the field's value at the moment dictation starts. */
  getBaseText: () => string
}

export function useDictation({ language, onText, getBaseText }: UseDictationOptions) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)

  const recogRef = useRef<SpeechRecognitionLike | null>(null)
  const baseRef = useRef('')
  // Intent, as opposed to the recogniser's actual state: Chrome ends a session
  // on its own after a silence, and we restart while the user still wants it on.
  const wantRef = useRef(false)

  // Latest callbacks, so the recogniser's handlers never close over stale ones.
  const onTextRef = useRef(onText)
  const getBaseRef = useRef(getBaseText)
  useEffect(() => { onTextRef.current = onText }, [onText])
  useEffect(() => { getBaseRef.current = getBaseText }, [getBaseText])

  useEffect(() => { setSupported(getCtor() !== null) }, [])

  // Mirrors `stop` so the singleton bookkeeping and the unmount cleanup can
  // reach it without either depending on the other's declaration order.
  const stopRefHolder = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    wantRef.current = false
    setListening(false)
    if (activeStop === stopRefHolder.current) activeStop = null
    const r = recogRef.current
    recogRef.current = null
    if (r) {
      r.onresult = null
      r.onerror = null
      r.onend = null
      try { r.stop() } catch { /* already stopped */ }
    }
  }, [])

  useEffect(() => { stopRefHolder.current = stop }, [stop])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError('Speech input is not supported in this browser.')
      return
    }
    // Whoever else held the mic loses it.
    activeStop?.()
    // A module reading an instruction aloud would otherwise dictate itself.
    staadCancel()

    setError(null)
    baseRef.current = getBaseRef.current()
    wantRef.current = true

    const recog = new Ctor()
    recog.lang = language
    recog.continuous = true
    recog.interimResults = true
    recog.maxAlternatives = 1

    recog.onresult = (e) => {
      let spoken = ''
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i][0]
        if (alt?.transcript) spoken += alt.transcript
      }
      spoken = spoken.trim()
      if (!spoken) return
      const base = baseRef.current.trimEnd()
      onTextRef.current(base ? `${base} ${spoken}` : spoken)
    }

    recog.onerror = (e) => {
      // A silence timeout is not a failure worth showing; everything else is.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setError(MESSAGES[e.error] ?? 'Could not hear you — try again.')
      wantRef.current = false
      setListening(false)
    }

    recog.onend = () => {
      if (!wantRef.current) { setListening(false); return }
      // Chrome ends the session after a pause. Carry the text dictated so far
      // into the new base, otherwise the restart overwrites it.
      baseRef.current = getBaseRef.current()
      try { recog.start() } catch { setListening(false); wantRef.current = false }
    }

    recogRef.current = recog
    try {
      recog.start()
      activeStop = stopRefHolder.current
      setListening(true)
    } catch {
      setError('Could not start the microphone.')
      wantRef.current = false
      setListening(false)
    }
  }, [language])

  const toggle = useCallback(() => {
    if (wantRef.current) stop()
    else start()
  }, [start, stop])

  // Leaving the module (or the field disappearing) must release the mic.
  useEffect(() => () => { stopRefHolder.current?.() }, [])

  const clearError = useCallback(() => setError(null), [])

  return { listening, error, supported, start, stop, toggle, clearError }
}
