'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface WhackAMoleMathProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Operation = 'add' | 'sub' | 'multiply' | 'numbers'
type DifficultyLevel = 'easy' | 'medium' | 'hard'

interface Question {
  display: string
  answer: number
}

interface Mole {
  id: number
  number: number
  isUp: boolean
  holeIndex: number
}

interface HoleState {
  flash: 'correct' | 'wrong' | null
}

const OPERATIONS: { key: Operation; label: string }[] = [
  { key: 'add', label: '➕ Add' },
  { key: 'sub', label: '➖ Sub' },
  { key: 'multiply', label: '✖️ Multiply' },
  { key: 'numbers', label: '🔢 Numbers' },
]

const DIFFICULTIES: { key: DifficultyLevel; label: string; maxNum: number; maxSum: number }[] = [
  { key: 'easy', label: 'Easy', maxNum: 5, maxSum: 10 },
  { key: 'medium', label: 'Medium', maxNum: 10, maxSum: 20 },
  { key: 'hard', label: 'Hard', maxNum: 20, maxSum: 50 },
]

const SPEEDS: { key: string; label: string; ms: number }[] = [
  { key: 'slow', label: 'Slow', ms: 3000 },
  { key: 'normal', label: 'Normal', ms: 2000 },
  { key: 'fast', label: 'Fast', ms: 1200 },
]

function generateQuestion(operation: Operation, difficulty: DifficultyLevel): { question: Question; numbers: number[] } {
  const diff = DIFFICULTIES.find((d) => d.key === difficulty)!
  const max = diff.maxNum
  const maxSum = diff.maxSum
  let answer = 0
  let display = ''

  if (operation === 'numbers') {
    answer = 1 + Math.floor(Math.random() * max)
    display = `Find ${answer}`
  } else if (operation === 'add') {
    const a = 1 + Math.floor(Math.random() * max)
    const b = 1 + Math.floor(Math.random() * Math.min(max, maxSum - a))
    answer = a + b
    display = `${a} + ${b} = ?`
  } else if (operation === 'sub') {
    const a = 2 + Math.floor(Math.random() * maxSum)
    const b = 1 + Math.floor(Math.random() * Math.min(a - 1, max))
    answer = a - b
    display = `${a} - ${b} = ?`
  } else if (operation === 'multiply') {
    const a = 1 + Math.floor(Math.random() * Math.min(max, 9))
    const b = 1 + Math.floor(Math.random() * Math.min(max, 9))
    answer = a * b
    display = `${a} × ${b} = ?`
  }

  const numbers: number[] = [answer]
  const usedNums = new Set([answer])
  const maxAttempts = 100
  let attempts = 0

  while (numbers.length < 9 && attempts < maxAttempts) {
    attempts++
    let distractor: number
    if (operation === 'numbers') {
      distractor = 1 + Math.floor(Math.random() * max)
    } else {
      const offset = 1 + Math.floor(Math.random() * 4)
      distractor = Math.random() > 0.5 ? answer + offset : answer - offset
    }
    if (!usedNums.has(distractor) && distractor >= 0 && distractor <= 100) {
      numbers.push(distractor)
      usedNums.add(distractor)
    }
  }

  while (numbers.length < 9) {
    let fallback = answer + numbers.length
    if (!usedNums.has(fallback) && fallback <= 100) {
      numbers.push(fallback)
      usedNums.add(fallback)
    } else {
      fallback = answer - numbers.length
      if (!usedNums.has(fallback) && fallback >= 0) {
        numbers.push(fallback)
        usedNums.add(fallback)
      }
    }
  }

  const shuffled: number[] = []
  const src = [...numbers]
  for (let i = src.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[src[i], src[j]] = [src[j], src[i]]
  }

  return { question: { display, answer }, numbers: src }
}

function buildMoles(numbers: number[], answerHoleIndex: number): Mole[] {
  return numbers.map((n, i) => ({
    id: i,
    number: n,
    isUp: false,
    holeIndex: i,
  }))
}

function pickUpMoles(moles: Mole[], answerHoleIndex: number): Mole[] {
  const count = 3 + Math.floor(Math.random() * 2)
  const upSet = new Set<number>([answerHoleIndex])
  const candidates = moles
    .map((_, i) => i)
    .filter((i) => i !== answerHoleIndex)

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  for (let k = 0; k < count - 1 && k < candidates.length; k++) {
    upSet.add(candidates[k])
  }

  return moles.map((m) => ({
    ...m,
    isUp: upSet.has(m.holeIndex),
  }))
}

export default function WhackAMoleMath({ sessionId, role, isLocked }: WhackAMoleMathProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [question, setQuestion] = useState<Question | null>(null)
  const [moles, setMoles] = useState<Mole[]>([])
  const [isPlaying, setIsPlaying] = useState(false)
  const [operation, setOperation] = useState<Operation>('add')
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy')
  const [speed, setSpeed] = useState<number>(2000)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [answerHoleIndex, setAnswerHoleIndex] = useState(0)
  const [holeFlashes, setHoleFlashes] = useState<Record<number, 'correct' | 'wrong'>>({})
  const [spinningHole, setSpinningHole] = useState<number | null>(null)
  const [streakBadge, setStreakBadge] = useState<string | null>(null)
  const [reactions, setReactions] = useState<{ id: number; x: number; emoji: string }[]>([])

  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const gameRef = useRef({ question, moles, isPlaying, operation, difficulty, speed, score, streak, wrongCount, answerHoleIndex })
  gameRef.current = { question, moles, isPlaying, operation, difficulty, speed, score, streak, wrongCount, answerHoleIndex }
  const reactIdRef = useRef(0)
  const firestoreReady = useRef(true)

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
      if (s.wamQuestion) {
        setQuestion(s.wamQuestion as Question)
      }
      if (Array.isArray(s.wamMoles)) {
        setMoles(s.wamMoles)
      }
      if (typeof s.wamIsPlaying === 'boolean') {
        setIsPlaying(s.wamIsPlaying)
      }
      if (typeof s.wamOperation === 'string') {
        setOperation(s.wamOperation as Operation)
      }
      if (typeof s.wamDifficulty === 'string') {
        setDifficulty(s.wamDifficulty as DifficultyLevel)
      }
      if (typeof s.wamSpeed === 'number') {
        setSpeed(s.wamSpeed)
      }
      if (typeof s.wamScore === 'number') {
        setScore(s.wamScore)
      }
      if (typeof s.wamStreak === 'number') {
        setStreak(s.wamStreak)
      }
    })
    return () => unsub()
  }, [sessionId])

  const startNewQuestion = useCallback(() => {
    const { operation, difficulty } = gameRef.current
    const { question: q, numbers } = generateQuestion(operation, difficulty)
    const answerIdx = numbers.indexOf(q.answer)
    const molesArr = buildMoles(numbers, answerIdx)
    const upMoles = pickUpMoles(molesArr, answerIdx)

    setQuestion(q)
    setMoles(upMoles)
    setAnswerHoleIndex(answerIdx)
    setWrongCount(0)
    setHoleFlashes({})
    setSpinningHole(null)

    if (gameRef.current.isPlaying) {
      writeToFirestore({
        'moduleState.wamQuestion': q,
        'moduleState.wamMoles': upMoles,
      })
    }
  }, [writeToFirestore])

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
      return
    }

    timerRef.current = setInterval(() => {
      const { moles, answerHoleIndex } = gameRef.current
      if (moles.length === 0) return
      const updated = pickUpMoles(moles, answerHoleIndex)
      setMoles(updated)
      writeToFirestore({ 'moduleState.wamMoles': updated })
    }, speed)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, speed, writeToFirestore])

  const triggerReaction = (emoji: string) => {
    const id = reactIdRef.current++
    const x = 20 + Math.random() * 60
    setReactions((prev) => [...prev, { id, x, emoji }])
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id))
    }, 1800)
  }

  const handleMoleClick = (holeIdx: number) => {
    const { question, moles, isPlaying, operation, difficulty, score, streak, wrongCount, answerHoleIndex } = gameRef.current
    if (isTherapist) return
    if (!isPlaying || !canInteract || !question || moles.length === 0) return

    if (holeIdx === answerHoleIndex) {
      setSpinningHole(holeIdx)
      setHoleFlashes({ [holeIdx]: 'correct' })
      const newScore = score + 1
      const newStreak = streak + 1
      setScore(newScore)
      setStreak(newStreak)

      if (newStreak === 3) {
        setStreakBadge('🔥 On fire!')
        setTimeout(() => setStreakBadge(null), 2000)
      } else if (newStreak === 5) {
        setStreakBadge('⭐ Amazing!')
        setTimeout(() => setStreakBadge(null), 2000)
        triggerReaction('🎉')
      }

      writeToFirestore({
        'moduleState.wamScore': newScore,
        'moduleState.wamStreak': newStreak,
      })

      setTimeout(() => {
        setSpinningHole(null)
        setHoleFlashes({})
        startNewQuestion()
      }, 400)
    } else {
      setHoleFlashes({ [holeIdx]: 'wrong' })
      const newWrong = wrongCount + 1
      setWrongCount(newWrong)
      setStreak(0)
      writeToFirestore({ 'moduleState.wamStreak': 0 })

      setTimeout(() => setHoleFlashes({}), 400)

      if (newWrong >= 2) {
        setTimeout(() => startNewQuestion(), 500)
      }
    }
  }

  const handleOperationChange = (op: Operation) => {
    if (!isTherapist) return
    setOperation(op)
    writeToFirestore({ 'moduleState.wamOperation': op })
  }

  const handleDifficultyChange = (diff: DifficultyLevel) => {
    if (!isTherapist) return
    setDifficulty(diff)
    writeToFirestore({ 'moduleState.wamDifficulty': diff })
  }

  const handleSpeedChange = (ms: number, label: string) => {
    if (!isTherapist) return
    setSpeed(ms)
    writeToFirestore({ 'moduleState.wamSpeed': ms, 'moduleState.wamSpeedLabel': label })
  }

  const handleTogglePlaying = () => {
    if (!isTherapist) return
    const next = !isPlaying
    setIsPlaying(next)
    writeToFirestore({ 'moduleState.wamIsPlaying': next })

    if (!next && score > 0) {
      logModuleEvent(sessionId, {
        module: 'whack-a-mole-math',
        type: 'practice_summary',
        detail: `Math practice (${operation}, ${difficulty}): ${score} correct answer${score === 1 ? '' : 's'}`,
      })
    }

    if (next) {
      if (!question) {
        const { question: q, numbers } = generateQuestion(operation, difficulty)
        const answerIdx = numbers.indexOf(q.answer)
        const molesArr = buildMoles(numbers, answerIdx)
        const upMoles = pickUpMoles(molesArr, answerIdx)
        setQuestion(q)
        setMoles(upMoles)
        setAnswerHoleIndex(answerIdx)
        writeToFirestore({
          'moduleState.wamQuestion': q,
          'moduleState.wamMoles': upMoles,
        })
      }
    }
  }

  return (
    <>
      <style>{`
        @keyframes wamMoleUp {
          0%   { transform: translateX(-50%) translateY(100%) }
          60%  { transform: translateX(-50%) translateY(-8%) }
          100% { transform: translateX(-50%) translateY(0%) }
        }
        @keyframes wamMoleDown {
          0%   { transform: translateX(-50%) translateY(0%) }
          100% { transform: translateX(-50%) translateY(100%) }
        }
        @keyframes wamCorrectSpin {
          0%   { transform: translateX(-50%) rotate(0deg) scale(1) }
          50%  { transform: translateX(-50%) rotate(180deg) scale(1.3) }
          100% { transform: translateX(-50%) rotate(360deg) scale(1) }
        }
        @keyframes wamWrongShake {
          0%,100% { transform: translateX(-50%) }
          25%     { transform: translateX(calc(-50% - 5px)) }
          75%     { transform: translateX(calc(-50% + 5px)) }
        }
        @keyframes wamFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-90px) scale(1.5) }
        }
        @keyframes wamFadeInOut {
          0% { opacity: 0; transform: translateY(6px) }
          15% { opacity: 1; transform: translateY(0) }
          75% { opacity: 1; transform: translateY(0) }
          100% { opacity: 0; transform: translateY(-4px) }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 6,
        }}
      >
        {/* Therapist controls */}
        {isTherapist && (
          <div style={{ flexShrink: 0 }}>
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {OPERATIONS.map((op) => (
                <button
                  key={op.key}
                  onClick={() => handleOperationChange(op.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: operation === op.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: operation === op.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => handleDifficultyChange(d.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: difficulty === d.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: difficulty === d.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {SPEEDS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleSpeedChange(s.ms, s.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: speed === s.ms ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: speed === s.ms ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleTogglePlaying}
              style={{
                width: '100%',
                padding: '5px 0',
                borderRadius: 8,
                border: 'none',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                background: isPlaying ? 'rgba(200,96,42,0.25)' : 'rgba(74,124,111,0.3)',
                color: isPlaying ? 'var(--accent, #c8602a)' : '#b8d4ce',
                transition: 'all 0.15s',
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Start'}
            </button>
          </div>
        )}

        {/* Waiting state */}
        {!isPlaying && !question && (
          <div className="flex flex-col items-center justify-center" style={{ flex: 1 }}>
            <span style={{ fontSize: 28, marginBottom: 8 }}>🔨</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {isTherapist ? 'Press Start to begin' : 'Waiting for therapist to start...'}
            </span>
          </div>
        )}

        {/* Game area */}
        {question && (
          <>
            {/* Question display */}
            <div
              style={{
                textAlign: 'center',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: '8px 14px',
                border: '1px solid rgba(255,255,255,0.1)',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 24,
                  color: '#fff',
                }}
              >
                {question.display}
              </span>
            </div>

            {/* Locked overlay */}
            {!canInteract && isPlaying && (
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center', flexShrink: 0 }}>
                Therapist is controlling
              </div>
            )}

            {/* Mole grid */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 6,
                padding: '6px 0',
                alignContent: 'center',
                position: 'relative',
              }}
            >
              {!isPlaying && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 5,
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Paused</span>
                </div>
              )}

              {moles.map((mole) => {
                const isCorrectHole = mole.holeIndex === answerHoleIndex
                const flash = holeFlashes[mole.holeIndex]
                const isSpinning = spinningHole === mole.holeIndex

                let moleAnimation = 'none'
                if (mole.isUp && !isSpinning) {
                  moleAnimation = 'wamMoleUp 0.25s ease forwards'
                } else if (!mole.isUp && !isSpinning) {
                  moleAnimation = 'wamMoleDown 0.2s ease forwards'
                }

                let moleTransform = 'translateX(-50%) translateY(100%)'
                if (mole.isUp && !isSpinning) moleTransform = 'translateX(-50%) translateY(0%)'
                if (isSpinning) moleAnimation = 'wamCorrectSpin 0.3s ease'
                if (flash === 'wrong') moleAnimation = 'wamWrongShake 0.35s ease'

                let holeBg = 'radial-gradient(circle at 50% 80%, rgba(0,0,0,0.4) 0%, rgba(30,20,10,0.6) 100%)'
                if (flash === 'correct') holeBg = 'rgba(74,124,111,0.5)'
                if (flash === 'wrong') holeBg = 'rgba(200,96,42,0.5)'

                return (
                  <div
                    key={mole.id}
                    onClick={() => handleMoleClick(mole.holeIndex)}
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1',
                      background: holeBg,
                      borderRadius: '50%',
                      border: '2px solid rgba(0,0,0,0.3)',
                      overflow: 'hidden',
                      cursor: canInteract && isPlaying ? 'pointer' : 'default',
                      transition: flash ? 'none' : 'background 0.3s',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        width: '70%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1,
                        transform: moleTransform,
                        animation: moleAnimation,
                        pointerEvents: 'none',
                      }}
                    >
                      <span style={{ fontSize: 22, lineHeight: 1.2 }}>🐹</span>
                      <span
                        style={{
                          background: '#fff',
                          color: '#1a1f1e',
                          borderRadius: 6,
                          padding: '1px 5px',
                          fontSize: 12,
                          fontWeight: 700,
                          lineHeight: '18px',
                        }}
                      >
                        {mole.number}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Score + streak */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                paddingTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                ✓ {score} correct
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                🔥 {streak} streak
              </span>

              {/* Streak badge */}
              {streakBadge && (
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: -20,
                    transform: 'translateX(-50%)',
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#fff',
                    background: 'rgba(74,124,111,0.85)',
                    padding: '2px 10px',
                    borderRadius: 8,
                    whiteSpace: 'nowrap',
                    animation: 'wamFadeInOut 2s ease forwards',
                  }}
                >
                  {streakBadge}
                </div>
              )}

              {/* Reactions */}
              {reactions.map((r) => (
                <div
                  key={r.id}
                  style={{
                    position: 'absolute',
                    left: `${r.x}%`,
                    bottom: 0,
                    fontSize: 20,
                    zIndex: 10,
                    pointerEvents: 'none',
                    animation: 'wamFloatUp 1.6s ease forwards',
                  }}
                >
                  {r.emoji}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
