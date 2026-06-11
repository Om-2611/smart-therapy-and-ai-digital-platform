'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface EmotionalCharadesProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface EmotionCard {
  id: string
  emoji: string
  label: string
  color: string
  desc: string
  category: 'basic' | 'complex' | 'therapy' | 'scenario'
}

interface AnswerRecord {
  answer: string
  correct: boolean
  timestamp: number
}

interface CheckInRecord {
  emotion: string
  timestamp: number
  sessionMinute: number
}

const CARDS: EmotionCard[] = [
  { id:'happy', emoji:'😊', label:'Happy', color:'#f7c948', desc:'Feeling joy and pleasure', category:'basic' },
  { id:'sad', emoji:'😢', label:'Sad', color:'#5b8dd9', desc:'Feeling down or unhappy', category:'basic' },
  { id:'angry', emoji:'😡', label:'Angry', color:'#c8602a', desc:'Feeling mad or frustrated', category:'basic' },
  { id:'scared', emoji:'😨', label:'Scared', color:'#9b59b6', desc:'Feeling afraid or worried', category:'basic' },
  { id:'surprised', emoji:'😮', label:'Surprised', color:'#2ecc71', desc:'Feeling shocked or amazed', category:'basic' },
  { id:'disgusted', emoji:'🤢', label:'Disgusted', color:'#27ae60', desc:'Feeling yuck or repulsed', category:'basic' },
  { id:'proud', emoji:'🦁', label:'Proud', color:'#f39c12', desc:'Feeling good about yourself', category:'complex' },
  { id:'embarrassed', emoji:'😳', label:'Embarrassed', color:'#e74c3c', desc:'Feeling awkward or shy', category:'complex' },
  { id:'excited', emoji:'🤩', label:'Excited', color:'#f1c40f', desc:'Feeling thrilled and eager', category:'complex' },
  { id:'frustrated', emoji:'😤', label:'Frustrated', color:'#e67e22', desc:'Feeling stuck or blocked', category:'complex' },
  { id:'lonely', emoji:'🥺', label:'Lonely', color:'#7f8c8d', desc:'Feeling alone or left out', category:'complex' },
  { id:'calm', emoji:'😌', label:'Calm', color:'#4a7c6f', desc:'Feeling peaceful and relaxed', category:'complex' },
  { id:'confused', emoji:'😕', label:'Confused', color:'#8e44ad', desc:'Feeling unsure or puzzled', category:'complex' },
  { id:'hopeful', emoji:'🌟', label:'Hopeful', color:'#3498db', desc:'Feeling things will get better', category:'complex' },
  { id:'worried', emoji:'😰', label:'Worried', color:'#95a5a6', desc:'Feeling anxious about something', category:'therapy' },
  { id:'relieved', emoji:'😅', label:'Relieved', color:'#1abc9c', desc:'Feeling better after stress', category:'therapy' },
  { id:'grateful', emoji:'🥰', label:'Grateful', color:'#e91e63', desc:'Feeling thankful', category:'therapy' },
  { id:'jealous', emoji:'😒', label:'Jealous', color:'#607d8b', desc:'Wanting what others have', category:'therapy' },
  { id:'bored', emoji:'😑', label:'Bored', color:'#9e9e9e', desc:'Feeling uninterested', category:'therapy' },
  { id:'loved', emoji:'❤️', label:'Loved', color:'#f44336', desc:'Feeling cared for', category:'therapy' },
  { id:'overwhelmed', emoji:'🌊', label:'Overwhelmed', color:'#1565c0', desc:'Too much at once', category:'scenario' },
  { id:'nervous', emoji:'😬', label:'Nervous', color:'#ff9800', desc:'Worried about something coming up', category:'scenario' },
  { id:'disappointed', emoji:'😞', label:'Disappointed', color:'#78909c', desc:'Expected more, got less', category:'scenario' },
  { id:'determined', emoji:'💪', label:'Determined', color:'#4caf50', desc:'Ready to keep going', category:'scenario' },
  { id:'hurt', emoji:'💔', label:'Hurt', color:'#e53935', desc:'Feeling pain inside', category:'scenario' },
  { id:'curious', emoji:'🧐', label:'Curious', color:'#00bcd4', desc:'Wanting to learn more', category:'scenario' },
  { id:'silly', emoji:'🤪', label:'Silly', color:'#ff5722', desc:'In a playful funny mood', category:'scenario' },
  { id:'peaceful', emoji:'🕊️', label:'Peaceful', color:'#b2dfdb', desc:'Everything feels okay', category:'scenario' },
]

const CATEGORY_LABELS: { key: string; label: string }[] = [
  { key: 'basic', label: 'Basic' },
  { key: 'complex', label: 'Complex' },
  { key: 'therapy', label: 'Therapy' },
  { key: 'scenario', label: 'Scenario' },
]

const CHECKIN_EMOTIONS = [
  { emoji: '😊', id: 'happy' }, { emoji: '😢', id: 'sad' }, { emoji: '😡', id: 'angry' },
  { emoji: '😨', id: 'scared' }, { emoji: '😌', id: 'calm' }, { emoji: '😤', id: 'frustrated' },
  { emoji: '🥺', id: 'lonely' }, { emoji: '😰', id: 'worried' }, { emoji: '🤩', id: 'excited' },
]

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function EmotionalCharades({ sessionId, role, isLocked }: EmotionalCharadesProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [mode, setMode] = useState<'identify' | 'express'>('identify')
  const [difficulty, setDifficulty] = useState<'simple' | 'standard' | 'advanced'>('standard')
  const [categories, setCategories] = useState<string[]>(['basic', 'complex', 'therapy', 'scenario'])
  const [currentCardId, setCurrentCardId] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const [cardsPlayed, setCardsPlayed] = useState(0)
  const [deckRemaining, setDeckRemaining] = useState<string[]>([])
  const [deckDrawn, setDeckDrawn] = useState<string[]>([])
  const [answerHistory, setAnswerHistory] = useState<AnswerRecord[]>([])
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [answered, setAnswered] = useState(false)
  const [options, setOptions] = useState<EmotionCard[]>([])
  const [expressSubMode, setExpressSubMode] = useState<'child-acts' | 'therapist-acts'>('child-acts')
  const [expressRevealed, setExpressRevealed] = useState(false)
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([])
  const [cardFlip, setCardFlip] = useState(false)
  const [animKey, setAnimKey] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>()
  const elapsedRef = useRef<ReturnType<typeof setInterval>>()

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
      const s = snap.data().moduleState || {}

      if (typeof s.ecMode === 'string') setMode(s.ecMode)
      if (typeof s.ecDifficulty === 'string') setDifficulty(s.ecDifficulty)
      if (Array.isArray(s.ecCategories)) setCategories(s.ecCategories)
      if (typeof s.ecCurrentCard === 'string') {
        if (s.ecCurrentCard !== currentCardId) {
          setCardFlip(true)
          setTimeout(() => setCardFlip(false), 350)
        }
        setCurrentCardId(s.ecCurrentCard)
      } else if (s.ecCurrentCard === null || s.ecCurrentCard === undefined) {
        setCurrentCardId(null)
      }
      if (Array.isArray(s.ecDeckRemaining)) setDeckRemaining(s.ecDeckRemaining)
      if (Array.isArray(s.ecDeckDrawn)) setDeckDrawn(s.ecDeckDrawn)
      if (typeof s.ecScore === 'number') setScore(s.ecScore)
      if (typeof s.ecCardsPlayed === 'number') setCardsPlayed(s.ecCardsPlayed)
      if (Array.isArray(s.ecAnswerHistory)) setAnswerHistory(s.ecAnswerHistory.slice(-5))
      if (typeof s.ecExpressSubMode === 'string') setExpressSubMode(s.ecExpressSubMode)
      if (typeof s.ecExpressRevealed === 'boolean') setExpressRevealed(s.ecExpressRevealed)
      if (Array.isArray(s.ecCheckIns)) setCheckIns(s.ecCheckIns)
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Generate options when card changes
  useEffect(() => {
    if (!currentCardId || answered) return
    const card = CARDS.find(c => c.id === currentCardId)
    if (!card) return
    const pool = CARDS.filter(c => c.id !== currentCardId)
    const shuffled = shuffleArray(pool).slice(0, 11)
    setOptions(shuffleArray([card, ...shuffled]))
  }, [currentCardId, answered])

  // Elapsed session time for check-in
  useEffect(() => {
    const start = Date.now()
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 60000))
    }, 60000)
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [])

  const getFilteredCards = useCallback((): EmotionCard[] => {
    if (difficulty === 'simple') return CARDS.filter(c => c.category === 'basic')
    let cats = [...categories]
    if (difficulty === 'advanced' && !cats.includes('scenario')) cats.push('scenario')
    if (cats.length === 0) return [...CARDS]
    return CARDS.filter(c => cats.includes(c.category))
  }, [categories, difficulty])

  const handleDrawCard = () => {
    if (!isTherapist) return
    const filtered = getFilteredCards().map(c => c.id)
    let remaining = deckRemaining.length > 0 ? [...deckRemaining] : shuffleArray(filtered)
    if (remaining.length === 0) remaining = shuffleArray(filtered)
    const pick = remaining[0]
    const newRemaining = remaining.slice(1)
    const newDrawn = [...deckDrawn, pick]

    setCurrentCardId(pick)
    setDeckRemaining(newRemaining)
    setDeckDrawn(newDrawn)
    setAnswered(false)
    setFeedback(null)
    setExpressRevealed(false)

    writeToFirestore({
      'moduleState.ecCurrentCard': pick,
      'moduleState.ecDeckRemaining': newRemaining,
      'moduleState.ecDeckDrawn': newDrawn,
    })
  }

  const handleShuffleDeck = () => {
    if (!isTherapist) return
    const filtered = getFilteredCards().map(c => c.id)
    const shuffled = shuffleArray(filtered)
    setDeckRemaining(shuffled)
    setDeckDrawn([])
    setCurrentCardId(null)
    setAnswered(false)
    setFeedback(null)
    writeToFirestore({
      'moduleState.ecDeckRemaining': shuffled,
      'moduleState.ecDeckDrawn': [],
      'moduleState.ecCurrentCard': '',
    })
  }

  const handleAnswer = (cardId: string) => {
    if (answered || !currentCardId || feedback) return
    setAnswered(true)
    const correct = cardId === currentCardId
    const record: AnswerRecord = { answer: cardId, correct, timestamp: Date.now() }
    const newHistory = [...answerHistory, record]

    if (correct) {
      setScore(prev => prev + 1)
      setFeedback('correct')
    } else {
      setFeedback('wrong')
    }
    setCardsPlayed(prev => prev + 1)
    setAnswerHistory(newHistory.slice(-5))

    writeToFirestore({
      'moduleState.ecScore': correct ? score + 1 : score,
      'moduleState.ecCardsPlayed': cardsPlayed + 1,
      'moduleState.ecLastAnswer': record,
      'moduleState.ecAnswerHistory': newHistory,
    })

    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => {
      setFeedback(null)
    }, correct ? 1000 : 1500)
  }

  const handleReveal = () => {
    if (!isTherapist) return
    setExpressRevealed(true)
    writeToFirestore({ 'moduleState.ecExpressRevealed': true })
  }

  const handleAnswerExpress = (cardId: string) => {
    if (answered || feedback) return
    setAnswered(true)
    const correct = cardId === currentCardId
    const record: AnswerRecord = { answer: cardId, correct, timestamp: Date.now() }
    const newHistory = [...answerHistory, record]

    if (correct) {
      setScore(prev => prev + 1)
      setFeedback('correct')
    } else {
      setFeedback('wrong')
    }
    setCardsPlayed(prev => prev + 1)
    setAnswerHistory(newHistory.slice(-5))

    writeToFirestore({
      'moduleState.ecScore': correct ? score + 1 : score,
      'moduleState.ecCardsPlayed': cardsPlayed + 1,
      'moduleState.ecLastAnswer': record,
      'moduleState.ecAnswerHistory': newHistory,
    })
  }

  const handleCheckInResponse = (emotionId: string) => {
    const checkIn: CheckInRecord = { emotion: emotionId, timestamp: Date.now(), sessionMinute: elapsed }
    setShowCheckIn(false)
    setCheckIns(prev => [...prev, checkIn])
    writeToFirestore({
      'moduleState.ecCheckIns': arrayUnion(checkIn),
    })
  }

  const currentCard = currentCardId ? CARDS.find(c => c.id === currentCardId) || null : null
  const showDesc = difficulty !== 'advanced' && difficulty !== 'simple'
  const deckTotal = getFilteredCards().length

  // Express mode: who sees the card?
  const guesserSeesCardBack = mode === 'express' && !expressRevealed && (
    (expressSubMode === 'child-acts' && isTherapist) ||
    (expressSubMode === 'therapist-acts' && !isTherapist)
  )
  const actorSeesFullCard = mode === 'express' && !expressRevealed && (
    (expressSubMode === 'child-acts' && !isTherapist) ||
    (expressSubMode === 'therapist-acts' && isTherapist)
  )

  const pillStyle = (active: boolean, customColor?: string) => ({
    padding: '5px 10px',
    borderRadius: 20,
    border: `1px solid ${active ? (customColor || 'var(--sage)') : 'var(--glass-border)'}`,
    background: active ? (customColor ? `${customColor}33` : 'var(--sage-light)') : 'transparent',
    color: active ? (customColor || 'var(--sage-mid)') : 'var(--ink-muted)',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes ecCardFlip {
          0% { transform: rotateY(90deg); opacity: 0; }
          100% { transform: rotateY(0deg); opacity: 1; }
        }
        @keyframes ecShake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes ecPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>

      {/* Therapist controls */}
      {isTherapist && (
        <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Mode + difficulty row */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => {
              setMode('identify')
              setExpressRevealed(false)
              writeToFirestore({ 'moduleState.ecMode': 'identify' })
            }} style={pillStyle(mode === 'identify')}>
              🔍 Identify
            </button>
            <button onClick={() => {
              setMode('express')
              writeToFirestore({ 'moduleState.ecMode': 'express' })
            }} style={pillStyle(mode === 'express')}>
              🎭 Express
            </button>
            <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            {(['simple', 'standard', 'advanced'] as const).map(d => (
              <button key={d} onClick={() => {
                setDifficulty(d)
                setDeckRemaining([])
                setDeckDrawn([])
                writeToFirestore({ 'moduleState.ecDifficulty': d, 'moduleState.ecDeckRemaining': [], 'moduleState.ecDeckDrawn': [] })
              }} style={pillStyle(difficulty === d, d === 'simple' ? '#4a7c6f' : d === 'standard' ? '#5b8dd9' : '#9b59b6')}>
                {d === 'simple' ? 'Simple' : d === 'standard' ? 'Standard' : 'Advanced'}
              </button>
            ))}
          </div>

          {/* Categories */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--ink-faint)', marginRight: 4 }}>Categories:</span>
            <button onClick={() => {
              const all = categories.length === 4
              const next = all ? [] : ['basic', 'complex', 'therapy', 'scenario']
              setCategories(next)
              setDeckRemaining([])
              setDeckDrawn([])
              writeToFirestore({ 'moduleState.ecCategories': next, 'moduleState.ecDeckRemaining': [], 'moduleState.ecDeckDrawn': [] })
            }} style={pillStyle(categories.length === 4)}>
              All
            </button>
            {CATEGORY_LABELS.map(cat => (
              <button key={cat.key} onClick={() => {
                const next = categories.includes(cat.key)
                  ? categories.filter(c => c !== cat.key)
                  : [...categories, cat.key]
                setCategories(next)
                setDeckRemaining([])
                setDeckDrawn([])
                writeToFirestore({ 'moduleState.ecCategories': next, 'moduleState.ecDeckRemaining': [], 'moduleState.ecDeckDrawn': [] })
              }} style={pillStyle(categories.includes(cat.key))}>
                {cat.label}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button onClick={handleShuffleDeck} style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--ink-muted)',
              fontSize: 9,
              cursor: 'pointer',
            }}>
              🔄 Shuffle
            </button>
          </div>

          {/* Deck controls + check-in */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleDrawCard} style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: '1px solid var(--sage)',
              background: 'var(--sage-light)',
              color: 'var(--sage-mid)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}>
              🎴 Draw card
            </button>
            <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>
              {deckRemaining.length} / {deckTotal} cards
            </span>
            <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
            <button onClick={() => setShowCheckIn(true)} style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--ink-muted)',
              fontSize: 9,
              cursor: 'pointer',
            }}>
              💬 Check in
            </button>
            {mode === 'express' && currentCardId && !expressRevealed && (
              <>
                <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)' }} />
                {(['child-acts', 'therapist-acts'] as const).map(sm => (
                  <button key={sm} onClick={() => {
                    setExpressSubMode(sm)
                    setExpressRevealed(false)
                    writeToFirestore({ 'moduleState.ecExpressSubMode': sm, 'moduleState.ecExpressRevealed': false })
                  }} style={pillStyle(expressSubMode === sm)}>
                    {sm === 'child-acts' ? '👶 Acts → You guess' : 'You act → 👶 guesses'}
                  </button>
                ))}
                {answered && (
                  <button onClick={handleReveal} style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #f7c948',
                    background: 'rgba(247,201,72,0.15)',
                    color: '#f7c948',
                    fontSize: 9,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}>
                    Reveal answer
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', overflow: 'hidden', position: 'relative' }}>
        {/* Check-in overlay */}
        {showCheckIn && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 16, fontFamily: "'DM Serif Display', serif" }}>
              How are you feeling right now?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 280 }}>
              {CHECKIN_EMOTIONS.map(ce => (
                <button key={ce.id} onClick={() => handleCheckInResponse(ce.id)} style={{
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  fontSize: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {ce.emoji}
                </button>
              ))}
            </div>
            {isTherapist && (
              <button onClick={() => setShowCheckIn(false)} style={{
                marginTop: 16,
                padding: '6px 16px',
                borderRadius: 6,
                border: '1px solid var(--glass-border)',
                background: 'transparent',
                color: 'var(--ink-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}>
                Cancel
              </button>
            )}
          </div>
        )}

        {/* No card drawn */}
        {!currentCardId && !showCheckIn && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: 24,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🃏</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                {isTherapist ? 'Draw a card to begin' : 'Waiting for therapist to draw a card...'}
              </div>
            </div>
          </div>
        )}

        {/* Card drawn */}
        {currentCard && currentCardId && !showCheckIn && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
            {/* Card display */}
            {guesserSeesCardBack ? (
              <div style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1.5px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 20,
                textAlign: 'center',
                animation: 'ecCardFlip 0.35s ease',
              }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>❓</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                  {expressSubMode === 'child-acts'
                    ? 'Watch the webcam — what emotion is it?'
                    : 'Watch the therapist — what feeling is it?'}
                </div>
                {!answered && (
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 8 }}>
                    Pick an emotion below
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                width: '100%',
                background: `linear-gradient(135deg, ${currentCard.color}33 0%, ${currentCard.color}11 100%)`,
                border: `1.5px solid ${currentCard.color}66`,
                borderRadius: 16,
                padding: 20,
                textAlign: 'center',
                animation: cardFlip ? 'none' : 'ecCardFlip 0.35s ease',
              }}>
                <div style={{ fontSize: 56, marginBottom: 4 }}>{currentCard.emoji}</div>
                <div style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontSize: difficulty === 'simple' ? 24 : 20,
                  color: '#fff',
                }}>
                  {currentCard.label}
                </div>
                {showDesc && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: 4 }}>
                    {currentCard.desc}
                  </div>
                )}
              </div>
            )}

            {/* Express mode instructions */}
            {actorSeesFullCard && (
              <div style={{
                fontSize: 12, color: 'rgba(255,255,255,0.6)',
                fontStyle: 'italic', marginTop: 10, textAlign: 'center',
              }}>
                {isTherapist
                  ? 'Act this out on camera!'
                  : 'Act out this feeling without words!'}
              </div>
            )}

            {/* Response area */}
            {mode === 'identify' && !guesserSeesCardBack && (
              <div style={{ width: '100%', marginTop: 12 }}>
                {!answered && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textAlign: 'center' }}>
                    How does this person feel?
                  </div>
                )}

                {/* Feedback display */}
                {feedback && (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    {feedback === 'correct' ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 16px', borderRadius: 8,
                        background: 'rgba(74,124,111,0.2)',
                        color: '#b8d4ce', fontSize: 13, fontWeight: 600,
                        animation: 'ecPulse 0.5s ease 2',
                      }}>
                        ✓ That's right!
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        The feeling is <strong style={{ color: currentCard.color }}>{currentCard.label}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Emoji grid (hide during feedback) */}
                {!feedback && !answered && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                    width: '100%',
                    maxWidth: 320,
                    margin: '0 auto',
                  }}>
                    {options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => handleAnswer(opt.id)}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          fontSize: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Waiting for next card */}
                {answered && !feedback && (
                  <div style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center', marginTop: 8 }}>
                    Waiting for next card...
                  </div>
                )}
              </div>
            )}

            {/* Express mode response */}
            {mode === 'express' && guesserSeesCardBack && (
              <div style={{ width: '100%', marginTop: 12, maxWidth: 320 }}>
                {!answered && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textAlign: 'center' }}>
                    What emotion is it?
                  </div>
                )}
                {feedback ? (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}>
                    {feedback === 'correct' ? (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 16px', borderRadius: 8,
                        background: 'rgba(74,124,111,0.2)',
                        color: '#b8d4ce', fontSize: 13, fontWeight: 600,
                      }}>
                        ✓ That's right!
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        It was <strong style={{ color: currentCard.color }}>{currentCard.label}</strong>
                      </div>
                    )}
                  </div>
                ) : !answered ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                  }}>
                    {options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => handleAnswerExpress(opt.id)}
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          fontSize: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* Express mode: actor instruction + reveal button */}
            {mode === 'express' && actorSeesFullCard && !expressRevealed && (
              <div style={{ fontSize: 11, color: 'var(--ink-muted)', textAlign: 'center', marginTop: 8 }}>
                Waiting for {expressSubMode === 'child-acts' ? 'therapist' : 'client'} to guess...
              </div>
            )}

            {/* Express mode: both see revealed card */}
            {mode === 'express' && expressRevealed && (
              <div style={{
                marginTop: 12,
                textAlign: 'center',
                fontSize: 12,
                color: 'rgba(255,255,255,0.6)',
              }}>
                {answered ? (
                  feedback === 'correct'
                    ? <span style={{ color: '#b8d4ce', fontWeight: 600 }}>✓ Correct!</span>
                    : <span>It was <strong style={{ color: currentCard.color }}>{currentCard.label}</strong></span>
                ) : (
                  <span>Answer revealed — score not recorded for this round</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: score + history */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 11, color: '#b8d4ce', fontWeight: 500 }}>✓ {score} correct</span>
        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>📋 {cardsPlayed} cards</span>
        {answerHistory.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            {answerHistory.map((a, i) => {
              const card = CARDS.find(c => c.id === a.answer)
              if (!card) return null
              return (
                <div key={i} style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `1.5px solid ${a.correct ? 'var(--sage)' : 'var(--accent)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  background: 'rgba(255,255,255,0.05)',
                  position: 'relative',
                }}>
                  {card.emoji}
                  <span style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    fontSize: 7,
                    color: a.correct ? 'var(--sage)' : 'var(--accent)',
                    fontWeight: 700,
                  }}>
                    {a.correct ? '✓' : '✗'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
