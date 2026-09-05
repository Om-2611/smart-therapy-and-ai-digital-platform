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

/* ---------------------------------------------------------------------------
   Art assets. The delivered folder name contains spaces, so every path segment
   is encoded individually — encodeURI() would leave the raw spaces in place.
   Same helper shape as WorryVault and BoxPopping; these are painted with plain
   <img>/background-image because next/image cannot take these paths.
--------------------------------------------------------------------------- */
const A = (f: string) =>
  `/assets/modules/SLD/${encodeURIComponent('Whack a mole assets')}/${encodeURIComponent(f)}`

/* Standalone green-rimmed burrow, transparent PNG. Painted twice per cell: once
   whole as the hole, once clipped to its lower half as the NEAR rim in front of
   the mole, which is what makes the mole read as being *inside* the hole. */
const WAM_HOLE = A('ChatGPT Image Sep 3, 2026, 11_11_36 PM.png')

/* 3x2 sheet of six cheerful moles (512px cells). Cropped to the top 380px of a
   cell — head, belly and paws, with the sheet's own flat rim left behind, so
   the sprite can rise out of WAM_HOLE instead of carrying a second rim. */
const WAM_MOLE_SHEET = A('ChatGPT Image Sep 4, 2026, 01_21_07 PM.png')
const WAM_MOLE_COLS = 3
const WAM_MOLE_ROWS = 2
const WAM_MOLE_CELL = 512
const WAM_MOLE_CROP = 380

/* Four whack reactions in a 543x724 strip: surprised, ouch, dizzy-stars,
   sinking. Every frame is bottom-registered on an identical rim, so a frame can
   replace the whole cell for the 400ms flash and the rim will not jump. Frame
   widths (458px) differ from WAM_HOLE's rim (1122/1254), hence the 106.2%
   width and -3.1% left below — that scales rim to rim. */
const WAM_HIT_SHEET = A('ChatGPT Image Sep 4, 2026, 01_20_56 PM (1).png')
const WAM_HIT_FRAMES = 4
const WAM_HIT_W = 543
const WAM_HIT_H = 724
const WAM_HIT_OUCH = 1
const WAM_HIT_DIZZY = 2

/* Red mallet, transparent PNG — swung at whichever hole was just struck. */
const WAM_MALLET = A('ChatGPT Image Sep 4, 2026, 01_15_46 PM.png')

/* 10x10 sheet of white number cards, 1..100. Cell pitch 200x130; the card
   itself is a 164x100 rect at (18,16) inside its cell, so each number crops
   exactly. Dark #111 numerals on white — the mockup's number cards. */
const WAM_NUMBERS = A('number_bubbles_1_to_100_sprite.svg')
const WAM_NUM_COLS = 10
const WAM_NUM_PITCH_X = 200
const WAM_NUM_PITCH_Y = 130
const WAM_NUM_CARD_X = 18
const WAM_NUM_CARD_Y = 16
const WAM_NUM_CARD_W = 164
const WAM_NUM_CARD_H = 100
const WAM_NUM_SHEET_W = 2000

const WAM_SFX = A('whack_hit_sfx_v2.wav')

/* The illustrated meadow the mockup sets the board in — rolling hills, bushes,
   daisies and rocks. Painted as a cover background behind the playfield. */
const WAM_SCENE = `/assets/modules/Background/${encodeURIComponent('whack a mole_.png')}`

/* ---------------------------------------------------------------------------
   Palette. The stage canvas is WHITE, so every label here is dark ink on a pale
   surface; white text appears ONLY on the solid green / amber fills. (This file
   used to pair #9aa0a6 copy with a #1a1f1e ground, which vanished on white.)
--------------------------------------------------------------------------- */
const GREEN = '#16A34A'
const GREEN_DEEP = '#15803D'
const GREEN_TINT = '#E9F7EE'
/* Deep enough that 13px white type on it still clears AA — the solid fills are
   the ONLY place white text is allowed in this file. */
const AMBER = '#B45309'
const INK = '#101828'
const INK_BODY = '#333c4a'
const MUTED = '#6b7280'
const BORDER = '#e7eaef'
const CARD_SHADOW = '0 1px 2px rgba(20,30,45,0.04), 0 6px 16px rgba(20,30,45,0.06)'

/* Cell is taller than it is wide: the burrow fills the lower half and the upper
   half is headroom for the mole and its celebration glow. */
const CELL_RATIO = 1.3

/* One-shot whack playback, lazily created so nothing touches window during SSR. */
let wamHit: HTMLAudioElement | null = null
function playWhack() {
  try {
    if (typeof window === 'undefined') return
    if (!wamHit) {
      wamHit = new Audio(WAM_SFX)
      wamHit.volume = 0.55
    }
    wamHit.currentTime = 0
    void wamHit.play()
  } catch {}
}

const OPERATIONS: { key: Operation; label: string; glyph: string; tint: string; wash: string }[] = [
  { key: 'add', label: 'Add', glyph: '+', tint: '#16A34A', wash: '#E9F7EE' },
  { key: 'sub', label: 'Sub', glyph: '−', tint: '#EA580C', wash: '#FEF0E6' },
  { key: 'multiply', label: 'Multiply', glyph: '×', tint: '#7C3AED', wash: '#F2ECFE' },
  { key: 'numbers', label: 'Numbers', glyph: '▦', tint: '#2563EB', wash: '#E8F0FE' },
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

/* ---------------------------------------------------------------------------
   Presentational pieces
--------------------------------------------------------------------------- */

/**
 * One white number card, cropped straight out of the delivered 1..100 sprite.
 * The sheet only covers 1..100, so anything outside that (a 0 distractor) falls
 * back to type in the same card shape — dark numerals on white either way.
 */
function NumberCard({ n }: { n: number }) {
  const shell: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${WAM_NUM_CARD_W} / ${WAM_NUM_CARD_H}`,
    borderRadius: '13.4% / 22%',
    overflow: 'hidden',
    boxShadow: '0 3px 8px rgba(20,30,45,0.22)',
  }

  if (!Number.isInteger(n) || n < 1 || n > 100) {
    // The sheet only carries 1..100. A 0 distractor is drawn as the same card in
    // SVG so it scales with the hole instead of needing a font size in px.
    return (
      <div role="img" aria-label={`Number ${n}`} style={shell}>
        <svg viewBox={`0 0 ${WAM_NUM_CARD_W} ${WAM_NUM_CARD_H}`} style={{ display: 'block', width: '100%', height: '100%' }} aria-hidden>
          <rect x="1" y="1" width={WAM_NUM_CARD_W - 2} height={WAM_NUM_CARD_H - 2} rx="22" fill="#FFFFFF" stroke="#E5E7EB" strokeWidth="2" />
          <text
            x={WAM_NUM_CARD_W / 2}
            y="68"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="54"
            fontWeight="700"
            fill="#111111"
          >
            {n}
          </text>
        </svg>
      </div>
    )
  }

  const idx = n - 1
  const col = idx % WAM_NUM_COLS
  const row = Math.floor(idx / WAM_NUM_COLS)

  return (
    <div role="img" aria-label={`Number ${n}`} style={shell}>
      <img
        src={WAM_NUMBERS}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: 'absolute',
          // 100% of the shell is one card (164 units) wide, so the whole sheet
          // is 2000/164 of that; left/top then shift the wanted card to 0,0.
          width: `${(WAM_NUM_SHEET_W / WAM_NUM_CARD_W) * 100}%`,
          maxWidth: 'none',
          height: 'auto',
          left: `${(-(col * WAM_NUM_PITCH_X + WAM_NUM_CARD_X) / WAM_NUM_CARD_W) * 100}%`,
          top: `${(-(row * WAM_NUM_PITCH_Y + WAM_NUM_CARD_Y) / WAM_NUM_CARD_H) * 100}%`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/** One cheerful mole cropped free of the sheet's own rim. */
function MoleSprite({ variant }: { variant: number }) {
  const col = variant % WAM_MOLE_COLS
  const row = Math.floor(variant / WAM_MOLE_COLS) % WAM_MOLE_ROWS
  return (
    <img
      src={WAM_MOLE_SHEET}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        position: 'absolute',
        width: `${WAM_MOLE_COLS * 100}%`,
        maxWidth: 'none',
        height: 'auto',
        // % offsets resolve against the window box, whose width is one cell and
        // whose height is the 380px crop — hence the two different multipliers.
        left: `${-col * 100}%`,
        top: `${(-row * WAM_MOLE_CELL) / WAM_MOLE_CROP * 100}%`,
        pointerEvents: 'none',
      }}
    />
  )
}

/** One frame of the whack-reaction strip, cropped free of its neighbours. */
function HitSprite({ frame }: { frame: number }) {
  return (
    <img
      src={WAM_HIT_SHEET}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: `${-frame * 100}%`,
        width: `${WAM_HIT_FRAMES * 100}%`,
        maxWidth: 'none',
        height: 'auto',
        pointerEvents: 'none',
      }}
    />
  )
}

/**
 * Colour the question the way the mockup does: navy numerals, green operator,
 * green "=" and a green "?". Purely a render of `question.display` — the string
 * itself still comes from generateQuestion untouched.
 */
function QuestionLine({ display }: { display: string }) {
  const tokens = display.split(/\s+/).filter(Boolean)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.34em', flexWrap: 'wrap', justifyContent: 'center' }}>
      {tokens.map((t, i) => {
        const isOperator = ['+', '-', '−', '×', '÷', '=', '?'].includes(t)
        const isWord = /[a-z]/i.test(t)
        return (
          <span
            key={`${t}-${i}`}
            style={{
              color: isOperator ? GREEN : INK,
              fontWeight: isWord ? 700 : 800,
              fontSize: isWord ? '0.56em' : undefined,
              letterSpacing: isWord ? 0 : -1,
            }}
          >
            {t === '-' ? '−' : t}
          </span>
        )
      })}
    </span>
  )
}

/** The three little speed ticks the mockup puts either side of the sum. */
function MotionTicks({ flip }: { flip?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        flexShrink: 0,
        transform: flip ? 'scaleX(-1)' : undefined,
        opacity: 0.85,
      }}
    >
      <span style={{ display: 'block', width: 22, height: 4, borderRadius: 999, background: '#86EFAC', transform: 'rotate(-24deg)' }} />
      <span style={{ display: 'block', width: 30, height: 4, borderRadius: 999, background: '#4ADE80' }} />
      <span style={{ display: 'block', width: 22, height: 4, borderRadius: 999, background: '#86EFAC', transform: 'rotate(24deg)' }} />
    </span>
  )
}

export default function WhackAMoleMath({ sessionId, role, isLocked }: WhackAMoleMathProps) {
  const isT = role === 'therapist'
  const isTherapist = isT
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

  /* Board geometry. The playfield never scrolls, so the 3x3 grid is sized from
     whichever axis runs out first — same measure-then-size approach BoxPopping
     uses, which is the only way an aspect-locked grid can be guaranteed not to
     overflow horizontally. */
  const boardRef = useRef<HTMLDivElement>(null)
  const [boardW, setBoardW] = useState(0)
  const [boardH, setBoardH] = useState(0)

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setBoardW((prev) => (Math.abs(prev - width) < 2 ? prev : width))
      setBoardH((prev) => (Math.abs(prev - height) < 2 ? prev : height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
      playWhack()
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

  /* ---- Derived layout numbers ------------------------------------------- */

  const measured = boardW > 4 && boardH > 4
  const gap = measured ? Math.max(10, Math.min(26, Math.round(boardW * 0.035))) : 14
  const cellW = measured
    ? Math.max(64, Math.floor(Math.min((boardW - gap * 2) / 3, ((boardH - gap * 2) / 3) / CELL_RATIO)))
    : 0
  const cellH = Math.round(cellW * CELL_RATIO)

  // Which hole the mallet is swinging at — read straight off the existing flash
  // map, so no extra state and no change to hit detection.
  const struckHole = Object.keys(holeFlashes)[0]

  /* ---- Shared control styles -------------------------------------------- */

  const opPill = (on: boolean, tint: string, wash: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '9px 16px',
    borderRadius: 999,
    border: `1.5px solid ${on ? tint : BORDER}`,
    background: on ? wash : '#ffffff',
    // The mockup colours the GLYPH, not the word — which also keeps the label
    // at full contrast instead of mid-tone-on-pale.
    color: on ? INK : INK_BODY,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: 'pointer',
    boxShadow: on ? 'none' : CARD_SHADOW,
    transition: 'all 0.15s',
  })

  const outlinePill = (on: boolean): React.CSSProperties => ({
    padding: '9px 18px',
    borderRadius: 999,
    border: `1.5px solid ${on ? GREEN : BORDER}`,
    background: '#ffffff',
    color: on ? GREEN_DEEP : MUTED,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: 'pointer',
    boxShadow: on ? '0 2px 8px rgba(22,163,74,0.16)' : CARD_SHADOW,
    transition: 'all 0.15s',
  })

  const tintPill = (on: boolean): React.CSSProperties => ({
    padding: '9px 18px',
    borderRadius: 999,
    border: `1.5px solid ${on ? 'rgba(22,163,74,0.28)' : BORDER}`,
    background: on ? GREEN_TINT : '#ffffff',
    color: on ? GREEN_DEEP : MUTED,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.2,
    cursor: 'pointer',
    boxShadow: on ? 'none' : CARD_SHADOW,
    transition: 'all 0.15s',
  })

  /* ---- Board cell -------------------------------------------------------- */

  const renderHole = (holeIdx: number) => {
    const mole = moles.find((m) => m.holeIndex === holeIdx)
    const flash = holeFlashes[holeIdx]
    const isSpinning = spinningHole === holeIdx
    const isUp = !!mole?.isUp
    const live = canInteract && isPlaying && !isTherapist

    return (
      <div
        key={holeIdx}
        onClick={() => handleMoleClick(holeIdx)}
        className={live ? 'wam-cell wam-live' : 'wam-cell'}
        style={{
          position: 'relative',
          width: cellW,
          height: cellH,
          cursor: live ? 'pointer' : 'default',
        }}
      >
        {/* The burrow. pointer-events off on every layer so the cell owns the
            click and the artwork's transparent overhang cannot steal it. */}
        <img
          src={WAM_HOLE}
          alt=""
          aria-hidden
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            height: 'auto',
            // The PNG's opaque rim ends 19.3% of its width above its own bottom
            // edge; pulling it down by that much sits the rim on the cell floor.
            bottom: '-14.85%',
            pointerEvents: 'none',
          }}
        />

        {/* Celebration burst — fired by the correct-answer FLASH only, never by
            answerHoleIndex, so the glow can never give the answer away. */}
        {flash === 'correct' && (
          <span
            aria-hidden
            className="wam-burst"
            style={{
              position: 'absolute',
              left: '-14%',
              right: '-14%',
              bottom: '4%',
              aspectRatio: '1',
              borderRadius: '50%',
              background:
                'radial-gradient(closest-side, rgba(255,255,255,0.95) 0%, rgba(190,242,100,0.72) 40%, rgba(74,222,128,0) 72%)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {flash ? (
          /* Whacked. The reaction strip's frames sit on their own rim, so the
             frame replaces the burrow for the flash instead of stacking a
             second rim on top of it. */
          <div
            className={flash === 'wrong' ? 'wam-shake' : 'wam-pop'}
            style={{
              position: 'absolute',
              // 106.2% / -3.1% scales the strip's 458px rim onto the burrow's
              // 1122px one; -14.46% drops its baseline onto the cell floor.
              left: '-3.1%',
              width: '106.2%',
              bottom: '-14.46%',
              aspectRatio: `${WAM_HIT_W} / ${WAM_HIT_H}`,
              overflow: 'hidden',
              transformOrigin: '50% 88%',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <HitSprite frame={flash === 'wrong' ? WAM_HIT_OUCH : WAM_HIT_DIZZY} />
          </div>
        ) : (
          <>
            {/* Rise window: clipped so a mole that is down is hidden inside the
                burrow rather than sliding across the meadow. */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                // Window floor sits on the burrow's mouth line.
                bottom: '19.2%',
                aspectRatio: `${WAM_MOLE_CELL} / ${WAM_MOLE_CROP}`,
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              <div
                className={isUp ? 'wam-riser wam-up' : 'wam-riser'}
                style={{ position: 'absolute', inset: 0 }}
              >
                <MoleSprite variant={holeIdx} />
              </div>
            </div>

            {/* Near rim, painted over the mole's lower edge. */}
            <img
              src={WAM_HOLE}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: 'absolute',
                left: 0,
                width: '100%',
                height: 'auto',
                bottom: '-14.85%',
                clipPath: 'inset(50% 0 0 0)',
                pointerEvents: 'none',
                zIndex: 3,
              }}
            />
          </>
        )}

        {/* Number card, in front of the rim exactly as the mockup shows it. */}
        {mole && (
          <div
            className="wam-card"
            style={{
              position: 'absolute',
              left: '28%',
              width: '44%',
              bottom: '15.4%',
              zIndex: 4,
              pointerEvents: 'none',
              // Stays mounted so it can sink and fade WITH the mole; it cannot
              // live inside the clip window because it belongs in front of the
              // near rim, which the window sits behind.
              opacity: isUp || flash ? 1 : 0,
              transform: `translateY(${isUp || flash ? '0%' : '55%'}) scale(${isSpinning ? 1.14 : 1})`,
            }}
          >
            <NumberCard n={mole.number} />
          </div>
        )}

        {/* Mallet strike. */}
        {struckHole === String(holeIdx) && (
          <img
            src={WAM_MALLET}
            alt=""
            aria-hidden
            draggable={false}
            className="wam-mallet"
            style={{
              position: 'absolute',
              right: '-10%',
              bottom: '34%',
              width: '62%',
              maxWidth: 'none',
              height: 'auto',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        height: '100%',
        // Belt and braces: in a BLOCK parent `height: 100%` can resolve to auto
        // and collapse the board to 0px.
        minHeight: 420,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <style>{`
        /* Rise/sink lives entirely in CSS: an inline transform would out-rank
           the hover rule and the moles would stop reacting to the pointer. */
        .wam-riser { transform: translateY(104%); transition: transform 0.3s cubic-bezier(.22,1.2,.36,1); will-change: transform; }
        .wam-riser.wam-up { transform: translateY(0); }
        .wam-live:hover .wam-riser.wam-up { transform: translateY(-5%); }
        .wam-live:active .wam-riser.wam-up { transform: translateY(3%); }
        .wam-card { transition: transform 0.3s cubic-bezier(.22,1.2,.36,1), opacity 0.22s ease; }
        @keyframes wamPop {
          0%   { transform: scale(0.86) }
          55%  { transform: scale(1.09) }
          100% { transform: scale(1) }
        }
        @keyframes wamShake {
          0%,100% { transform: translateX(0) }
          25%     { transform: translateX(-5px) }
          75%     { transform: translateX(5px) }
        }
        @keyframes wamBurst {
          0%   { opacity: 0; transform: scale(0.5) }
          40%  { opacity: 1; transform: scale(1.05) }
          100% { opacity: 0; transform: scale(1.35) }
        }
        @keyframes wamMallet {
          0%   { opacity: 0; transform: rotate(-52deg) translateY(-14px) }
          35%  { opacity: 1; transform: rotate(6deg) translateY(0) }
          70%  { opacity: 1; transform: rotate(-4deg) translateY(-3px) }
          100% { opacity: 0; transform: rotate(-20deg) translateY(-10px) }
        }
        @keyframes wamFloatUp {
          0%   { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-90px) scale(1.5) }
        }
        @keyframes wamFadeInOut {
          0%   { opacity: 0; transform: translateX(-50%) translateY(6px) }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0) }
          75%  { opacity: 1; transform: translateX(-50%) translateY(0) }
          100% { opacity: 0; transform: translateX(-50%) translateY(-4px) }
        }
        .wam-pop { animation: wamPop 0.34s ease }
        .wam-shake { animation: wamShake 0.35s ease }
        .wam-burst { animation: wamBurst 0.6s ease forwards }
        .wam-mallet { animation: wamMallet 0.5s ease forwards; transform-origin: 78% 82% }
        @media (prefers-reduced-motion: reduce) {
          .wam-riser, .wam-card { transition: none }
          .wam-pop, .wam-shake, .wam-burst, .wam-mallet { animation: none }
        }
      `}</style>

      {/* ---- Therapist control row: one horizontal band of small pills ---- */}
      {isT && (
        <div
          style={{
            flexShrink: 0,
            width: '100%',
            maxWidth: 1040,
            alignSelf: 'center',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 18,
            padding: '14px 18px',
            borderRadius: 20,
            border: `1px solid ${BORDER}`,
            background: '#ffffff',
            boxShadow: CARD_SHADOW,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {OPERATIONS.map((op) => {
              const on = operation === op.key
              return (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => handleOperationChange(op.key)}
                  aria-pressed={on}
                  style={opPill(on, op.tint, op.wash)}
                >
                  <span aria-hidden style={{ fontSize: 15, fontWeight: 800, color: op.tint, lineHeight: 1 }}>
                    {op.glyph}
                  </span>
                  {op.label}
                </button>
              )
            })}
          </div>

          <span aria-hidden style={{ width: 1, height: 26, background: BORDER, flexShrink: 0 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => handleDifficultyChange(d.key)}
                aria-pressed={difficulty === d.key}
                style={outlinePill(difficulty === d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <span aria-hidden style={{ width: 1, height: 26, background: BORDER, flexShrink: 0 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {SPEEDS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => handleSpeedChange(s.ms, s.key)}
                aria-pressed={speed === s.ms}
                style={tintPill(speed === s.ms)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleTogglePlaying}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 22px',
              borderRadius: 999,
              border: 'none',
              background: isPlaying ? AMBER : GREEN_DEEP,
              // White type only ever lands on these solid saturated fills.
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.2,
              cursor: 'pointer',
              boxShadow: isPlaying ? '0 4px 12px rgba(180,83,9,0.28)' : '0 4px 12px rgba(21,128,61,0.30)',
              transition: 'all 0.15s',
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{isPlaying ? '⏸' : '▶'}</span>
            {isPlaying ? 'Pause' : 'Start'}
          </button>
        </div>
      )}

      {/* ---- The sum. Body content, not a repeat of ModuleStage's title ---- */}
      {question && (
        <div
          style={{
            flexShrink: 0,
            width: '100%',
            maxWidth: 1040,
            alignSelf: 'center',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 26,
            padding: '20px 28px',
            borderRadius: 22,
            border: `1px solid ${BORDER}`,
            background: '#ffffff',
            boxShadow: CARD_SHADOW,
          }}
        >
          <MotionTicks />
          <span
            style={{
              // Floor is the size this card has always used; it only ever grows
              // with the canvas, never shrinks.
              fontSize: 'clamp(26px, 4.6vw, 54px)',
              lineHeight: 1.08,
              textAlign: 'center',
              minWidth: 0,
            }}
          >
            <QuestionLine display={question.display} />
          </span>
          <MotionTicks flip />
        </div>
      )}

      {!canInteract && isPlaying && question && (
        <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: MUTED, textAlign: 'center' }}>
          Your therapist is controlling this activity
        </div>
      )}

      {/* ---- Meadow board ---- */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', maxWidth: 1040, alignSelf: 'center' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            display: 'flex',
            padding: 16,
            boxSizing: 'border-box',
            borderRadius: 26,
            border: `1px solid ${BORDER}`,
            boxShadow: CARD_SHADOW,
            overflow: 'hidden',
            // Gradient underneath is the fallback if the scene PNG is slow or
            // missing — the board stays a green meadow either way.
            backgroundColor: '#d9edb8',
            backgroundImage: `url("${WAM_SCENE}"), linear-gradient(175deg,#cfe9fb 0%,#d9f0b4 45%,#bfe391 100%)`,
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center center, center center',
            backgroundRepeat: 'no-repeat, no-repeat',
          }}
        >
          {/* Grassy playfield the holes are cut into. */}
          <div
            ref={boardRef}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              position: 'relative',
              boxSizing: 'border-box',
              padding: 18,
              borderRadius: 22,
              background: 'linear-gradient(180deg, rgba(196,232,146,0.70) 0%, rgba(163,214,106,0.78) 100%)',
              border: '1px solid rgba(255,255,255,0.55)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), 0 10px 26px rgba(38,74,22,0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(3, ${cellW}px)`,
                gridTemplateRows: `repeat(3, ${cellH}px)`,
                gap,
                opacity: measured ? 1 : 0,
                transition: 'opacity 0.2s ease',
              }}
            >
              {Array.from({ length: 9 }, (_, i) => renderHole(i))}
            </div>

            {/* Waiting / paused veil — dark ink on a light frosted panel. */}
            {(!question || !isPlaying) && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  borderRadius: 22,
                  background: 'rgba(255,255,255,0.34)',
                  backdropFilter: 'blur(1.5px)',
                  zIndex: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 22px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.94)',
                    border: `1px solid ${BORDER}`,
                    boxShadow: CARD_SHADOW,
                  }}
                >
                  <img
                    src={WAM_MALLET}
                    alt=""
                    aria-hidden
                    draggable={false}
                    style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 700, color: INK_BODY }}>
                    {!question
                      ? isT
                        ? 'Press Start to begin'
                        : 'Waiting for your therapist to start…'
                      : 'Paused'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Score + streak ---- */}
      {question && (
        <div
          style={{
            flexShrink: 0,
            position: 'relative',
            width: '100%',
            maxWidth: 1040,
            alignSelf: 'center',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 22px',
            borderRadius: 18,
            border: `1px solid ${BORDER}`,
            background: '#ffffff',
            boxShadow: CARD_SHADOW,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: INK_BODY }}>
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: GREEN_TINT,
                color: GREEN_DEEP,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              ✓
            </span>
            {score} correct
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: INK_BODY }}>
            <span aria-hidden style={{ fontSize: 15 }}>🔥</span>
            {streak} streak
          </span>

          {streakBadge && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -16,
                fontSize: 12,
                fontWeight: 800,
                color: '#ffffff',
                background: GREEN_DEEP,
                padding: '5px 14px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
                boxShadow: '0 5px 14px rgba(21,128,61,0.30)',
                animation: 'wamFadeInOut 2s ease forwards',
              }}
            >
              {streakBadge}
            </div>
          )}

          {reactions.map((r) => (
            <div
              key={r.id}
              style={{
                position: 'absolute',
                left: `${r.x}%`,
                bottom: 0,
                fontSize: 24,
                zIndex: 10,
                pointerEvents: 'none',
                animation: 'wamFloatUp 1.6s ease forwards',
              }}
            >
              {r.emoji}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
