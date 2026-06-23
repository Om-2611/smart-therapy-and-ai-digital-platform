'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface BubbleSplashProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Difficulty = 'easy' | 'medium' | 'hard'
type Speed = 'slow' | 'normal' | 'fast'
type WordSet = 'sight-words' | 'phonics' | 'rhymes' | 'vocabulary' | 'custom'

interface BubbleData {
  id: string
  word: string
  x: number
  size: number
  color: string
  spawnedAt: number
  isCorrect: boolean
  state: 'floating' | 'popped' | 'wrong' | 'expired'
}

interface Particle {
  id: number
  x: number
  y: number
}

const SPEED_CONFIG: Record<Speed, { floatDuration: number; spawnInterval: number }> = {
  slow: { floatDuration: 5000, spawnInterval: 2000 },
  normal: { floatDuration: 3500, spawnInterval: 1200 },
  fast: { floatDuration: 2000, spawnInterval: 700 },
}

const DIFFICULTY_CONFIG: Record<Difficulty, { maxBubbles: number }> = {
  easy: { maxBubbles: 4 },
  medium: { maxBubbles: 5 },
  hard: { maxBubbles: 6 },
}

const BUBBLE_COLORS = [
  'rgba(74,124,111,0.55)',
  'rgba(184,212,206,0.50)',
  'rgba(200,96,42,0.45)',
  'rgba(100,160,220,0.50)',
]

const SIGHT_WORDS: Record<string, string[]> = {
  easy: ['the', 'and', 'is', 'in', 'it', 'of', 'to', 'was', 'he', 'she', 'for', 'on', 'are', 'as', 'at', 'be', 'by', 'do', 'go', 'if'],
  medium: ['said', 'have', 'from', 'they', 'we', 'but', 'not', 'what', 'all', 'were', 'when', 'your', 'can', 'an', 'each', 'which'],
  hard: ['because', 'through', 'where', 'before', 'right', 'too', 'does', 'another', 'large', 'often', 'together', 'always'],
}

const PHONICS_FAMILIES: Record<string, string[]> = {
  '-at': ['cat', 'bat', 'hat', 'mat', 'rat', 'sat', 'fat', 'pat'],
  '-an': ['can', 'ban', 'fan', 'man', 'pan', 'ran', 'tan', 'van'],
  '-ig': ['big', 'dig', 'fig', 'jig', 'pig', 'rig', 'wig'],
  '-op': ['cop', 'hop', 'mop', 'pop', 'top', 'bop', 'drop', 'stop'],
}

const RHYME_GROUPS: string[][] = [
  ['cat', 'bat', 'hat'], ['dog', 'log', 'fog'], ['sun', 'fun', 'run'],
  ['day', 'say', 'play'], ['book', 'look', 'cook'], ['cake', 'lake', 'make'],
]

const VOCABULARY = {
  animals: ['lion', 'tiger', 'eagle', 'shark', 'panda', 'koala'],
  colors: ['scarlet', 'violet', 'crimson', 'amber', 'ivory'],
  food: ['bread', 'fruit', 'cream', 'grain', 'salad', 'pasta'],
}

let bubbleIdCounter = 0

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateRound(wordSet: WordSet, difficulty: Difficulty, customWords: string[], customPrompt: string): { prompt: string; correctWord: string; allWords: string[] } {
  const maxBubbles = DIFFICULTY_CONFIG[difficulty].maxBubbles
  let allWords: string[] = []
  let correctWord = ''
  let prompt = ''

  if (wordSet === 'sight-words') {
    const pool = SIGHT_WORDS[difficulty] || SIGHT_WORDS.easy
    correctWord = pick(pool)
    const distractors = shuffle(pool.filter((w) => w !== correctWord)).slice(0, maxBubbles - 1)
    allWords = shuffle([correctWord, ...distractors])
    prompt = 'Pop a sight word!'
  } else if (wordSet === 'phonics') {
    const families = Object.keys(PHONICS_FAMILIES)
    const familyKey = pick(families)
    const pool = PHONICS_FAMILIES[familyKey]
    const familyWords = shuffle(pool)
    correctWord = familyWords[0]
    const distractors: string[] = []
    const otherWords = Object.entries(PHONICS_FAMILIES)
      .filter(([k]) => k !== familyKey)
      .flatMap(([, v]) => v)
    const shuffledOthers = shuffle(otherWords)
    for (let i = 0; i < maxBubbles - 1 && i < shuffledOthers.length; i++) {
      distractors.push(shuffledOthers[i])
    }
    allWords = shuffle([correctWord, ...distractors.slice(0, maxBubbles - 1)])
    prompt = `Pop a word from the ${familyKey} family`
  } else if (wordSet === 'rhymes') {
    const group = pick(RHYME_GROUPS)
    correctWord = pick(group)
    const sameGroup = group.filter((w) => w !== correctWord)
    const distractors: string[] = []
    const otherWords = RHYME_GROUPS.filter((g) => g !== group).flat()
    const shuffledOthers = shuffle(otherWords)
    for (let i = 0; i < maxBubbles - 1 && i < shuffledOthers.length; i++) {
      distractors.push(shuffledOthers[i])
    }
    allWords = shuffle([correctWord, ...distractors.slice(0, maxBubbles - 1)])
    prompt = `Pop a word that rhymes with ${correctWord.toUpperCase()}`
  } else if (wordSet === 'vocabulary') {
    const categories = Object.keys(VOCABULARY)
    const cat = pick(categories)
    const pool = VOCABULARY[cat as keyof typeof VOCABULARY]
    correctWord = pick(pool)
    const distractors = shuffle(pool.filter((w) => w !== correctWord)).slice(0, maxBubbles - 1)
    allWords = shuffle([correctWord, ...distractors])
    prompt = `Pop a${cat === 'animals' ? 'n' : ''} ${cat.slice(0, -1)} word`
  } else if (wordSet === 'custom') {
    const words = customWords.length > 0 ? customWords : ['hello', 'world']
    correctWord = pick(words)
    const distractors = shuffle(words.filter((w) => w !== correctWord)).slice(0, maxBubbles - 1)
    allWords = shuffle([correctWord, ...distractors])
    prompt = customPrompt || 'Pop the word!'
  }

  return { prompt, correctWord, allWords }
}

function spawnBubbles(allWords: string[], correctWord: string, difficulty: Difficulty, now: number): BubbleData[] {
  const maxBubbles = DIFFICULTY_CONFIG[difficulty].maxBubbles
  return allWords.slice(0, maxBubbles).map((word) => {
    bubbleIdCounter++
    const size = 52 + Math.floor(Math.random() * 20)
    return {
      id: `b${bubbleIdCounter}`,
      word,
      x: 8 + Math.random() * 74,
      size,
      color: pick(BUBBLE_COLORS),
      spawnedAt: now,
      isCorrect: word === correctWord,
      state: 'floating' as const,
    }
  })
}

export default function BubbleSplash({ sessionId, role, isLocked }: BubbleSplashProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [isPlaying, setIsPlaying] = useState(false)
  const [wordSet, setWordSet] = useState<WordSet>('sight-words')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [speed, setSpeed] = useState<Speed>('normal')
  const [prompt, setPrompt] = useState('')
  const [correctWord, setCorrectWord] = useState('')
  const [bubbles, setBubbles] = useState<BubbleData[]>([])
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [customWords, setCustomWords] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [showStreakBadge, setShowStreakBadge] = useState(false)
  const [streakBadgeText, setStreakBadgeText] = useState('')
  const [particles, setParticles] = useState<Particle[]>([])
  const [floatingStars, setFloatingStars] = useState<{ id: number; x: number; y: number }[]>([])
  const [waitingForTap, setWaitingForTap] = useState(true)

  const spawnTimerRef = useRef<ReturnType<typeof setInterval>>()
  const gameRef = useRef({ isPlaying, wordSet, difficulty, speed, customWords, customPrompt, bubbles, correctWord, score, streak })
  gameRef.current = { isPlaying, wordSet, difficulty, speed, customWords, customPrompt, bubbles, correctWord, score, streak }
  const starIdRef = useRef(0)
  const particleIdRef = useRef(0)

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
      if (typeof s.bsIsPlaying === 'boolean') setIsPlaying(s.bsIsPlaying)
      if (typeof s.bsWordSet === 'string') setWordSet(s.bsWordSet as WordSet)
      if (typeof s.bsDifficulty === 'string') setDifficulty(s.bsDifficulty as Difficulty)
      if (typeof s.bsSpeed === 'string') setSpeed(s.bsSpeed as Speed)
      if (typeof s.bsPrompt === 'string') setPrompt(s.bsPrompt)
      if (typeof s.bsCorrectWord === 'string') setCorrectWord(s.bsCorrectWord)
      if (Array.isArray(s.bsBubbles)) setBubbles(s.bsBubbles as BubbleData[])
      if (typeof s.bsScore === 'number') setScore(s.bsScore)
      if (typeof s.bsStreak === 'number') setStreak(s.bsStreak)
      if (typeof s.bsCustomWords === 'string') setCustomWords(s.bsCustomWords)
      if (typeof s.bsCustomPrompt === 'string') setCustomPrompt(s.bsCustomPrompt)
    })
    return () => unsub()
  }, [sessionId])

  const startNewRound = useCallback(() => {
    const { wordSet, difficulty, customWords, customPrompt } = gameRef.current
    const { prompt: p, correctWord: cw, allWords } = generateRound(wordSet, difficulty, customWords.split(',').map(s => s.trim()).filter(Boolean), customPrompt)
    setPrompt(p)
    setCorrectWord(cw)
    const now = Date.now()
    const newBubbles = spawnBubbles(allWords, cw, difficulty, now)
    setBubbles(newBubbles)
    setWaitingForTap(true)
    writeToFirestore({
      'moduleState.bsPrompt': p,
      'moduleState.bsCorrectWord': cw,
      'moduleState.bsBubbles': newBubbles.map(b => ({ ...b, spawnedAt: now })),
    })
  }, [writeToFirestore])

  const spawnTimerCallback = useCallback(() => {
    const { isPlaying, bubbles, difficulty } = gameRef.current
    if (!isPlaying) return
    const max = DIFFICULTY_CONFIG[difficulty].maxBubbles
    const active = bubbles.filter((b) => b.state === 'floating').length
    if (active < max) {
      startNewRound()
    }
  }, [startNewRound])

  useEffect(() => {
    if (!isPlaying) {
      if (spawnTimerRef.current) {
        clearInterval(spawnTimerRef.current)
        spawnTimerRef.current = undefined
      }
      return
    }

    const interval = SPEED_CONFIG[speed].spawnInterval
    spawnTimerRef.current = setInterval(spawnTimerCallback, interval)

    return () => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current)
    }
  }, [isPlaying, speed, spawnTimerCallback])

  const removeExpiredBubbles = useCallback(() => {
    setBubbles((prev) => {
      const next = prev.filter((b) => {
        if (b.state !== 'floating') return true
        const elapsed = Date.now() - b.spawnedAt
        const duration = SPEED_CONFIG[gameRef.current.speed].floatDuration
        return elapsed < duration
      })
      if (next.length !== prev.length) {
        writeToFirestore({ 'moduleState.bsBubbles': next })
      }
      return next
    })
  }, [writeToFirestore])

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(removeExpiredBubbles, 500)
    return () => clearInterval(interval)
  }, [isPlaying, removeExpiredBubbles])

  useEffect(() => {
    return () => {
      if (spawnTimerRef.current) clearInterval(spawnTimerRef.current)
    }
  }, [])

  const triggerParticles = (x: number, y: number) => {
    for (let i = 0; i < 6; i++) {
      const id = particleIdRef.current++
      setParticles((prev) => [...prev, { id, x, y }])
      setTimeout(() => {
        setParticles((prev) => prev.filter((p) => p.id !== id))
      }, 500)
    }
  }

  const triggerStar = (x: number, y: number) => {
    const id = starIdRef.current++
    setFloatingStars((prev) => [...prev, { id, x, y }])
    setTimeout(() => setFloatingStars((prev) => prev.filter((s) => s.id !== id)), 1600)
  }

  const handleBubbleTap = (bubble: BubbleData) => {
    if (!canInteract || !isPlaying || bubble.state !== 'floating' || !waitingForTap) return

    if (bubble.isCorrect) {
      const newScore = score + 1
      const newStreak = streak + 1
      setScore(newScore)
      setStreak(newStreak)
      setWaitingForTap(false)

      setBubbles((prev) => {
        const next = prev.map((b) => b.id === bubble.id ? { ...b, state: 'popped' as const } : b)
        writeToFirestore({
          'moduleState.bsBubbles': next,
          'moduleState.bsScore': newScore,
          'moduleState.bsStreak': newStreak,
        })
        return next
      })

      triggerParticles(50, 50)
      triggerStar(50, 50)

      if (newStreak === 3) {
        setStreakBadgeText('🔥 On a roll!')
        setShowStreakBadge(true)
        setTimeout(() => setShowStreakBadge(false), 2000)
      }
      if (newStreak >= 5) {
        triggerStar(30, 40)
        setTimeout(() => triggerStar(70, 30), 100)
      }

      setTimeout(() => startNewRound(), 600)
    } else {
      setStreak(0)
      setStreakBadgeText('')
      setShowStreakBadge(false)
      writeToFirestore({ 'moduleState.bsStreak': 0 })

      setBubbles((prev) => {
        const next = prev.map((b) => b.id === bubble.id ? { ...b, state: 'wrong' as const } : b)
        writeToFirestore({ 'moduleState.bsBubbles': next })
        return next
      })

      setTimeout(() => {
        setBubbles((prev) => {
          const next = prev.map((b) => b.id === bubble.id ? { ...b, state: 'floating' as const } : b)
          writeToFirestore({ 'moduleState.bsBubbles': next })
          return next
        })
      }, 500)
    }
  }

  const handleTogglePlaying = () => {
    const next = !isPlaying
    setIsPlaying(next)
    writeToFirestore({ 'moduleState.bsIsPlaying': next })

    if (!next && score > 0 && isTherapist) {
      logModuleEvent(sessionId, {
        module: 'bubble-splash-sld',
        type: 'practice_summary',
        detail: `Reading Bubbles practice (${wordSet}): ${score} bubble${score === 1 ? '' : 's'} popped correctly`,
      })
    }

    if (next) {
      if (!prompt) {
        const { prompt: p, correctWord: cw, allWords } = generateRound(wordSet, difficulty, customWords.split(',').map(s => s.trim()).filter(Boolean), customPrompt)
        setPrompt(p)
        setCorrectWord(cw)
        const now = Date.now()
        const newBubbles = spawnBubbles(allWords, cw, difficulty, now)
        setBubbles(newBubbles)
        setWaitingForTap(true)
        writeToFirestore({
          'moduleState.bsPrompt': p,
          'moduleState.bsCorrectWord': cw,
          'moduleState.bsBubbles': newBubbles.map(b => ({ ...b, spawnedAt: now })),
        })
      }
    }
  }

  const handleWordSetChange = (ws: WordSet) => {
    setWordSet(ws)
    setPrompt('')
    setCorrectWord('')
    setBubbles([])
    writeToFirestore({
      'moduleState.bsWordSet': ws,
      'moduleState.bsPrompt': '',
      'moduleState.bsCorrectWord': '',
      'moduleState.bsBubbles': [],
    })
  }

  const handleDifficultyChange = (d: Difficulty) => {
    setDifficulty(d)
    setBubbles([])
    writeToFirestore({
      'moduleState.bsDifficulty': d,
      'moduleState.bsBubbles': [],
    })
  }

  const handleSpeedChange = (s: Speed) => {
    setSpeed(s)
    writeToFirestore({ 'moduleState.bsSpeed': s })
  }

  const handleCustomWordsChange = (val: string) => {
    setCustomWords(val)
    writeToFirestore({ 'moduleState.bsCustomWords': val })
  }

  const handleCustomPromptChange = (val: string) => {
    setCustomPrompt(val)
    writeToFirestore({ 'moduleState.bsCustomPrompt': val })
  }

  const floatDur = SPEED_CONFIG[speed].floatDuration

  return (
    <>
      <style>{`
        @keyframes bsFloatUp {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          5%   { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateY(-400px) scale(0.97); opacity: 0; }
        }
        @keyframes bsPop {
          0%   { transform: scale(1); opacity: 1; }
          40%  { transform: scale(1.4); opacity: 0.8; }
          100% { transform: scale(0); opacity: 0; }
        }
        @keyframes bsWrongBounce {
          0%,100% { transform: scale(1); }
          30%     { transform: scale(0.85); }
          60%     { transform: scale(1.1); }
        }
        @keyframes bsSplash {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx),var(--dy)) scale(0); opacity: 0; }
        }
        @keyframes bsFloatStar {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-90px) scale(1.5); }
        }
        @keyframes bsFadeUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes bsStreakBadge {
          0% { opacity: 0; transform: translateY(6px); }
          15% { opacity: 1; transform: translateY(0); }
          75% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
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
            {/* Word set selector */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {[
                { key: 'sight-words' as WordSet, label: 'Sight' },
                { key: 'phonics' as WordSet, label: 'Phonics' },
                { key: 'rhymes' as WordSet, label: 'Rhymes' },
                { key: 'vocabulary' as WordSet, label: 'Vocab' },
                { key: 'custom' as WordSet, label: 'Custom' },
              ].map((ws) => (
                <button
                  key={ws.key}
                  onClick={() => handleWordSetChange(ws.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 7,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: wordSet === ws.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: wordSet === ws.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {ws.label}
                </button>
              ))}
            </div>

            {/* Custom words input */}
            {wordSet === 'custom' && (
              <div style={{ marginBottom: 5 }}>
                <input
                  value={customWords}
                  onChange={(e) => handleCustomWordsChange(e.target.value)}
                  placeholder="Comma-separated words"
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 8,
                    outline: 'none',
                    marginBottom: 4,
                    boxSizing: 'border-box',
                  }}
                />
                <input
                  value={customPrompt}
                  onChange={(e) => handleCustomPromptChange(e.target.value)}
                  placeholder="Custom prompt text"
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Difficulty */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {[
                { key: 'easy' as Difficulty, label: 'Easy' },
                { key: 'medium' as Difficulty, label: 'Medium' },
                { key: 'hard' as Difficulty, label: 'Hard' },
              ].map((d) => (
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

            {/* Speed */}
            <div className="flex items-center" style={{ gap: 3, marginBottom: 5 }}>
              {[
                { key: 'slow' as Speed, label: 'Slow' },
                { key: 'normal' as Speed, label: 'Normal' },
                { key: 'fast' as Speed, label: 'Fast' },
              ].map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleSpeedChange(s.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: speed === s.key ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.07)',
                    color: speed === s.key ? '#b8d4ce' : 'rgba(255,255,255,0.5)',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Start / Pause */}
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
                color: isPlaying ? '#c8602a' : '#b8d4ce',
                transition: 'all 0.15s',
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Start'}
            </button>
          </div>
        )}

        {/* Locked notice */}
        {!canInteract && (
          <div style={{ flexShrink: 0, fontSize: 9, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingBottom: 4 }}>
            Therapist is controlling
          </div>
        )}

        {/* Prompt display */}
        {prompt && (
          <div
            style={{
              flexShrink: 0,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: '#fff',
              textAlign: 'center',
              marginBottom: 6,
              animation: 'bsFadeUp 0.3s ease',
            }}
          >
            {prompt}
          </div>
        )}

        {/* Waiting state */}
        {!isPlaying && !prompt && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {isTherapist ? 'Press Start to begin' : 'Waiting for therapist to start...'}
            </span>
          </div>
        )}

        {/* MIDDLE — Bubble Canvas */}
        {(isPlaying || prompt) && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {bubbles.map((bubble) => {
              const elapsed = Date.now() - bubble.spawnedAt
              const animDelay = -Math.min(elapsed, floatDur) / 1000

              let animName = 'bsFloatUp'
              let animDuration = `${floatDur}ms`
              let animFill = 'forwards'
              let bgColor = bubble.color
              let opacity = 1
              let pointerStyle: React.CSSProperties = {}

              if (bubble.state === 'popped') {
                animName = 'bsPop'
                animDuration = '0.3s'
                animFill = 'forwards'
                pointerStyle = { pointerEvents: 'none' as const }
              } else if (bubble.state === 'wrong') {
                animName = 'bsWrongBounce'
                animDuration = '0.4s'
                animFill = 'forwards'
                bgColor = 'rgba(200,96,42,0.6)'
                pointerStyle = { pointerEvents: 'none' as const }
              } else if (bubble.state === 'expired') {
                opacity = 0
                pointerStyle = { pointerEvents: 'none' as const }
              }

              return (
                <div
                  key={bubble.id}
                  onClick={() => handleBubbleTap(bubble)}
                  style={{
                    position: 'absolute',
                    left: `${bubble.x}%`,
                    bottom: -80,
                    width: bubble.size,
                    height: bubble.size,
                    borderRadius: '50%',
                    background: bgColor,
                    border: '1.5px solid rgba(255,255,255,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.15), inset 0 4px 8px rgba(255,255,255,0.2)',
                    animation: `${animName} ${animDuration} ease-in-out ${animFill}`,
                    animationDelay: bubble.state === 'floating' ? `${animDelay}s` : '0s',
                    cursor: canInteract && isPlaying && bubble.state === 'floating' && waitingForTap ? 'pointer' : 'default',
                    opacity,
                    zIndex: bubble.state === 'popped' ? 5 : 1,
                    ...pointerStyle,
                  }}
                >
                  {/* Shimmer */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '15%',
                      left: '20%',
                      width: '35%',
                      height: '25%',
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.35)',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Word */}
                  <span
                    style={{
                      fontSize: bubble.size >= 64 ? 13 : 11,
                      fontWeight: 500,
                      color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                      textAlign: 'center',
                      padding: 4,
                      lineHeight: 1.2,
                      pointerEvents: 'none',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {bubble.word}
                  </span>

                  {/* Splash particles */}
                  {bubble.state === 'popped' && particles.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        position: 'absolute',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#b8d4ce',
                        left: '50%',
                        top: '50%',
                        animation: 'bsSplash 0.5s ease forwards',
                        '--dx': `${(Math.random() - 0.5) * 60}px`,
                        '--dy': `${(Math.random() - 0.5) * 60}px`,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )
            })}

            {/* Floating stars */}
            {floatingStars.map((star) => (
              <div
                key={star.id}
                style={{
                  position: 'absolute',
                  left: `${star.x}%`,
                  top: `${star.y}%`,
                  fontSize: 20,
                  zIndex: 10,
                  pointerEvents: 'none',
                  animation: 'bsFloatStar 1.4s ease forwards',
                }}
              >
                ⭐
              </div>
            ))}
          </div>
        )}

        {/* BOTTOM — Score */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            marginTop: 6,
            position: 'relative',
          }}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            💧 {score} bubbles popped
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
            ⚡ {streak} in a row
          </span>

          {/* Streak badge */}
          {showStreakBadge && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: -16,
                transform: 'translateX(-50%)',
                fontSize: 9,
                fontWeight: 600,
                color: '#fff',
                background: 'rgba(74,124,111,0.85)',
                padding: '2px 10px',
                borderRadius: 8,
                whiteSpace: 'nowrap',
                animation: 'bsStreakBadge 2s ease forwards',
                zIndex: 20,
              }}
            >
              {streakBadgeText}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
