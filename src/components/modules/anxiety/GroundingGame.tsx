'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface GroundingGameProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

const STEPS = [
  { sense: 'SEE', emoji: '👁️', count: 5, prompt: 'Name 5 things you can see right now', placeholder: 'I can see...' },
  { sense: 'TOUCH', emoji: '🤚', count: 4, prompt: 'Name 4 things you can touch or feel', placeholder: 'I can touch...' },
  { sense: 'HEAR', emoji: '👂', count: 3, prompt: 'Name 3 things you can hear', placeholder: 'I can hear...' },
  { sense: 'SMELL', emoji: '👃', count: 2, prompt: 'Name 2 things you can smell', placeholder: 'I can smell...' },
  { sense: 'TASTE', emoji: '👅', count: 1, prompt: 'Name 1 thing you can taste', placeholder: 'I can taste...' },
] as const

const MOODS = [
  { emoji: '😌', label: 'Calm' },
  { emoji: '😊', label: 'Good' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '😟', label: 'Worried' },
  { emoji: '😰', label: 'Anxious' },
]

const BREATH_OPTIONS = [
  { label: 'Slow', value: 6000 },
  { label: 'Normal', value: 4000 },
  { label: 'Fast', value: 2500 },
]

function initializeItems(existing?: string[][]): string[][] {
  const result: string[][] = []
  for (let i = 0; i < 5; i++) {
    const count = STEPS[i].count
    const prev = existing?.[i] || []
    result.push(Array.from({ length: count }, (_, j) => prev[j] || ''))
  }
  return result
}

export default function GroundingGame({ sessionId, role, isLocked }: GroundingGameProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [currentStep, setCurrentStep] = useState(0)
  const [items, setItems] = useState<string[][]>(() => initializeItems())
  const [breathPace, setBreathPace] = useState(4000)
  const [startMood, setStartMood] = useState('')
  const [endMood, setEndMood] = useState('')
  const [completed, setCompleted] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [captureStartMood, setCaptureStartMood] = useState(false)
  const [canAdvance, setCanAdvance] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [skipMode, setSkipMode] = useState(false)

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

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
      if (typeof s.ggCurrentStep === 'number') setCurrentStep(s.ggCurrentStep)
      if (Array.isArray(s.ggItems)) setItems(initializeItems(s.ggItems as string[][]))
      if (typeof s.ggBreathPace === 'number') setBreathPace(s.ggBreathPace)
      if (typeof s.ggStartMood === 'string') setStartMood(s.ggStartMood)
      if (typeof s.ggEndMood === 'string') setEndMood(s.ggEndMood)
      if (typeof s.ggCompleted === 'boolean') {
        setCompleted(s.ggCompleted)
        if (s.ggCompleted) setCaptureStartMood(false)
      }
      if (typeof s.ggCaptureStartMood === 'boolean') setCaptureStartMood(s.ggCaptureStartMood)
    })
    return () => unsub()
  }, [sessionId])

  const stepItems = items[currentStep] || []
  const filledCount = stepItems.filter(s => s.trim()).length
  const step = STEPS[currentStep]
  const allFilled = stepItems.length === step.count && stepItems.every(s => s.trim())

  useEffect(() => {
    setCanAdvance(allFilled && !transitioning)
  }, [allFilled, transitioning])

  useEffect(() => {
    if (!transitioning && !skipMode) {
      const t = setTimeout(() => inputRefs.current[0]?.focus(), 80)
      return () => clearTimeout(t)
    }
    setSkipMode(false)
  }, [currentStep, transitioning])

  useEffect(() => {
    return () => {}
  }, [])

  const handleItemChange = (slotIdx: number, value: string) => {
    if (!canInteract || completed || transitioning || captureStartMood) return
    const newItems = items.map(arr => [...arr])
    newItems[currentStep][slotIdx] = value
    setItems(newItems)
    writeToFirestore({ 'moduleState.ggItems': newItems })
  }

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, slotIdx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const cur = items[currentStep]
      for (let i = slotIdx + 1; i < cur.length; i++) {
        if (!cur[i].trim()) {
          inputRefs.current[i]?.focus()
          return
        }
      }
    }
  }

  const advanceStep = () => {
    if (!canAdvance && !skipMode) return
    if (transitioning) return

    setTransitioning(true)
    setTimeout(() => {
      if (currentStep < 4) {
        const next = currentStep + 1
        setCurrentStep(next)
        writeToFirestore({ 'moduleState.ggCurrentStep': next })
        setTimeout(() => setTransitioning(false), 100)
      } else {
        setCompleted(true)
        writeToFirestore({ 'moduleState.ggCompleted': true })
        setTimeout(() => setTransitioning(false), 100)
      }
    }, 800)
  }

  const handleSkip = () => {
    setSkipMode(true)
    advanceStep()
  }

  const handleStartMoodCapture = () => {
    writeToFirestore({ 'moduleState.ggCaptureStartMood': true })
  }

  const handleMoodSelect = (mood: string) => {
    if (captureStartMood) {
      setStartMood(mood)
      writeToFirestore({
        'moduleState.ggStartMood': mood,
        'moduleState.ggCaptureStartMood': false,
      })
    } else if (completed) {
      setEndMood(mood)
      writeToFirestore({ 'moduleState.ggEndMood': mood })
    }
  }

  const handleReset = () => {
    const fresh = initializeItems()
    setItems(fresh)
    setCurrentStep(0)
    setCompleted(false)
    setEndMood('')
    setExpandedStep(null)
    setCaptureStartMood(false)
    setTransitioning(false)
    writeToFirestore({
      'moduleState.ggCurrentStep': 0,
      'moduleState.ggItems': fresh,
      'moduleState.ggCompleted': false,
      'moduleState.ggEndMood': '',
      'moduleState.ggCaptureStartMood': false,
    })
  }

  const pillStyle = (active: boolean) => ({
    padding: '5px 10px',
    borderRadius: 20,
    border: `1px solid ${active ? 'var(--sage)' : 'var(--glass-border)'}`,
    background: active ? 'var(--sage-light)' : 'transparent',
    color: active ? 'var(--sage-mid)' : 'var(--ink-muted)',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes ggBreathe {
          0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74,124,111,0.2); }
          50% { transform: scale(1.18); box-shadow: 0 0 0 16px rgba(74,124,111,0); }
        }
        @keyframes ggPromptIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ggAmbience {
          0% { opacity: 0.4; transform: scale(1); }
          100% { opacity: 0.8; transform: scale(1.1); }
        }
        @keyframes ggDotPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes ggSlotPop {
          0%,100% { border-color: rgba(74,124,111,0.3); }
          50% { border-color: rgba(74,124,111,0.7); }
        }
      `}</style>

      {/* Ambience background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(74,124,111,0.06) 0%, transparent 70%)',
        animation: 'ggAmbience 8s ease-in-out infinite alternate',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Progress dots */}
        <div style={{ flexShrink: 0, padding: '8px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  background: i < currentStep ? 'rgba(74,124,111,0.5)' : i === currentStep ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.08)',
                  border: i < currentStep ? '2px solid #b8d4ce' : i === currentStep ? '2px solid #4a7c6f' : '1px solid rgba(255,255,255,0.12)',
                  transition: 'all 0.3s ease',
                  animation: i === currentStep && !transitioning ? 'ggDotPulse 2s ease-in-out infinite' : 'none',
                }}>
                  {i < currentStep ? <span style={{ color: '#b8d4ce', fontSize: 12 }}>✓</span> : s.emoji}
                </div>
                {i < 4 && (
                  <div style={{
                    width: 36,
                    height: 2,
                    background: i < currentStep ? '#4a7c6f' : 'rgba(255,255,255,0.1)',
                    transition: 'background 0.5s ease',
                  }} />
                )}
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#b8d4ce', fontWeight: 500, marginTop: 6 }}>
            {filledCount} things you {step.sense.toLowerCase()}
          </div>
        </div>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', overflow: 'hidden' }}>
          {/* Capture start mood */}
          {captureStartMood && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, color: 'rgba(255,255,255,0.85)', marginBottom: 16 }}>
                How are you feeling right now?
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {MOODS.map(m => (
                  <button key={m.label} onClick={() => handleMoodSelect(m.label)} style={{
                    width: 52,
                    height: 60,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: startMood === m.label ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    fontSize: 22,
                    transition: 'all 0.15s',
                  }}>
                    <span>{m.emoji}</span>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start mood already set message */}
          {startMood && !captureStartMood && !completed && (
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, textAlign: 'center' }}>
              Feeling: {startMood}
            </div>
          )}

          {/* Normal step content */}
          {!completed && !captureStartMood && (
            <>
              {/* Breathing circle */}
              <div style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(74,124,111,0.3) 0%, rgba(74,124,111,0.08) 60%, transparent 100%)',
                border: '1.5px solid rgba(74,124,111,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: `ggBreathe ${breathPace}ms ease-in-out infinite`,
                flexShrink: 0,
                transition: 'transform 0.8s ease',
                transform: transitioning ? 'scale(1.3)' : 'scale(1)',
              }}>
                <span style={{ fontSize: 32 }}>{step.emoji}</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>
                breathe slowly
              </div>

              {/* Prompt */}
              <div
                key={currentStep}
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  fontStyle: 'italic',
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.85)',
                  textAlign: 'center',
                  lineHeight: 1.4,
                  padding: '12px 0',
                  animation: transitioning ? 'none' : 'ggPromptIn 0.4s ease',
                }}
              >
                {step.prompt}
              </div>

              {/* Input slots */}
              <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stepItems.map((item, idx) => (
                  <input
                    key={idx}
                    ref={el => { inputRefs.current[idx] = el }}
                    type="text"
                    value={item}
                    onChange={e => handleItemChange(idx, e.target.value)}
                    onKeyDown={e => handleItemKeyDown(e, idx)}
                    onFocus={() => setFocusedIdx(idx)}
                    onBlur={() => setFocusedIdx(null)}
                    placeholder={step.placeholder}
                    readOnly={!canInteract || transitioning}
                    style={{
                      width: '100%',
                      height: 36,
                      borderRadius: 8,
                      border: `1px solid ${
                        item.trim()
                          ? 'rgba(74,124,111,0.3)'
                          : focusedIdx === idx
                            ? 'rgba(74,124,111,0.5)'
                            : 'rgba(255,255,255,0.15)'
                      }`,
                      background: item.trim()
                        ? 'rgba(74,124,111,0.15)'
                        : focusedIdx === idx
                          ? 'rgba(74,124,111,0.1)'
                          : 'rgba(255,255,255,0.05)',
                      color: item.trim() ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)',
                      padding: '0 12px',
                      fontSize: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'all 0.2s ease',
                      animation: item.trim() && idx === stepItems.length - 1 && allFilled ? 'ggSlotPop 0.4s ease 2' : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Advance button */}
              {canAdvance && (
                <button
                  onClick={advanceStep}
                  style={{
                    marginTop: 12,
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: '1px solid rgba(74,124,111,0.5)',
                    background: 'rgba(74,124,111,0.25)',
                    color: '#b8d4ce',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {currentStep < 4 ? 'Next sense →' : 'Finish ✨'}
                </button>
              )}

              {/* Locked indicator */}
              {!canInteract && !completed && (
                <div style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 8 }}>
                  Therapist is guiding
                </div>
              )}
            </>
          )}

          {/* Completion screen */}
          {completed && (
            <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
              <div style={{
                width: 130,
                height: 130,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(74,124,111,0.3) 0%, rgba(74,124,111,0.08) 60%, transparent 100%)',
                border: '1.5px solid rgba(74,124,111,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: `ggBreathe ${breathPace}ms ease-in-out infinite`,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 40 }}>🌱</span>
              </div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: 'rgba(255,255,255,0.85)', marginTop: 12 }}>
                You did it 🌱
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4, marginBottom: 16 }}>
                You named 15 things around you
              </div>

              {/* Summary accordion */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                {STEPS.map((s, i) => {
                  const stepItemsList = items[i].filter(x => x.trim())
                  const isExpanded = expandedStep === i
                  return (
                    <div key={i} style={{
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                      overflow: 'hidden',
                      transition: 'all 0.2s ease',
                    }}>
                      <button
                        onClick={() => setExpandedStep(isExpanded ? null : i)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          border: 'none',
                          color: 'rgba(255,255,255,0.7)',
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{s.emoji} {s.count} things I {s.sense.toLowerCase()}</span>
                        <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{isExpanded ? '−' : '+'}</span>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: '6px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                          {stepItemsList.length > 0 ? stepItemsList.map((x, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#4a7c6f' }}>✓</span> {x}
                            </div>
                          )) : <span style={{ fontStyle: 'italic' }}>No items entered</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* End mood */}
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                  How do you feel now?
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {MOODS.map(m => (
                    <button key={m.label} onClick={() => handleMoodSelect(m.label)} style={{
                      width: 48,
                      height: 56,
                      borderRadius: 12,
                      border: `1px solid ${endMood === m.label ? 'rgba(74,124,111,0.5)' : 'rgba(255,255,255,0.12)'}`,
                      background: endMood === m.label ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.05)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      fontSize: 18,
                      transition: 'all 0.15s',
                    }}>
                      <span>{m.emoji}</span>
                      <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)' }}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start again button */}
              <button onClick={handleReset} style={{
                marginTop: 16,
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid var(--sage)',
                background: 'var(--sage-light)',
                color: 'var(--sage-mid)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                Start again
              </button>
            </div>
          )}
        </div>

        {/* Therapist panel */}
        {isTherapist && !completed && !captureStartMood && (
          <div style={{
            flexShrink: 0,
            padding: '8px 12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
                Step {currentStep + 1} of 5 · {filledCount}/{step.count} items entered
              </span>
              <button onClick={handleSkip} style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: 'var(--ink-muted)',
                fontSize: 9,
                cursor: 'pointer',
              }}>
                Skip to next step →
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, color: 'var(--ink-faint)', whiteSpace: 'nowrap' }}>Breath:</span>
              {BREATH_OPTIONS.map(b => (
                <button key={b.value} onClick={() => {
                  setBreathPace(b.value)
                  writeToFirestore({ 'moduleState.ggBreathPace': b.value })
                }} style={pillStyle(breathPace === b.value)}>
                  {b.label}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {!startMood && (
                <button onClick={handleStartMoodCapture} style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: 'var(--ink-muted)',
                  fontSize: 9,
                  cursor: 'pointer',
                }}>
                  Capture start mood
                </button>
              )}
              {startMood && (
                <span style={{ fontSize: 9, color: 'var(--ink-muted)' }}>Mood: {startMood}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
