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
    } catch (err) {
      // Was silent. A failed write means the two screens have diverged, which is
      // impossible to diagnose from the UI alone.
      console.warn('[WhackAMoleMath] Firestore write failed', err)
    }
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

  // `override` matters when the therapist has just changed operation/difficulty:
  // gameRef still holds the previous value at that point in the event handler, so
  // the new setting has to be passed in explicitly.
  const startNewQuestion = useCallback((override?: {
    operation?: Operation
    difficulty?: DifficultyLevel
    forceWrite?: boolean
  }) => {
    const operation = override?.operation ?? gameRef.current.operation
    const difficulty = override?.difficulty ?? gameRef.current.difficulty
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

    // Paused sessions still need the write when the therapist deliberately
    // changed a setting, so both screens show the newly generated question.
    if (gameRef.current.isPlaying || override?.forceWrite) {
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
    if (op === gameRef.current.operation) return
    setOperation(op)
    writeToFirestore({ 'moduleState.wamOperation': op })
    // Switching operation must take effect on the question on screen, not only
    // on the next one — otherwise the control looks dead until the child answers.
    startNewQuestion({ operation: op, forceWrite: true })
  }

  const handleDifficultyChange = (diff: DifficultyLevel) => {
    if (!isTherapist) return
    if (diff === gameRef.current.difficulty) return
    setDifficulty(diff)
    writeToFirestore({ 'moduleState.wamDifficulty': diff })
    // Same immediate-effect reasoning as the operation switch above.
    startNewQuestion({ difficulty: diff, forceWrite: true })
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
        {/* Therapist controls.
            Capped and centred: on the wide canvas each `flex: 1` pill would
            otherwise stretch to hundreds of pixels with 8px text inside it. */}
        {isTherapist && (
          <div style={{ flexShrink: 0, width: '100%', maxWidth: 1000, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
            <div className="flex items-center" style={{ gap: 6, flex: '2 1 240px' }}>
              {OPERATIONS.map((op) => (
                <button
                  key={op.key}
                  onClick={() => handleOperationChange(op.key)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: operation === op.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: operation === op.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 180px' }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => handleDifficultyChange(d.key)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: difficulty === d.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: difficulty === d.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 180px' }}>
              {SPEEDS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleSpeedChange(s.ms, s.key)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: speed === s.ms ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: speed === s.ms ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            </div>
            <button
              onClick={handleTogglePlaying}
              style={{
                flex: '0 0 auto',
                padding: '6px 18px',
                borderRadius: 12,
                border: 'none',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: isPlaying ? 'rgba(200,96,42,0.18)' : 'rgba(74,124,111,0.22)',
                color: isPlaying ? '#c8602a' : '#2f6d5e',
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
            <span style={{ fontSize: 11, color: '#9aa0a6' }}>
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
                background: 'rgba(0,0,0,0.035)',
                borderRadius: 12,
                padding: '6px 18px',
                border: '1px solid rgba(0,0,0,0.08)',
                flexShrink: 0,
                width: '100%',
                maxWidth: 760,
                alignSelf: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: 26,
                  color: '#2b2f33',
                }}
              >
                {question.display}
              </span>
            </div>

            {/* Locked overlay */}
            {!canInteract && isPlaying && (
              <div style={{ fontSize: 9, color: '#9aa0a6', textAlign: 'center', flexShrink: 0 }}>
                Therapist is controlling
              </div>
            )}

            {/* Mole grid */}
            {/* Wrapper owns the leftover height; the square grid is sized FROM
                that height so it can never overflow the canvas, and is centred
                horizontally. Sizing the grid itself as the flex item instead
                either collapsed it to dots (height-as-flex-basis) or pushed the
                bottom row off-canvas (width-as-authority). */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 0',
                // Only bites on unusually short windows, where the floor below
                // keeps the holes tappable rather than shrinking them to dots.
                overflow: 'auto',
              }}
            >
            <div
              style={{
                height: '100%',
                // Floor is deliberately low: it exists only so the holes stay
                // tappable on a very short window, not to force a scroll. On a
                // normal screen `height: 100%` is what wins.
                minHeight: 150,
                // Columns span the FULL canvas width so the holes are evenly
                // distributed rather than bunched into a narrow centred block;
                // each hole is then sized from its row height and centred in its
                // cell, so they stay circular and never overflow.
                width: '100%',
                // Same 760px content column as the question box and the score
                // bar, so the three elements line up instead of the holes
                // drifting out to the canvas edges on a wide screen.
                maxWidth: 760,
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 1fr)',
                gap: 'min(16px, 2%)',
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
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Paused</span>
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
                      height: '100%',
                      aspectRatio: '1',
                      justifySelf: 'center',
                      background: holeBg,
                      borderRadius: '50%',
                      border: '2px solid rgba(0,0,0,0.18)',
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
            </div>

            {/* Score + streak */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
                paddingTop: 8,
                borderTop: '1px solid rgba(0,0,0,0.07)',
                position: 'relative',
                width: '100%',
                maxWidth: 760,
                alignSelf: 'center',
              }}
            >
              <span style={{ fontSize: 12, color: '#5b6169' }}>
                ✓ {score} correct
              </span>
              <span style={{ fontSize: 12, color: '#5b6169' }}>
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
