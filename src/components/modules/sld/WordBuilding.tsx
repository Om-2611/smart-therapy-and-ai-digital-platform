'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { Star, BarChart3, SlidersHorizontal, Volume2, RotateCcw, Check, ChevronRight } from 'lucide-react'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'
import { staadSpeak, randomPraise } from '@/lib/voice/staadVoice'
import { useVoiceLanguage } from '@/lib/voice/useVoiceLanguage'
import VoiceLanguageToggle from '@/components/modules/VoiceLanguageToggle'

/* ---------------------------------------------------------------------------
   Art + audio assets. The delivered folder name contains spaces, so every path
   segment is encoded individually and everything is referenced with plain
   URLs / new Audio() — next/image can't take these paths. Same helper shape as
   WorryVault and GroundingGame.
--------------------------------------------------------------------------- */
const A = (f: string) =>
  `/assets/modules/SLD/${encodeURIComponent('word building assets')}/${encodeURIComponent(f)}`

const WB_CHIME = A('Success_Chime_Correct_Word (1).wav')

/* The delivered scene: glowing pastel letters, stars and swooshes painted on a
   black matte, so it can't be dropped straight onto a pale ground. It is laid
   in as a `screen`-blended layer over the pastel plate below — screen leaves
   the black matte untouched and only lifts the artwork, which both knocks the
   matte out and can never darken the canvas under the dark body copy. */
const WB_SCENE = `/assets/modules/Background/${encodeURIComponent('word building.png')}`

/* Per-letter phonics clips extracted from word_audio_A-Z.zip (A_Apple.mp3 …
   Z_Zebra.mp3), copied into the asset folder flat as letter_a.mp3 … letter_z.mp3
   so a letter maps straight to a file. Lazily constructed and cached. */
const letterAudio: Record<string, HTMLAudioElement> = {}
function playLetter(letter: string) {
  try {
    if (typeof window === 'undefined') return
    const k = letter.toLowerCase()
    if (!/^[a-z]$/.test(k)) return
    let a = letterAudio[k]
    if (!a) {
      a = new Audio(A(`letter_${k}.mp3`))
      letterAudio[k] = a
    }
    a.currentTime = 0
    void a.play()
  } catch {}
}

/* One-shot success chime, lazily created so nothing touches window during SSR. */
let wbChime: HTMLAudioElement | null = null
function playChime() {
  try {
    if (typeof window === 'undefined') return
    if (!wbChime) wbChime = new Audio(WB_CHIME)
    wbChime.currentTime = 0
    void wbChime.play()
  } catch {}
}

/* ---------------------------------------------------------------------------
   Palette. This renders on the WHITE ModuleStage canvas, so every letter and
   label is dark ink on a pale surface; white type appears only on the solid
   green knob. Pastel tile tones come straight from the mockup.
--------------------------------------------------------------------------- */
const GREEN = '#16A34A'
const GREEN_DEEP = '#15803D'
const INK = '#1F2937'
const INK_BODY = '#3F4A57'
const MUTED = '#64748B'
const BORDER = '#e7eaef'
const CARD = 'rgba(255,255,255,0.94)'
const CARD_SHADOW = '0 1px 2px rgba(24,40,60,0.04), 0 8px 22px rgba(24,40,60,0.06)'

const TILE_TONES = [
  { bg: '#DCFCE7', edge: '#B4EBC7', lip: '#A3E0B7' }, // mint
  { bg: '#FEF3C7', edge: '#F5DC93', lip: '#EBCE7D' }, // amber
  { bg: '#E0E7FF', edge: '#BFCCFA', lip: '#AFBEF6' }, // periwinkle
]

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

/* Presentation only — the keys and labels are the originals, the icon and tint
   are what the mockup's segmented bar draws next to each label. */
const DIFFICULTIES: { key: Difficulty; label: string; Icon: typeof Star; tint: string }[] = [
  { key: 'easy', label: 'Easy', Icon: Star, tint: '#16A34A' },
  { key: 'medium', label: 'Medium', Icon: BarChart3, tint: '#2563EB' },
  { key: 'hard', label: 'Hard', Icon: Star, tint: '#7C3AED' },
  { key: 'custom', label: 'Custom', Icon: SlidersHorizontal, tint: '#D97706' },
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
  const isT = role === 'therapist'
  const isTherapist = isT
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
  /* Pure presentation: flipped by the Check pill so the mistake shake replays
     even when the wrong indices are unchanged (swapping the animation-name is
     what restarts a CSS animation). Never persisted. */
  const [shakeKey, setShakeKey] = useState(0)
  const voiceLanguage = useVoiceLanguage(sessionId)

  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const poolRef = useRef<HTMLDivElement>(null)
  const celebIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const ref = useRef({ targetWord: '', tiles, slots, difficulty, wordIndex, score })
  ref.current = { targetWord, tiles, slots, difficulty, wordIndex, score }

  // Read through a ref so the success effect's dependencies (and therefore the
  // game logic) are untouched by a language change.
  const voiceLangRef = useRef(voiceLanguage)
  voiceLangRef.current = voiceLanguage

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

  // The target word is always spoken in English — it IS the English word being
  // built — so this one call stays on 'en-IN' regardless of the praise language.
  const speakWord = useCallback((word: string) => {
    if (!word) return
    staadSpeak({ text: word, language: 'en-IN', type: 'instruction' })
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

    // Delivered success chime, then the reward voice: shared praise phrase and
    // the word itself (queued behind it by the speech engine) so the word is
    // still reinforced as it was before.
    playChime()
    staadSpeak({ text: randomPraise(voiceLangRef.current), language: voiceLangRef.current, type: 'praise' })
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
  void poolTileIndices

  const usedIndices = new Set(slots.filter((s): s is number => s !== null))

  const slotLetters = slots.map((idx) => (idx !== null ? tiles[idx] : null))

  const allFilled = targetWord.length > 0 && slots.length > 0 && slots.every((s) => s !== null)

  /* ---- Redesigned controls, all wired to state that already existed ---- */

  // Returns every tile to the pool by clearing the existing wbSlots array.
  const handleReset = () => {
    if (!canInteract || !targetWord) return
    const cleared = new Array(targetWord.length).fill(null)
    setSlots(cleared)
    setChecked(false)
    setWrongIndices(new Set())
    setSelectedTile(null)
    writeToFirestore({ 'moduleState.wbSlots': cleared })
  }

  // Re-marks the mistakes. Validation still happens automatically the moment the
  // last slot is filled — this only replays that feedback on demand, and never
  // touches the score, the checked flag or Firestore.
  const handleCheck = () => {
    if (!allFilled) return
    const wrong = new Set<number>()
    for (let i = 0; i < targetWord.length; i++) {
      const idx = slots[i]
      if (idx === null || tiles[idx] !== targetWord[i]) wrong.add(i)
    }
    setWrongIndices(wrong)
    setShakeKey((k) => k + 1)
  }

  const canNextWord = isTherapist && difficulty !== 'custom' && !!targetWord
  const handleNextWord = () => {
    if (!canNextWord) return
    const nextIdx = (wordIndex + 1) % WORDS[difficulty as Exclude<Difficulty, 'custom'>].length
    setWordIndex(nextIdx)
    setWord(WORDS[difficulty as Exclude<Difficulty, 'custom'>][nextIdx], difficulty)
  }

  /* Progress denominator is derived, never stored: the length of the active
     word list (and a plain 8-word run for custom words, which have no list).
     Widened by the score so the fraction can never read "12 / 8". */
  const goalBase = difficulty === 'custom' ? 8 : WORDS[difficulty as Exclude<Difficulty, 'custom'>].length
  const goal = Math.max(goalBase, score)
  const pct = goal > 0 ? Math.min(100, (score / goal) * 100) : 0

  return (
    <>
      <style>{`
        @keyframes wbShake {
          0%, 100% { transform: translateX(0) }
          25% { transform: translateX(-4px) }
          75% { transform: translateX(4px) }
        }
        @keyframes wbShakeB {
          0%, 100% { transform: translateX(0) }
          25% { transform: translateX(-4px) }
          75% { transform: translateX(4px) }
        }
        @keyframes wbFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-80px) scale(1.4) }
        }
        @keyframes wbCelebrate {
          0%, 100% { box-shadow: ${CARD_SHADOW} }
          50% { box-shadow: 0 0 0 2px rgba(22,163,74,0.30), 0 12px 30px rgba(22,163,74,0.20) }
        }
        .wb-scroll { scrollbar-width: thin; scrollbar-color: rgba(22,163,74,0.28) transparent; }
        .wb-scroll::-webkit-scrollbar { width: 8px; }
        .wb-scroll::-webkit-scrollbar-thumb { background: rgba(22,163,74,0.28); border-radius: 8px; }
        .wb-input::placeholder { color: #97A3B4; }
        .wb-input:focus { border-color: ${GREEN}; box-shadow: 0 0 0 3px rgba(22,163,74,0.14); }
        .wb-mode:not(:disabled):hover { background: #F6FAF7; }
        .wb-act:not(:disabled):hover { filter: brightness(0.97); }
        /* VoiceLanguageToggle is styled for a dark surface — its labels are
           translucent white, which would be invisible here. Re-ink it for the
           white card without editing the shared component. */
        .wb-voice span { color: ${MUTED} !important; }
        .wb-voice > div > div { background: #F4F6F9 !important; }
        .wb-voice button { color: ${INK_BODY} !important; }
      `}</style>

      {/* Root fills the stage: the pastel plate carries the scene art, and the
          single scrolling region lives inside it so overflow never reaches the
          page. */}
      <div
        style={{
          height: '100%',
          minHeight: 0,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          borderRadius: 20,
          overflow: 'hidden',
          isolation: 'isolate',
          fontFamily: "'DM Sans', sans-serif",
          backgroundColor: '#EAF1F8',
          backgroundImage: 'linear-gradient(155deg, #E8F1FA 0%, #EEF9F0 48%, #FCF3E5 100%)',
        }}
      >
        {/* Scene layer — cover + centred, screened over the plate above. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            backgroundImage: `url("${WB_SCENE}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center',
            backgroundRepeat: 'no-repeat',
            mixBlendMode: 'screen',
            opacity: 0.9,
          }}
        />

        <div
          className="wb-scroll"
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '18px 20px 22px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1120,
              margin: '0 auto',
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
            }}
          >
            {/* ---------- Mode bar + language chip ---------- */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
              <div
                style={{
                  flex: '1 1 420px',
                  display: 'flex',
                  alignItems: 'stretch',
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 999,
                  padding: 6,
                  boxShadow: CARD_SHADOW,
                }}
              >
                {DIFFICULTIES.map((d, di) => {
                  const active = difficulty === d.key
                  const Icon = d.Icon
                  return (
                    <div key={d.key} style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative', minWidth: 0 }}>
                      {di > 0 && (
                        <span
                          aria-hidden
                          style={{
                            width: 1,
                            height: 26,
                            flexShrink: 0,
                            background: active || difficulty === DIFFICULTIES[di - 1].key ? 'transparent' : '#E8ECF1',
                          }}
                        />
                      )}
                      <button
                        className="wb-mode"
                        onClick={() => { if (isT) handleDifficultySelect(d.key) }}
                        disabled={!isT}
                        aria-pressed={active}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          padding: '13px 14px',
                          borderRadius: 999,
                          border: active ? `1.5px solid ${GREEN}` : '1.5px solid transparent',
                          background: active ? '#F3FBF5' : 'transparent',
                          color: active ? GREEN_DEEP : INK_BODY,
                          fontSize: 15,
                          fontWeight: 600,
                          fontFamily: "'DM Sans', sans-serif",
                          cursor: isT ? 'pointer' : 'default',
                          transition: 'background .15s, border-color .15s, color .15s',
                        }}
                      >
                        <Icon size={19} color={d.tint} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                      </button>
                      {active && (
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute',
                            left: '22%',
                            right: '22%',
                            bottom: -10,
                            height: 4,
                            borderRadius: 999,
                            background: GREEN,
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {isT && (
                <div
                  className="wb-voice"
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 14px',
                    borderRadius: 999,
                    background: CARD,
                    border: `1px solid ${BORDER}`,
                    boxShadow: CARD_SHADOW,
                  }}
                >
                  <VoiceLanguageToggle sessionId={sessionId} language={voiceLanguage} />
                </div>
              )}
            </div>

            {/* ---------- Custom word entry (therapist) ---------- */}
            {isT && difficulty === 'custom' && (
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 18,
                  padding: '16px 18px',
                  boxShadow: CARD_SHADOW,
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: MUTED, flexShrink: 0 }}>Custom word</span>
                <input
                  className="wb-input"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 10))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit() }}
                  placeholder="Type a word"
                  style={{
                    flex: '1 1 220px',
                    minWidth: 0,
                    background: '#ffffff',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 14,
                    padding: '13px 16px',
                    color: INK,
                    fontSize: 15,
                    fontFamily: "'DM Sans', sans-serif",
                    outline: 'none',
                    transition: 'border-color .15s, box-shadow .15s',
                  }}
                />
                <button
                  className="wb-act"
                  onClick={handleCustomSubmit}
                  style={{
                    flexShrink: 0,
                    padding: '13px 26px',
                    borderRadius: 999,
                    border: 'none',
                    background: GREEN,
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(22,163,74,0.26)',
                  }}
                >
                  Set word
                </button>
              </div>
            )}

            {/* ---------- Waiting state ---------- */}
            {!targetWord && (
              <div
                style={{
                  flex: 1,
                  minHeight: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 22,
                  padding: 24,
                  boxShadow: CARD_SHADOW,
                }}
              >
                <span style={{ fontSize: 34 }}>🔤</span>
                <span style={{ fontSize: 15, fontWeight: 500, color: INK_BODY, textAlign: 'center' }}>
                  {isT ? 'Pick a level above to set the first word' : 'Waiting for your therapist to set a word…'}
                </span>
              </div>
            )}

            {/* ---------- Activity + action rail ---------- */}
            {targetWord && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
                {/* Activity card */}
                <div
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    flex: '1 1 460px',
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 20,
                    background: CARD,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 22,
                    padding: '22px 20px 24px',
                    boxShadow: CARD_SHADOW,
                    touchAction: 'none',
                    animation: celebrating ? 'wbCelebrate 1.4s ease' : 'none',
                  }}
                >
                  {/* Instruction line — body copy, not a second module title. */}
                  <button
                    onClick={() => speakWord(targetWord)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: 'none',
                      background: 'transparent',
                      color: GREEN_DEEP,
                      fontSize: 15,
                      fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Volume2 size={19} color={GREEN} strokeWidth={2.2} />
                    Build the word shown in the blanks
                  </button>

                  {/* Answer slots */}
                  <div
                    className="flex items-center justify-center"
                    style={{ gap: 14, flexWrap: 'wrap', flexShrink: 0, minHeight: 68 }}
                  >
                    {targetWord.split('').map((_, i) => {
                      const isWrong = wrongIndices.has(i)
                      const isCorrect = checked && !isWrong && slots[i] !== null
                      const filled = slots[i] !== null
                      return (
                        <div
                          key={i}
                          ref={(el) => { slotRefs.current[i] = el }}
                          onClick={() => handleSlotClick(i)}
                          style={{
                            width: 64,
                            height: 68,
                            borderRadius: 16,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 32,
                            fontWeight: 700,
                            lineHeight: 1,
                            color: isWrong ? '#B3441C' : INK,
                            cursor: !canInteract ? 'default' : filled ? 'pointer' : selectedTile !== null ? 'pointer' : 'default',
                            background: isCorrect
                              ? '#E6F8ED'
                              : isWrong
                              ? '#FDECE4'
                              : filled
                              ? '#FFFFFF'
                              : '#F7FCF8',
                            border: isCorrect
                              ? `2px solid ${GREEN}`
                              : isWrong
                              ? '2px solid #E1834F'
                              : filled
                              ? '2px solid #CBD5E1'
                              : '2px dashed #9AD3AE',
                            animation: isWrong ? (shakeKey % 2 === 0 ? 'wbShake 0.4s ease' : 'wbShakeB 0.4s ease') : 'none',
                            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          {slotLetters[i] || ''}
                        </div>
                      )
                    })}
                  </div>

                  {/* Scrambled tile pool */}
                  <div
                    ref={poolRef}
                    className="flex items-center justify-center"
                    style={{ gap: 14, flexWrap: 'wrap', flexShrink: 0, minHeight: 78 }}
                  >
                    {tiles.map((letter, idx) => {
                      if (usedIndices.has(idx)) return null
                      const isDragging = dragging?.tileIndex === idx
                      const isSelected = selectedTile === idx
                      const tone = TILE_TONES[idx % TILE_TONES.length]
                      return (
                        <div
                          key={idx}
                          onPointerDown={(e) => {
                            if (!canInteract) return
                            e.preventDefault()
                            playLetter(letter)
                            startDrag(idx, e.clientX, e.clientY)
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTileClick(idx)
                          }}
                          style={{
                            width: 72,
                            height: 78,
                            borderRadius: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 34,
                            fontWeight: 700,
                            lineHeight: 1,
                            color: INK,
                            cursor: canInteract ? 'grab' : 'default',
                            opacity: isDragging ? 0.3 : 1,
                            background: tone.bg,
                            border: isSelected ? `2px solid ${GREEN}` : `2px solid ${tone.edge}`,
                            boxShadow: isSelected
                              ? `0 4px 0 ${tone.lip}, 0 0 0 3px rgba(22,163,74,0.18)`
                              : `0 4px 0 ${tone.lip}, 0 6px 14px rgba(24,40,60,0.10)`,
                            transform: isSelected ? 'translateY(-2px) scale(1.05)' : 'none',
                            transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
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
                </div>

                {/* Action rail */}
                <div
                  style={{
                    flex: '0 0 196px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 14,
                    minWidth: 176,
                  }}
                >
                  <ActionPill
                    label="Say It"
                    icon={<Volume2 size={19} strokeWidth={2.2} />}
                    bg="#EAF2FE"
                    edge="#CBDDFB"
                    ink="#1D4ED8"
                    onClick={() => speakWord(targetWord)}
                  />
                  <ActionPill
                    label="Reset"
                    icon={<RotateCcw size={19} strokeWidth={2.2} />}
                    bg="#F3EEFE"
                    edge="#DCD0FA"
                    ink="#6D28D9"
                    disabled={!canInteract}
                    onClick={handleReset}
                  />
                  <ActionPill
                    label="Check"
                    icon={<Check size={19} strokeWidth={2.6} />}
                    bg="#E9F9EF"
                    edge="#C3EBD2"
                    ink={GREEN_DEEP}
                    disabled={!allFilled}
                    onClick={handleCheck}
                  />
                  <ActionPill
                    label="Next Word"
                    icon={<ChevronRight size={19} strokeWidth={2.4} />}
                    bg="#F2F5F8"
                    edge="#E1E7EE"
                    ink="#475569"
                    iconTrailing
                    disabled={!canNextWord}
                    onClick={handleNextWord}
                  />
                </div>
              </div>
            )}

            {/* ---------- Progress ---------- */}
            {targetWord && (
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  flexWrap: 'wrap',
                  background: CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20,
                  padding: '18px 22px',
                  boxShadow: CARD_SHADOW,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: INK_BODY, flexShrink: 0 }}>Progress</span>
                <div style={{ flex: '1 1 220px', minWidth: 160, position: 'relative', height: 14, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: 12, borderRadius: 999, background: '#E9EEF4', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: `linear-gradient(90deg, #22C55E 0%, ${GREEN} 100%)`,
                        transition: 'width 0.35s ease',
                      }}
                    />
                  </div>
                  {/* Star knob rides the fill end. */}
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: GREEN,
                      border: '2px solid #ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 3px 8px rgba(22,163,74,0.32)',
                      transition: 'left 0.35s ease',
                    }}
                  >
                    <Star size={13} color="#ffffff" fill="#ffffff" strokeWidth={1.6} />
                  </span>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    paddingLeft: 20,
                    borderLeft: `1px solid ${BORDER}`,
                    fontSize: 15,
                    fontWeight: 600,
                    color: INK_BODY,
                  }}
                >
                  {score} / {goal} words
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Celebration */}
        {celebrationEmojis.map((ce) => (
          <div
            key={ce.id}
            style={{
              position: 'absolute',
              left: `${ce.x}%`,
              top: '45%',
              fontSize: 26,
              zIndex: 20,
              pointerEvents: 'none',
              animation: 'wbFloatUp 1.6s ease forwards',
            }}
          >
            🎉
          </div>
        ))}
      </div>

      {/* Drag ghost — fixed to the viewport, so it lives outside the clipped root. */}
      {dragging && dragPos && (
        <div
          style={{
            position: 'fixed',
            left: dragPos.x - 36,
            top: dragPos.y - 39,
            width: 72,
            height: 78,
            borderRadius: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1,
            fontFamily: "'DM Sans', sans-serif",
            color: INK,
            background: TILE_TONES[dragging.tileIndex % TILE_TONES.length].bg,
            border: `2px solid ${GREEN}`,
            boxShadow: '0 10px 24px rgba(24,40,60,0.22)',
            zIndex: 999,
            pointerEvents: 'none',
            transform: 'scale(1.06)',
            opacity: 0.95,
          }}
        >
          {tiles[dragging.tileIndex]}
        </div>
      )}
    </>
  )
}

/* Wide pill button for the right-hand action rail. Tinted fill with dark ink of
   the same hue — never light type on a light fill. */
function ActionPill({
  label,
  icon,
  bg,
  edge,
  ink,
  onClick,
  disabled,
  iconTrailing,
}: {
  label: string
  icon: React.ReactNode
  bg: string
  edge: string
  ink: string
  onClick: () => void
  disabled?: boolean
  iconTrailing?: boolean
}) {
  return (
    <button
      className="wb-act"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: iconTrailing ? 'space-between' : 'center',
        gap: 10,
        padding: '15px 20px',
        borderRadius: 999,
        border: `1px solid ${edge}`,
        background: bg,
        color: ink,
        fontSize: 15,
        fontWeight: 600,
        fontFamily: "'DM Sans', sans-serif",
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        boxShadow: '0 2px 6px rgba(24,40,60,0.06)',
        transition: 'filter .15s, opacity .15s',
      }}
    >
      {!iconTrailing && icon}
      <span>{label}</span>
      {iconTrailing && icon}
    </button>
  )
}
