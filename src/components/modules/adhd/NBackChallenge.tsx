'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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
  const [misses, setMisses] = useState(0)
  const [feedback, setFeedback] = useState<{ type: 'correct' | 'wrong' | 'missed'; text: string } | null>(null)
  const [complete, setComplete] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const gameRef = useRef({ isPlaying, sequence, currentIndex, n, hits, misses })
  gameRef.current = { isPlaying, sequence, currentIndex, n, hits, misses }

  const writeToFirestore = useCallback(async (data: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        ...data,
        'timestamps.updatedAt': new Date().toISOString(),
      })
    } catch {}
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
      if (e.code === 'Space' && !isTherapist && isPlaying && currentIndex >= n && !complete) {
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
          <div style={{ flexShrink: 0, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 6 }}>
            {/* N Level */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
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
                    background: n === val ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: n === val ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {val}-Back
                </button>
              ))}
            </div>

            {/* Stimulus type */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
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
                    background: stimulusType === st.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: stimulusType === st.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Speed */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
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
                    background: speed === sp.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: speed === sp.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {sp.label}
                </button>
              ))}
            </div>

            {/* Sequence length */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
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
                    background: seqLength === len.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: seqLength === len.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {len.label}
                </button>
              ))}
            </div>

            {/* Start / Pause / Reset */}
            <div className="flex items-center" style={{ gap: 3 }}>
              {isPlaying ? (
                <button
                  onClick={handlePause}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'rgba(200,96,42,0.25)',
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
                    padding: '5px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: complete ? 'default' : 'pointer',
                    opacity: complete ? 0.4 : 1,
                    background: 'rgba(74,124,111,0.3)',
                    color: '#b8d4ce',
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
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                🔄 Reset
              </button>
            </div>
          </div>
        )}

        {/* Locked notice */}
        {!canInteract && (
          <div style={{ flexShrink: 0, fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingBottom: 4 }}>
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
                color: '#b8d4ce',
                background: 'rgba(74,124,111,0.15)',
                border: '1px solid rgba(74,124,111,0.3)',
                borderRadius: 20,
                padding: '4px 14px',
              }}
            >
              {n}-Back
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {isTherapist ? 'Configure and press Start' : 'Waiting for therapist to start...'}
            </span>
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
                  color: '#b8d4ce',
                  background: 'rgba(74,124,111,0.15)',
                  border: '1px solid rgba(74,124,111,0.3)',
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
                        gridTemplateColumns: 'repeat(3, 56px)',
                        gridTemplateRows: 'repeat(3, 56px)',
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
                              width: 56,
                              height: 56,
                              borderRadius: 8,
                              background: isActive ? 'rgba(74,124,111,0.5)' : 'rgba(255,255,255,0.06)',
                              border: isActive ? '2px solid #4a7c6f' : '1px solid rgba(255,255,255,0.1)',
                              transition: 'all 0.15s',
                            }}
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: 20,
                        background: 'rgba(255,255,255,0.08)',
                        border: '2px solid rgba(255,255,255,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 64,
                      }}
                    >
                      {currentStimulus}
                    </div>
                  )}
                </div>
              )}

              {/* Is it a match? */}
              {!currentStimulus && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
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
                          background: 'rgba(255,255,255,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: stimulusType === 'position' ? 0 : 12,
                          opacity: isRef ? 0.55 : 0.3,
                          border: isRef ? '1.5px solid rgba(74,124,111,0.5)' : 'none',
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
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                  Remember {n} step{n > 1 ? 's' : ''} back
                </div>
              )}
            </div>

            {/* BOTTOM — Match Button + Score */}
            <div style={{ flexShrink: 0 }}>
              {/* Match button */}
              {!isTherapist && (
                <button
                  onClick={handleMatchPress}
                  disabled={!canInteract || !isMatchable || !isPlaying}
                  style={{
                    width: '100%',
                    height: 52,
                    borderRadius: 14,
                    background: feedback?.type === 'correct'
                      ? 'rgba(74,124,111,0.5)'
                      : feedback?.type === 'wrong'
                        ? 'rgba(200,96,42,0.4)'
                        : 'rgba(74,124,111,0.25)',
                    border: feedback?.type === 'correct'
                      ? '2px solid rgba(74,124,111,0.7)'
                      : feedback?.type === 'wrong'
                        ? '2px solid rgba(200,96,42,0.6)'
                        : '2px solid rgba(74,124,111,0.4)',
                    color: feedback?.type === 'correct' ? '#6ba395' : feedback?.type === 'wrong' ? '#c8602a' : '#b8d4ce',
                    fontSize: 16,
                    fontWeight: 500,
                    cursor: canInteract && isMatchable && isPlaying ? 'pointer' : 'default',
                    opacity: canInteract && isMatchable && isPlaying ? 1 : 0.3,
                    transition: 'all 0.15s',
                    marginBottom: 8,
                  }}
                >
                  MATCH (Space)
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
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span style={{ fontSize: 11, color: 'rgba(74,124,111,0.9)' }}>
                  ✓ {hits} Hits
                </span>
                <span style={{ fontSize: 11, color: 'rgba(200,96,42,0.8)' }}>
                  ✗ {misses} Misses
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
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
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 16,
                padding: '20px 24px',
                textAlign: 'center',
                maxWidth: 260,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
                Session Complete!
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>
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
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Hits</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(200,96,42,0.8)' }}>{misses}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Misses</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{accuracy}%</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Accuracy</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
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
                    background: 'rgba(74,124,111,0.3)',
                    color: '#b8d4ce',
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
                      border: '1px solid rgba(74,124,111,0.3)',
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
