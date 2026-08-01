'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface NBackChallengeProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type StimulusType = 'colors' | 'shapes' | 'letters' | 'position'

const COLORS = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠']
const SHAPES = ['⬛', '⭕', '🔺', '⬟', '★', '♦']
const LETTERS = ['B', 'D', 'F', 'G', 'H', 'K']

function generateSequence(n: number, stimulusType: StimulusType, length: number): string[] {
  let pool: string[]
  if (stimulusType === 'colors') pool = COLORS
  else if (stimulusType === 'shapes') pool = SHAPES
  else if (stimulusType === 'letters') pool = LETTERS
  else pool = Array.from({ length: 9 }, (_, i) => `pos-${i}`)

  const seq: string[] = []
  const totalMatches = Math.round(length * 0.35)
  const matchIndices = new Set<number>()
  while (matchIndices.size < totalMatches) {
    const idx = n + Math.floor(Math.random() * (length - n))
    if (idx >= n) matchIndices.add(idx)
  }

  for (let i = 0; i < length; i++) {
    if (matchIndices.has(i) && i >= n) {
      seq.push(seq[i - n])
    } else {
      let item: string
      let attempts = 0
      do {
        item = pool[Math.floor(Math.random() * pool.length)]
        attempts++
      } while (
        attempts < 50 &&
        (item === seq[i - 1] || (i >= n && item === seq[i - n]))
      )
      seq.push(item)
    }
  }

  // Enforce constraints: no more than 3 consecutive matches, 4 non-matches
  for (let i = n; i < length; i++) {
    if (seq[i] === seq[i - n]) {
      let matchRun = 1
      for (let j = i - n; j >= n; j--) {
        if (seq[j] === seq[j - n]) matchRun++
        else break
      }
      if (matchRun > 3) {
        seq[i] = pool[Math.floor(Math.random() * pool.length)]
      }
    }
  }

  return seq
}

/* ===================== PRACTICE ROUND =====================
 * A short, always-1-back warm-up that is deliberately kept OUTSIDE the clinical
 * exercise. It has its own fixed sequence, its own local counters, and it never
 * writes nbHits / nbMisses / nbSequence / nbCurrentIndex — so nothing here can
 * reach the session's N-Back results. The only synced values are
 * nbPracticeActive / nbPracticeIndex, which exist purely so the therapist and
 * child are looking at the same warm-up item at the same time.
 *
 * The sequence is a FIXED pattern of pool indices rather than random, so both
 * browsers derive an identical practice sequence without syncing the items.
 * Matches (1-back) land at positions 2 and 5.
 */
const PRACTICE_POOL_INDICES = [0, 1, 1, 2, 0, 0]
const PRACTICE_N = 1
const PRACTICE_STEP_MS = 2600

function buildPracticeSequence(stimulusType: StimulusType): string[] {
  let pool: string[]
  if (stimulusType === 'colors') pool = COLORS
  else if (stimulusType === 'shapes') pool = SHAPES
  else if (stimulusType === 'letters') pool = LETTERS
  else pool = Array.from({ length: 9 }, (_, i) => `pos-${i}`)
  return PRACTICE_POOL_INDICES.map((i) => pool[i % pool.length])
}

function formatPosition(pos: string): { row: number; col: number } {
  const idx = parseInt(pos.replace('pos-', ''), 10)
  return { row: Math.floor(idx / 3), col: idx % 3 }
}

export default function NBackChallenge({ sessionId, role, isLocked }: NBackChallengeProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [n, setN] = useState(1)
  const [stimulusType, setStimulusType] = useState<StimulusType>('colors')
  const [speed, setSpeed] = useState(2000)
  const [seqLength, setSeqLength] = useState(15)
  const [isPlaying, setIsPlaying] = useState(false)
  const [sequence, setSequence] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [hits, setHits] = useState(0)
  // Onboarding is local-only (never written to Firestore) so each participant
  // dismisses it for themselves and the clinical state is untouched.
  const [showHowTo, setShowHowTo] = useState(true)
  const [misses, setMisses] = useState(0)
  const [feedback, setFeedback] = useState<{ type: 'correct' | 'wrong' | 'missed'; text: string } | null>(null)
  const [complete, setComplete] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  /* Practice-round state. practiceActive/practiceIdx mirror the two non-clinical
     Firestore fields; the score and feedback stay local and are never persisted. */
  const [practiceActive, setPracticeActive] = useState(false)
  const [practiceIdx, setPracticeIdx] = useState(-1)
  const [practiceHits, setPracticeHits] = useState(0)
  const [practiceTapped, setPracticeTapped] = useState<number[]>([])
  const [practiceFeedback, setPracticeFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const practiceTimer = useRef<ReturnType<typeof setInterval>>()
  const practiceFbTimer = useRef<ReturnType<typeof setTimeout>>()

  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const gameRef = useRef({ isPlaying, sequence, currentIndex, n, hits, misses })
  gameRef.current = { isPlaying, sequence, currentIndex, n, hits, misses }

  const writeToFirestore = useCallback(async (data: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        ...data,
        'timestamps.updatedAt': new Date().toISOString(),
      })
    } catch (err) {
      console.warn('[NBackChallenge] Firestore write failed', err)
    }
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const s = data.moduleState || {}
      if (typeof s.nbN === 'number') setN(s.nbN)
      if (typeof s.nbStimulusType === 'string') setStimulusType(s.nbStimulusType as StimulusType)
      if (typeof s.nbSpeed === 'number') setSpeed(s.nbSpeed)
      if (typeof s.nbLength === 'number') setSeqLength(s.nbLength)
      if (typeof s.nbIsPlaying === 'boolean') setIsPlaying(s.nbIsPlaying)
      if (Array.isArray(s.nbSequence)) setSequence(s.nbSequence)
      if (typeof s.nbCurrentIndex === 'number') {
        setCurrentIndex(s.nbCurrentIndex)
        setAnimKey((k) => k + 1)
      }
      if (typeof s.nbHits === 'number') setHits(s.nbHits)
      if (typeof s.nbMisses === 'number') setMisses(s.nbMisses)
      // Non-clinical warm-up coordination only.
      if (typeof s.nbPracticeActive === 'boolean') setPracticeActive(s.nbPracticeActive)
      if (typeof s.nbPracticeIndex === 'number') setPracticeIdx(s.nbPracticeIndex)
    })
    return () => unsub()
  }, [sessionId])

  // Therapist drives the timer
  useEffect(() => {
    if (!isTherapist || !isPlaying || sequence.length === 0 || currentIndex >= sequence.length) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
      return
    }

    timerRef.current = setInterval(() => {
      const { sequence, currentIndex, n } = gameRef.current
      const nextIdx = currentIndex + 1

      if (nextIdx >= sequence.length) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
        writeToFirestore({
          'moduleState.nbIsPlaying': false,
          'moduleState.nbCurrentIndex': sequence.length,
        })
        return
      }

      // Check if previous item was a match that should have been caught
      if (currentIndex >= n && sequence[currentIndex] === sequence[currentIndex - n]) {
        const { hits, misses: m } = gameRef.current
        writeToFirestore({
          'moduleState.nbCurrentIndex': nextIdx,
          'moduleState.nbMisses': m + 1,
        })
      } else {
        writeToFirestore({ 'moduleState.nbCurrentIndex': nextIdx })
      }
    }, speed)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isTherapist, isPlaying, sequence, currentIndex, speed, writeToFirestore])

  // Detect completion
  useEffect(() => {
    if (currentIndex >= sequence.length && sequence.length > 0) {
      setComplete(true)
    } else {
      setComplete(false)
    }
  }, [currentIndex, sequence.length])

  // Client missed-match detection
  useEffect(() => {
    if (isTherapist || currentIndex < n || currentIndex > sequence.length) return
    const prevIdx = currentIndex - 1
    if (prevIdx >= n && sequence[prevIdx] === sequence[prevIdx - n]) {
      setFeedback({ type: 'missed', text: 'Missed!' })
      setTimeout(() => setFeedback(null), 800)
    }
  }, [currentIndex, n, sequence, isTherapist])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const practiceSequence = buildPracticeSequence(stimulusType)
  const practiceItem = practiceIdx >= 0 && practiceIdx < practiceSequence.length ? practiceSequence[practiceIdx] : null
  const practiceRefItem = practiceIdx - PRACTICE_N >= 0 ? practiceSequence[practiceIdx - PRACTICE_N] : null
  const practiceFinished = practiceActive && practiceIdx >= practiceSequence.length
  const practiceIsMatch = !!practiceItem && practiceRefItem === practiceItem

  const startPractice = () => {
    if (!canInteract || isPlaying) return
    setPracticeHits(0)
    setPracticeTapped([])
    setPracticeFeedback(null)
    // Only the two warm-up fields are touched — no clinical state is written.
    writeToFirestore({ 'moduleState.nbPracticeActive': true, 'moduleState.nbPracticeIndex': 0 })
  }

  const endPractice = () => {
    if (practiceTimer.current) clearInterval(practiceTimer.current)
    writeToFirestore({ 'moduleState.nbPracticeActive': false, 'moduleState.nbPracticeIndex': -1 })
    setPracticeFeedback(null)
  }

  // Therapist advances the warm-up, mirroring how the real exercise is driven.
  useEffect(() => {
    if (!isTherapist || !practiceActive || practiceIdx < 0 || practiceIdx >= practiceSequence.length) {
      if (practiceTimer.current) {
        clearInterval(practiceTimer.current)
        practiceTimer.current = undefined
      }
      return
    }
    practiceTimer.current = setInterval(() => {
      setPracticeIdx((prev) => {
        const next = prev + 1
        writeToFirestore({ 'moduleState.nbPracticeIndex': next })
        return next
      })
    }, PRACTICE_STEP_MS)
    return () => {
      if (practiceTimer.current) {
        clearInterval(practiceTimer.current)
        practiceTimer.current = undefined
      }
    }
  }, [isTherapist, practiceActive, practiceIdx, practiceSequence.length, writeToFirestore])

  useEffect(() => () => {
    if (practiceTimer.current) clearInterval(practiceTimer.current)
    if (practiceFbTimer.current) clearTimeout(practiceFbTimer.current)
  }, [])

  const handlePracticePress = () => {
    if (!canInteract || !practiceItem || practiceTapped.includes(practiceIdx)) return
    setPracticeTapped((prev) => [...prev, practiceIdx])
    if (practiceIsMatch) {
      setPracticeHits((h) => h + 1)
      setPracticeFeedback({ ok: true, text: "Yes! That one came back — nice spotting." })
    } else {
      setPracticeFeedback({ ok: false, text: "Not this one — keep watching, you'll see a repeat soon." })
    }
    if (practiceFbTimer.current) clearTimeout(practiceFbTimer.current)
    practiceFbTimer.current = setTimeout(() => setPracticeFeedback(null), 1600)
  }

  const handleMatchPress = () => {
    if (!canInteract || !isPlaying || currentIndex < n || complete) return

    const { sequence, currentIndex: ci, hits, misses } = gameRef.current
    const isMatch = sequence[ci] === sequence[ci - n]

    if (isMatch) {
      setFeedback({ type: 'correct', text: '✓ Correct!' })
      setTimeout(() => setFeedback(null), 800)
      writeToFirestore({ 'moduleState.nbHits': hits + 1 })
    } else {
      setFeedback({ type: 'wrong', text: '✗ Not a match' })
      setTimeout(() => setFeedback(null), 800)
      writeToFirestore({ 'moduleState.nbMisses': misses + 1 })
    }
  }

  // Spacebar handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isPlaying && currentIndex >= n && !complete) {
        e.preventDefault()
        handleMatchPress()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTherapist, isPlaying, complete])

  const handleStart = () => {
    if (!isTherapist) return
    const seq = generateSequence(n, stimulusType, seqLength)
    setSequence(seq)
    setCurrentIndex(0)
    setHits(0)
    setMisses(0)
    setComplete(false)
    setFeedback(null)
    setAnimKey((k) => k + 1)

    writeToFirestore({
      'moduleState.nbIsPlaying': true,
      'moduleState.nbSequence': seq,
      'moduleState.nbCurrentIndex': 0,
      'moduleState.nbHits': 0,
      'moduleState.nbMisses': 0,
      // The warm-up never overlaps the real exercise.
      'moduleState.nbPracticeActive': false,
      'moduleState.nbPracticeIndex': -1,
    })
  }

  const handlePause = () => {
    if (!isTherapist) return
    if (timerRef.current) clearInterval(timerRef.current)
    writeToFirestore({ 'moduleState.nbIsPlaying': false })
  }

  const handleReset = () => {
    if (!isTherapist) return
    if (timerRef.current) clearInterval(timerRef.current)
    setSequence([])
    setCurrentIndex(-1)
    setHits(0)
    setMisses(0)
    setComplete(false)
    setFeedback(null)
    writeToFirestore({
      'moduleState.nbIsPlaying': false,
      'moduleState.nbSequence': [],
      'moduleState.nbCurrentIndex': -1,
      'moduleState.nbHits': 0,
      'moduleState.nbMisses': 0,
    })
  }

  const handleNChange = (val: number) => {
    setN(val)
    writeToFirestore({ 'moduleState.nbN': val })
  }

  const handleStimulusTypeChange = (val: StimulusType) => {
    setStimulusType(val)
    writeToFirestore({ 'moduleState.nbStimulusType': val })
  }

  const handleSpeedChange = (ms: number) => {
    setSpeed(ms)
    writeToFirestore({ 'moduleState.nbSpeed': ms })
  }

  const handleLengthChange = (len: number) => {
    setSeqLength(len)
    writeToFirestore({ 'moduleState.nbLength': len })
  }

  const currentStimulus = currentIndex >= 0 && currentIndex < sequence.length ? sequence[currentIndex] : null
  const isMatchable = currentIndex >= n && isPlaying
  const isCurrentMatch = isMatchable && currentStimulus && sequence[currentIndex - n] === currentStimulus

  // History trail
  const historyStart = Math.max(0, currentIndex - n)
  const historyItems: { item: string; idx: number }[] = []
  for (let i = historyStart; i < currentIndex && i < sequence.length; i++) {
    historyItems.push({ item: sequence[i], idx: i })
  }
  const matchRefIdx = currentIndex - n
  const matchRefItem = matchRefIdx >= 0 && matchRefIdx < sequence.length ? sequence[matchRefIdx] : null

  const stimTypeLabel = { colors: 'Colors', shapes: 'Shapes', letters: 'Letters', position: 'Position' }[stimulusType]
  const accuracy = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0

  // Log the working-memory result once per completed run (therapist browser only).
  const loggedDoneRef = useRef(false)
  useEffect(() => {
    if (complete && isTherapist && !loggedDoneRef.current) {
      loggedDoneRef.current = true
      logModuleEvent(sessionId, {
        module: 'n-back-challenge',
        type: 'completed',
        detail: `Completed a ${n}-back working-memory round (${stimTypeLabel}) with ${accuracy}% accuracy (${hits} hits, ${misses} misses)`,
      })
    }
    if (!complete) loggedDoneRef.current = false
  }, [complete, isTherapist, sessionId, n, stimTypeLabel, accuracy, hits, misses])

  const handleTryAgain = () => {
    handleStart()
  }

  const handleIncreaseN = () => {
    if (n < 3) {
      handleNChange(n + 1)
    }
    handleStart()
  }

  return (
    <>
      <style>{`
        @keyframes nbStimulusIn {
          0%   { transform: scale(0.6); opacity: 0 }
          70%  { transform: scale(1.1); opacity: 1 }
          100% { transform: scale(1);   opacity: 1 }
        }
        @keyframes nbFadeUp {
          0% { opacity: 0; transform: translateY(6px) }
          100% { opacity: 1; transform: translateY(0) }
        }
        @keyframes nbFeedbackOut {
          0% { opacity: 1 }
          100% { opacity: 0 }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          userSelect: 'none',
        }}
      >
        {/* TOP — Therapist Controls */}
        {isTherapist && (
          <div style={{
            flexShrink: 0,
            paddingBottom: 8,
            marginBottom: 8,
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            width: '100%',
            maxWidth: 1000,
            alignSelf: 'center',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            {/* N Level */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 170px' }}>
              {[1, 2, 3].map((val) => (
                <button
                  key={val}
                  onClick={() => handleNChange(val)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: n === val ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: n === val ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {val}-Back
                </button>
              ))}
            </div>

            {/* Stimulus type */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 170px' }}>
              {[
                { key: 'colors' as StimulusType, label: '🎨 Colors' },
                { key: 'shapes' as StimulusType, label: '🔷 Shapes' },
                { key: 'letters' as StimulusType, label: '🔤 Letters' },
                { key: 'position' as StimulusType, label: '📍 Position' },
              ].map((st) => (
                <button
                  key={st.key}
                  onClick={() => handleStimulusTypeChange(st.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 7,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: stimulusType === st.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: stimulusType === st.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Speed */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 170px' }}>
              {[
                { key: 3000, label: 'Slow' },
                { key: 2000, label: 'Normal' },
                { key: 1200, label: 'Fast' },
              ].map((sp) => (
                <button
                  key={sp.key}
                  onClick={() => handleSpeedChange(sp.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: speed === sp.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: speed === sp.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {sp.label}
                </button>
              ))}
            </div>

            {/* Sequence length */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 170px' }}>
              {[
                { key: 10, label: 'Short (10)' },
                { key: 15, label: 'Medium (15)' },
                { key: 20, label: 'Long (20)' },
              ].map((len) => (
                <button
                  key={len.key}
                  onClick={() => handleLengthChange(len.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: seqLength === len.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: seqLength === len.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {len.label}
                </button>
              ))}
            </div>

            {/* Start / Pause / Reset */}
            <div className="flex items-center" style={{ gap: 6, flex: '0 0 auto' }}>
              {isPlaying ? (
                <button
                  onClick={handlePause}
                  style={{
                    flex: 1,
                    padding: '6px 16px',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'rgba(200,96,42,0.16)',
                    color: '#c8602a',
                  }}
                >
                  ⏸ Pause
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={complete}
                  style={{
                    flex: 1,
                    padding: '6px 16px',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: complete ? 'default' : 'pointer',
                    opacity: complete ? 0.4 : 1,
                    background: 'rgba(74,124,111,0.18)',
                    color: '#2f6d5e',
                  }}
                >
                  ▶ Start
                </button>
              )}
              <button
                onClick={handleReset}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 9,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: 'rgba(0,0,0,0.05)',
                  color: '#6b7280',
                }}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        )}

        {/* Locked notice */}
        {!canInteract && (
          <div style={{ flexShrink: 0, fontSize: 9, color: '#8b9096', textAlign: 'center', paddingBottom: 4 }}>
            Therapist is controlling
          </div>
        )}

        {/* Waiting / N Level Indicator */}
        {!isPlaying && !currentStimulus && !complete && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontSize: 14,
                fontFamily: "'DM Serif Display', serif",
                color: '#2f6d5e',
                background: 'rgba(74,124,111,0.15)',
                border: '1px solid rgba(74,124,111,0.18)',
                borderRadius: 20,
                padding: '4px 14px',
              }}
            >
              {n}-Back
            </div>
            <span style={{ fontSize: 11, color: '#8b9096' }}>
              {isTherapist ? 'Configure and press Start' : 'Waiting for therapist to start...'}
            </span>
          </div>
        )}

        {/* HOW TO PLAY — shown before the first round.
            N-Back is abstract by nature, and the module previously started with no
            explanation of the task at all: a shape appeared, an unlabelled "MATCH
            (Space)" button sat below it, and nothing said what to compare against.
            This is a plain-language walkthrough with a worked example. It changes
            no clinical parameter — purely an explanation shown before play. */}
        {showHowTo && !isPlaying && !complete && !practiceActive && (
          <div
            style={{
              flexShrink: 0,
              // The idle "Configure and press Start" block is flex: 1 and would
              // push this below the fold; order pulls the explanation to the top
              // of the column where it is actually read.
              order: -1,
              margin: '0 auto 8px',
              width: '100%',
              maxWidth: 760,
              maxHeight: '100%',
              overflowY: 'auto',
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(74,124,111,0.12)',
              border: '1px solid rgba(74,124,111,0.18)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2f6d5e' }}>How to play</span>
              <button
                onClick={() => setShowHowTo(false)}
                style={{ background: 'none', border: 'none', color: '#7c8188', cursor: 'pointer', fontSize: 10, padding: 0 }}
              >
                Hide ✕
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#43484f', lineHeight: 1.6, marginBottom: 8 }}>
              {stimulusType === 'position' ? 'A square lights up' : 'One picture shows'} one at a time.
              <br />
              Tap <strong style={{ color: '#2f6d5e' }}>Same as before!</strong> whenever it matches the one{' '}
              {n === 1 ? 'right before it' : `${n} turns earlier`}.
            </div>

            {/* Worked example: four turns, with the match called out. */}
            <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>
              Example ({n}-back):
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
              {(() => {
                // Build a tiny illustration where turn 3 repeats turn (3 - n).
                const demo = ['🍎', '⭐', '🍎', '🌙']
                const matchAt = 2
                return demo.map((g, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        background: i === matchAt ? 'rgba(74,124,111,0.22)' : 'rgba(0,0,0,0.05)',
                        border: i === matchAt ? '1.5px solid #4a7c6f' : '1px solid rgba(0,0,0,0.08)',
                      }}
                    >
                      {g}
                    </div>
                    <div style={{ fontSize: 7, marginTop: 2, color: i === matchAt ? '#2f6d5e' : 'rgba(0,0,0,0.22)' }}>
                      {i === matchAt ? 'TAP!' : `turn ${i + 1}`}
                    </div>
                  </div>
                ))
              })()}
              <div style={{ fontSize: 9, color: '#6b7280', paddingBottom: 12, lineHeight: 1.4 }}>
                🍎 came back, so tap on turn 3.
              </div>
            </div>

            <div style={{ fontSize: 9, color: '#8b9096', marginTop: 8, lineHeight: 1.5 }}>
              The first {n} turn{n > 1 ? 's' : ''} {n > 1 ? 'have' : 'has'} nothing to compare with yet —
              just watch. Nothing bad happens if you miss one.
            </div>

            {!practiceActive && (
              <button
                onClick={startPractice}
                disabled={!canInteract || isPlaying}
                style={{
                  width: '100%',
                  marginTop: 9,
                  padding: '8px 0',
                  borderRadius: 10,
                  border: '1px solid rgba(247,201,72,0.5)',
                  background: 'rgba(247,201,72,0.16)',
                  color: '#f7c948',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: canInteract && !isPlaying ? 'pointer' : 'default',
                  opacity: canInteract && !isPlaying ? 1 : 0.45,
                }}
              >
                Let&apos;s practice first! (doesn&apos;t count)
              </button>
            )}
          </div>
        )}

        {/* ============ PRACTICE ROUND — separate from the exercise ============
            Own fixed 1-back sequence, own local score, amber dashed styling and
            explicit "does not count" labelling so it cannot be mistaken for the
            real thing. Nothing in this block writes a clinical field. */}
        {practiceActive && (
          <div
            style={{
              flexShrink: 0,
              order: -1,
              margin: '0 0 8px',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(247,201,72,0.10)',
              border: '1px dashed rgba(247,201,72,0.55)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#f7c948' }}>
                Practice round · 1-back
              </span>
              <span style={{ fontSize: 9, color: 'rgba(247,201,72,0.75)' }}>
                does not count towards results
              </span>
            </div>

            {!practiceFinished ? (
              <>
                <div style={{ fontSize: 10, color: '#5b6169', marginBottom: 8, lineHeight: 1.5 }}>
                  Tap the button when the picture is the same as the one right before it.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {practiceItem ? (
                    stimulusType === 'position' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gridTemplateRows: 'repeat(3, 30px)', gap: 3 }}>
                        {Array.from({ length: 9 }, (_, i) => {
                          const { row, col } = formatPosition(practiceItem)
                          const active = row * 3 + col === i
                          return (
                            <div
                              key={i}
                              style={{
                                borderRadius: 6,
                                background: active ? 'rgba(247,201,72,0.55)' : 'rgba(0,0,0,0.05)',
                                border: active ? '2px solid #f7c948' : '1px solid rgba(0,0,0,0.08)',
                              }}
                            />
                          )
                        })}
                      </div>
                    ) : (
                      <div
                        key={practiceIdx}
                        style={{
                          width: 74,
                          height: 74,
                          borderRadius: 14,
                          background: 'rgba(0,0,0,0.06)',
                          border: '2px solid rgba(247,201,72,0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 38,
                          animation: 'nbStimulusIn 0.3s ease',
                        }}
                      >
                        {practiceItem}
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.24)', height: 74, display: 'flex', alignItems: 'center' }}>
                      Get ready…
                    </div>
                  )}

                  <div style={{ fontSize: 9, color: '#7c8188' }}>
                    {practiceRefItem
                      ? stimulusType === 'position'
                        ? 'compare with the square before'
                        : `the one before was ${practiceRefItem}`
                      : 'first one — nothing to compare yet'}
                  </div>
                </div>

                <button
                  onClick={handlePracticePress}
                  disabled={!canInteract || !practiceItem || practiceTapped.includes(practiceIdx)}
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 12,
                    background: practiceFeedback
                      ? practiceFeedback.ok
                        ? 'rgba(74,124,111,0.45)'
                        : 'rgba(200,96,42,0.35)'
                      : 'rgba(247,201,72,0.2)',
                    border: `2px solid ${practiceFeedback ? (practiceFeedback.ok ? 'rgba(74,124,111,0.7)' : 'rgba(200,96,42,0.6)') : 'rgba(247,201,72,0.5)'}`,
                    color: practiceFeedback ? (practiceFeedback.ok ? '#6ba395' : '#e8a87c') : '#f7c948',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: canInteract && practiceItem ? 'pointer' : 'default',
                  }}
                >
                  Same as before!
                </button>

                {practiceFeedback && (
                  <div style={{ marginTop: 6, fontSize: 10, textAlign: 'center', color: practiceFeedback.ok ? '#6ba395' : '#e8a87c' }}>
                    {practiceFeedback.text}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f7c948', marginBottom: 4 }}>
                  Practice done — you spotted {practiceHits} of 2
                </div>
                <div style={{ fontSize: 10, color: '#646a72', lineHeight: 1.5, marginBottom: 8 }}>
                  {practiceHits >= 2
                    ? 'You have got it. The real round works exactly the same way.'
                    : 'That is fine — the real round works the same way, and there is no rush.'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={startPractice}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 10,
                      border: '1px solid rgba(0,0,0,0.10)', background: 'transparent',
                      color: '#5b6169', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Practice again
                  </button>
                  <button
                    onClick={endPractice}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 10,
                      border: '1px solid rgba(74,124,111,0.6)', background: 'rgba(74,124,111,0.25)',
                      color: '#2f6d5e', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    I&apos;m ready
                  </button>
                </div>
              </div>
            )}

            {!practiceFinished && (
              <button
                onClick={endPractice}
                style={{
                  width: '100%', marginTop: 7, padding: '5px 0', borderRadius: 8,
                  border: 'none', background: 'transparent',
                  color: '#8b9096', fontSize: 9, cursor: 'pointer',
                }}
              >
                Skip practice
              </button>
            )}
          </div>
        )}

        {/* Game active */}
        {(isPlaying || currentStimulus) && !complete && (
          <>
            {/* N indicator */}
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 14,
                  fontFamily: "'DM Serif Display', serif",
                  color: '#2f6d5e',
                  background: 'rgba(74,124,111,0.15)',
                  border: '1px solid rgba(74,124,111,0.18)',
                  borderRadius: 20,
                  padding: '4px 14px',
                  display: 'inline-block',
                }}
              >
                {n}-Back
              </div>
            </div>

            {/* MIDDLE — Stimulus Display */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 0 }}>
              {/* Main stimulus */}
              {currentStimulus && (
                <div
                  key={animKey}
                  style={{
                    animation: 'nbStimulusIn 0.3s ease',
                  }}
                >
                  {stimulusType === 'position' ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, clamp(56px, 7vh, 68px))',
                        gridTemplateRows: 'repeat(3, clamp(56px, 7vh, 68px))',
                        gap: 4,
                      }}
                    >
                      {Array.from({ length: 9 }, (_, i) => {
                        const { row, col } = formatPosition(`pos-${i}`)
                        const isActive = currentStimulus === `pos-${i}`
                        return (
                          <div
                            key={i}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: 8,
                              background: isActive ? 'rgba(74,124,111,0.25)' : 'rgba(0,0,0,0.05)',
                              border: isActive ? '2px solid #4a7c6f' : '1px solid rgba(0,0,0,0.08)',
                              transition: 'all 0.15s',
                            }}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        // Scales with the canvas: on the wide stage a fixed
                        // 120px box left the task tiny in a large empty area.
                        width: 'clamp(120px, 22vh, 210px)',
                        height: 'clamp(120px, 22vh, 210px)',
                        borderRadius: 20,
                        background: 'rgba(0,0,0,0.06)',
                        border: '2px solid rgba(0,0,0,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'clamp(64px, 12vh, 110px)',
                      }}
                    >
                      {currentStimulus}
                    </div>
                  )}
                </div>
              )}

              {/* Is it a match? */}
              {!currentStimulus && (
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.22)' }}>
                  Get ready...
                </div>
              )}

              {/* History trail */}
              {historyItems.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 10,
                    maxWidth: '100%',
                  }}
                >
                  {historyItems.map((h, i) => {
                    const isRef = h.idx === matchRefIdx
                    return (
                      <div
                        key={h.idx}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: stimulusType === 'position' ? 0 : 12,
                          opacity: isRef ? 0.55 : 0.3,
                          border: isRef ? '1.5px solid rgba(74,124,111,0.25)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {stimulusType === 'position' ? '' : h.item}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Hint text */}
              {matchRefItem && (
                <div style={{ fontSize: 10, color: '#7c8188', textAlign: 'center', lineHeight: 1.4 }}>
                  Is this the same as {n === 1 ? 'the one just before' : `${n} turns ago`}?
                  <br />
                  <span style={{ opacity: 0.65 }}>
                    (the circled one below is the one to compare with)
                  </span>
                </div>
              )}
            </div>

            {/* BOTTOM — Match Button + Score */}
            <div style={{ flexShrink: 0, width: '100%', maxWidth: 760, margin: '0 auto' }}>
              {/* Match button */}
              {/* Previously client-only, so a therapist demonstrating the task
                  saw no button at all and nothing to explain. */}
              {(
                <button
                  onClick={handleMatchPress}
                  disabled={!canInteract || !isMatchable || !isPlaying}
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 14,
                    background: feedback?.type === 'correct'
                      ? 'rgba(74,124,111,0.25)'
                      : feedback?.type === 'wrong'
                        ? 'rgba(200,96,42,0.4)'
                        : 'rgba(74,124,111,0.25)',
                    border: feedback?.type === 'correct'
                      ? '2px solid rgba(74,124,111,0.7)'
                      : feedback?.type === 'wrong'
                        ? '2px solid rgba(200,96,42,0.6)'
                        : '2px solid rgba(74,124,111,0.22)',
                    color: feedback?.type === 'correct' ? '#6ba395' : feedback?.type === 'wrong' ? '#c8602a' : '#2f6d5e',
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: canInteract && isMatchable && isPlaying ? 'pointer' : 'default',
                    opacity: canInteract && isMatchable && isPlaying ? 1 : 0.3,
                    transition: 'all 0.15s',
                    marginBottom: 8,
                  }}
                >
                  {isMatchable ? 'Same as before!' : 'Watch and wait…'}
                </button>
              )}

              {/* Feedback */}
              {feedback && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 500,
                    color: feedback.type === 'correct' ? '#6ba395' : feedback.type === 'wrong' ? '#c8602a' : '#f7c948',
                    marginBottom: 4,
                    animation: 'nbFeedbackOut 0.8s ease forwards',
                  }}
                >
                  {feedback.text}
                </div>
              )}

              {/* Score panel */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  paddingTop: 6,
                  borderTop: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                <span style={{ fontSize: 11, color: 'rgba(74,124,111,0.9)' }}>
                  ✓ {hits} Hits
                </span>
                <span style={{ fontSize: 11, color: 'rgba(200,96,42,0.8)' }}>
                  ✗ {misses} Misses
                </span>
                <span style={{ fontSize: 11, color: '#5b6169' }}>
                  % {accuracy} Accuracy
                </span>
              </div>
            </div>
          </>
        )}

        {/* Session Complete */}
        {complete && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                background: 'rgba(0,0,0,0.06)',
                border: '1px solid rgba(0,0,0,0.07)',
                borderRadius: 16,
                padding: '20px 24px',
                textAlign: 'center',
                maxWidth: 260,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#2b2f33', marginBottom: 8 }}>
                Session Complete!
              </div>
              <div style={{ fontSize: 13, color: '#4a5057', marginBottom: 12 }}>
                {n}-Back · {stimTypeLabel} · {seqLength} items
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(74,124,111,0.9)' }}>{hits}</div>
                  <div style={{ fontSize: 10, color: '#8b9096' }}>Hits</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(200,96,42,0.8)' }}>{misses}</div>
                  <div style={{ fontSize: 10, color: '#8b9096' }}>Misses</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#3d4348' }}>{accuracy}%</div>
                  <div style={{ fontSize: 10, color: '#8b9096' }}>Accuracy</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#5b6169' }}>
                {accuracy >= 70 ? 'Well done! 🎉' : 'Keep practising 💪'}
              </div>
            </div>

            {isTherapist && (
              <div className="flex items-center" style={{ gap: 6 }}>
                <button
                  onClick={handleTryAgain}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 10,
                    border: 'none',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'rgba(74,124,111,0.18)',
                    color: '#2f6d5e',
                  }}
                >
                  Try Again
                </button>
                {n < 3 && (
                  <button
                    onClick={handleIncreaseN}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 10,
                      border: '1px solid rgba(74,124,111,0.18)',
                      fontSize: 9,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'transparent',
                      color: 'rgba(74,124,111,0.7)',
                    }}
                  >
                    Increase N ({n + 1}-Back)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
