'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface WordBuildingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'custom'

const WORDS: Record<Exclude<Difficulty, 'custom'>, string[]> = {
  easy: ['cat', 'dog', 'hat', 'sun', 'run', 'big', 'red', 'cup', 'sit', 'hot', 'man', 'bus', 'fog', 'pen', 'web', 'zip', 'jam', 'mud', 'leg', 'fin'],
  medium: ['apple', 'chair', 'bread', 'cloud', 'flame', 'grass', 'plant', 'tiger', 'stone', 'crown', 'shelf', 'train', 'globe', 'stamp'],
  hard: ['captain', 'explore', 'blanket', 'freedom', 'justice', 'dolphin', 'journey', 'primary', 'thunder', 'support'],
}

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'custom', label: 'Custom' },
]

function shuffleArray(arr: string[]): string[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function WordBuilding({ sessionId, role, isLocked }: WordBuildingProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [targetWord, setTargetWord] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [tiles, setTiles] = useState<string[]>([])
  const [slots, setSlots] = useState<(number | null)[]>([])
  const [score, setScore] = useState(0)
  const [customInput, setCustomInput] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [checked, setChecked] = useState(false)
  const [wrongIndices, setWrongIndices] = useState<Set<number>>(new Set())
  const [celebrating, setCelebrating] = useState(false)
  const [celebrationEmojis, setCelebrationEmojis] = useState<{ id: number; x: number }[]>([])
  const [dragging, setDragging] = useState<{ tileIndex: number; offsetX: number; offsetY: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [selectedTile, setSelectedTile] = useState<number | null>(null)

  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const poolRef = useRef<HTMLDivElement>(null)
  const celebIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const ref = useRef({ targetWord: '', tiles, slots, difficulty, wordIndex, score })
  ref.current = { targetWord, tiles, slots, difficulty, wordIndex, score }

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
      const state = data.moduleState || {}
      if (typeof state.wbTargetWord === 'string' && state.wbTargetWord) {
        setTargetWord(state.wbTargetWord)
      }
      if (typeof state.wbDifficulty === 'string') {
        setDifficulty(state.wbDifficulty as Difficulty)
      }
      if (Array.isArray(state.wbTiles)) {
        setTiles(state.wbTiles)
      }
      if (Array.isArray(state.wbSlots)) {
        setSlots(state.wbSlots)
      }
      if (typeof state.wbScore === 'number') {
        setScore(state.wbScore)
      }
    })
    return () => unsub()
  }, [sessionId])

  const setWord = useCallback((word: string, diff: Difficulty) => {
    if (!word || word.length > 10) return
    const letters = word.toLowerCase().split('')
    const shuffled = shuffleArray(letters)
    setTargetWord(word)
    setTiles(shuffled)
    setSlots(new Array(word.length).fill(null))
    setChecked(false)
    setWrongIndices(new Set())
    setSelectedTile(null)
    writeToFirestore({
      'moduleState.wbTargetWord': word,
      'moduleState.wbDifficulty': diff,
      'moduleState.wbTiles': shuffled,
      'moduleState.wbSlots': new Array(word.length).fill(null),
      'moduleState.wbScore': ref.current.score,
    })
  }, [writeToFirestore])

  const advanceToNextWord = useCallback(() => {
    const { difficulty, wordIndex } = ref.current
    if (difficulty === 'custom') return
    const list = WORDS[difficulty]
    const nextIdx = (wordIndex + 1) % list.length
    setWordIndex(nextIdx)
    setWord(list[nextIdx], difficulty)
  }, [setWord])

  const handleDifficultySelect = (diff: Difficulty) => {
    setDifficulty(diff)
    if (diff !== 'custom') {
      setCustomInput('')
      setWordIndex(0)
      setWord(WORDS[diff][0], diff)
    }
  }

  const handleCustomSubmit = () => {
    const word = customInput.trim().toLowerCase()
    if (word.length < 2 || word.length > 10) return
    setWordIndex(-1)
    setWord(word, 'custom')
  }

  const startDrag = (tileIndex: number, clientX: number, clientY: number) => {
    setSelectedTile(null)
    setDragging({ tileIndex, offsetX: 0, offsetY: 0 })
    setDragPos({ x: clientX, y: clientY })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    setDragPos({ x: e.clientX, y: e.clientY })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    const { tileIndex } = dragging
    const slotEl = document.elementFromPoint(e.clientX, e.clientY)
    let slotIndex: number | null = null
    for (let i = 0; i < slotRefs.current.length; i++) {
      if (slotRefs.current[i] && slotRefs.current[i]!.contains(slotEl)) {
        slotIndex = i
        break
      }
    }
    if (slotIndex !== null && slots[slotIndex] === null && tiles[tileIndex]) {
      const newSlots = [...slots]
      newSlots[slotIndex] = tileIndex
      setSlots(newSlots)
      setChecked(false)
      setWrongIndices(new Set())
      writeToFirestore({ 'moduleState.wbSlots': newSlots })
    }
    setDragging(null)
    setDragPos(null)
  }

  const handleTileClick = (tileIndex: number) => {
    if (!canInteract) return
    if (!targetWord) return
    if (dragging) return
    setSelectedTile(selectedTile === tileIndex ? null : tileIndex)
  }

  const handleSlotClick = (slotIndex: number) => {
    if (!canInteract) return
    if (slots[slotIndex] === null && selectedTile !== null && tiles[selectedTile]) {
      const newSlots = [...slots]
      newSlots[slotIndex] = selectedTile
      setSlots(newSlots)
      setChecked(false)
      setWrongIndices(new Set())
      setSelectedTile(null)
      writeToFirestore({ 'moduleState.wbSlots': newSlots })
    } else if (slots[slotIndex] !== null && selectedTile === null) {
      const newSlots = [...slots]
      newSlots[slotIndex] = null
      setSlots(newSlots)
      setChecked(false)
      setWrongIndices(new Set())
      writeToFirestore({ 'moduleState.wbSlots': newSlots })
    }
  }

  const speakWord = useCallback((word: string) => {
    if (!word || typeof window === 'undefined') return
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.rate = 0.85
    utterance.pitch = 1.1
    window.speechSynthesis.speak(utterance)
  }, [])

  useEffect(() => {
    if (!targetWord || slots.includes(null) || checked) return
    const slotLetters = slots.map((idx) => (idx !== null ? tiles[idx] : ''))
    const allFilled = slotLetters.every((l) => l !== '')
    if (!allFilled) return

    setChecked(true)
    const wrong = new Set<number>()
    let allCorrect = true
    for (let i = 0; i < targetWord.length; i++) {
      if (slotLetters[i] !== targetWord[i]) {
        wrong.add(i)
        allCorrect = false
      }
    }
    if (!allCorrect) {
      setWrongIndices(wrong)
      return
    }

    const newScore = ref.current.score + 1
    setScore(newScore)
    writeToFirestore({ 'moduleState.wbScore': newScore })
    setCelebrating(true)
    if (isTherapist) {
      logModuleEvent(sessionId, {
        module: 'word-building',
        type: 'word_built',
        detail: `Correctly built the word "${targetWord}" (${newScore} word${newScore === 1 ? '' : 's'} this session)`,
      })
    }

    speakWord(targetWord)

    const emojis: { id: number; x: number }[] = []
    for (let i = 0; i < 6; i++) {
      emojis.push({
        id: celebIdRef.current++,
        x: 30 + Math.random() * 40,
      })
    }
    setCelebrationEmojis(emojis)
    setTimeout(() => setCelebrationEmojis([]), 1800)

    if (ref.current.difficulty !== 'custom') {
      timerRef.current = setTimeout(() => {
        setCelebrating(false)
        advanceToNextWord()
      }, 1500)
    } else {
      timerRef.current = setTimeout(() => setCelebrating(false), 1500)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [targetWord, slots, tiles, checked, speakWord, writeToFirestore, advanceToNextWord, isTherapist, sessionId])

  const poolTileIndices = slots.reduce((used, idx) => {
    if (idx !== null) used.add(idx)
    return used
  }, new Set<number>())

  const usedIndices = new Set(slots.filter((s): s is number => s !== null))

  const slotLetters = slots.map((idx) => (idx !== null ? tiles[idx] : null))

  const allFilled = targetWord.length > 0 && slots.length > 0 && slots.every((s) => s !== null)

  return (
    <>
      <style>{`
        @keyframes wbShake {
          0%, 100% { transform: translateX(0) }
          25% { transform: translateX(-4px) }
          75% { transform: translateX(4px) }
        }
        @keyframes wbFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-80px) scale(1.4) }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 8,
        }}
      >
        {/* Therapist controls */}
        {isTherapist && (
          <div style={{ flexShrink: 0 }}>
            <div className="flex items-center" style={{ gap: 4, marginBottom: 6 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => handleDifficultySelect(d.key)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    borderRadius: 14,
                    border: 'none',
                    fontSize: 9,
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
            {difficulty === 'custom' && (
              <div className="flex items-center" style={{ gap: 4 }}>
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 10))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit() }}
                  placeholder="Type a word"
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'rgba(255,255,255,0.8)',
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleCustomSubmit}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(74,124,111,0.3)',
                    color: '#b8d4ce',
                    fontSize: 9,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Set
                </button>
              </div>
            )}
          </div>
        )}

        {/* Waiting state */}
        {!targetWord && (
          <div className="flex flex-col items-center justify-center" style={{ flex: 1 }}>
            <span style={{ fontSize: 28, marginBottom: 8 }}>🔤</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {isTherapist ? 'Select a word to begin' : 'Waiting for therapist to set a word...'}
            </span>
          </div>
        )}

        {/* Game area */}
        {targetWord && (
          <>
            {/* Target word dashes */}
            <div
              className="flex items-center justify-center"
              style={{
                gap: 6,
                padding: '6px 0',
                flexShrink: 0,
              }}
            >
              {targetWord.split('').map((_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      width: 28,
                      height: 2,
                      borderRadius: 1,
                      background: slotLetters[i] ? 'rgba(74,124,111,0.5)' : 'rgba(255,255,255,0.25)',
                      transition: 'background 0.2s',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Answer slots */}
            <div
              className="flex items-center justify-center"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                gap: 5,
                flexWrap: 'wrap',
                flexShrink: 0,
                minHeight: 40,
                touchAction: 'none',
              }}
            >
              {targetWord.split('').map((_, i) => {
                const isWrong = wrongIndices.has(i)
                const isCorrect = checked && !isWrong && slots[i] !== null
                return (
                  <div
                    key={i}
                    ref={(el) => { slotRefs.current[i] = el }}
                    onClick={() => handleSlotClick(i)}
                    style={{
                      width: 32,
                      height: 36,
                      borderRadius: 7,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 500,
                      color: '#fff',
                      cursor: !canInteract ? 'default' : slots[i] !== null ? 'pointer' : selectedTile !== null ? 'pointer' : 'default',
                      background: isCorrect
                        ? 'rgba(74,124,111,0.4)'
                        : isWrong
                        ? 'rgba(200,96,42,0.3)'
                        : slots[i] !== null
                        ? 'rgba(255,255,255,0.12)'
                        : 'rgba(255,255,255,0.06)',
                      border: isCorrect
                        ? '1.5px solid rgba(74,124,111,0.6)'
                        : isWrong
                        ? '1.5px solid rgba(200,96,42,0.5)'
                        : slots[i] !== null
                        ? '1.5px solid rgba(255,255,255,0.3)'
                        : '1.5px dashed rgba(255,255,255,0.2)',
                      animation: isWrong ? 'wbShake 0.4s ease' : 'none',
                      transition: 'all 0.15s',
                      userSelect: 'none',
                    }}
                  >
                    {slotLetters[i] || ''}
                  </div>
                )
              })}
            </div>

            {/* Scrambled tiles pool */}
            <div
              ref={poolRef}
              className="flex items-center justify-center"
              style={{
                gap: 5,
                flexWrap: 'wrap',
                flexShrink: 0,
                minHeight: 40,
                padding: '4px 0',
              }}
            >
              {tiles.map((letter, idx) => {
                if (usedIndices.has(idx)) return null
                const isDragging = dragging?.tileIndex === idx
                const isSelected = selectedTile === idx
                return (
                  <div
                    key={idx}
                    onPointerDown={(e) => {
                      if (!canInteract) return
                      e.preventDefault()
                      startDrag(idx, e.clientX, e.clientY)
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTileClick(idx)
                    }}
                    style={{
                      width: 32,
                      height: 36,
                      borderRadius: 7,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 500,
                      color: '#fff',
                      cursor: canInteract ? 'grab' : 'default',
                      opacity: isDragging ? 0.3 : 1,
                      background: isSelected
                        ? 'rgba(74,124,111,0.35)'
                        : 'rgba(255,255,255,0.10)',
                      border: isSelected
                        ? '1.5px solid rgba(74,124,111,0.6)'
                        : '1px solid rgba(255,255,255,0.18)',
                      transform: isSelected ? 'scale(1.1)' : 'none',
                      transition: 'all 0.12s',
                      userSelect: 'none',
                      touchAction: 'none',
                      visibility: isDragging ? 'hidden' : 'visible',
                    }}
                  >
                    {letter}
                  </div>
                )
              })}
            </div>

            {/* Drag ghost */}
            {dragging && dragPos && (
              <div
                style={{
                  position: 'fixed',
                  left: dragPos.x - 16,
                  top: dragPos.y - 18,
                  width: 32,
                  height: 36,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 500,
                  color: '#fff',
                  background: 'rgba(74,124,111,0.5)',
                  border: '1.5px solid rgba(74,124,111,0.7)',
                  zIndex: 999,
                  pointerEvents: 'none',
                  transform: 'scale(1.1)',
                  opacity: 0.9,
                }}
              >
                {tiles[dragging.tileIndex]}
              </div>
            )}

            {/* Celebration */}
            {celebrationEmojis.map((ce) => (
              <div
                key={ce.id}
                style={{
                  position: 'absolute',
                  left: `${ce.x}%`,
                  top: '45%',
                  fontSize: 24,
                  zIndex: 20,
                  pointerEvents: 'none',
                  animation: 'wbFloatUp 1.6s ease forwards',
                }}
              >
                🎉
              </div>
            ))}

            {/* Score & buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'auto',
                paddingTop: 6,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                ✓ {score} words
              </span>
              <div className="flex items-center" style={{ gap: 4 }}>
                <button
                  onClick={() => speakWord(targetWord)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: 9,
                    cursor: 'pointer',
                  }}
                >
                  🔊 Say it
                </button>
                {isTherapist && difficulty !== 'custom' && (
                  <button
                    onClick={() => {
                      const nextIdx = (wordIndex + 1) % WORDS[difficulty].length
                      setWordIndex(nextIdx)
                      setWord(WORDS[difficulty][nextIdx], difficulty)
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 5,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 9,
                      cursor: 'pointer',
                    }}
                  >
                    Next word
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
