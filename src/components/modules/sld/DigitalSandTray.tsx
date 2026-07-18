'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface PlacedItem {
  id: string
  emoji: string
  label: string
  x: number
  y: number
}

interface Ripple {
  id: number
  x: number
  y: number
}

type Mode = 'place' | 'move' | 'remove'
type Category = 'people' | 'animals' | 'nature' | 'objects' | 'feelings'

interface DigitalSandTrayProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'animals', label: 'Animals' },
  { key: 'nature', label: 'Nature' },
  { key: 'objects', label: 'Objects' },
  { key: 'feelings', label: 'Feelings' },
]

const MINIATURES: Record<Category, { emoji: string; label: string }[]> = {
  people: [
    { emoji: '🧒', label: 'Child' },
    { emoji: '👦', label: 'Boy' },
    { emoji: '👧', label: 'Girl' },
    { emoji: '👩', label: 'Woman' },
    { emoji: '👨', label: 'Man' },
    { emoji: '👴', label: 'Grandpa' },
    { emoji: '👩‍⚕️', label: 'Doctor' },
    { emoji: '👮', label: 'Police' },
    { emoji: '🧙', label: 'Wizard' },
    { emoji: '👸', label: 'Princess' },
    { emoji: '🦸', label: 'Hero' },
    { emoji: '🤴', label: 'Prince' },
  ],
  animals: [
    { emoji: '🐶', label: 'Dog' },
    { emoji: '🐱', label: 'Cat' },
    { emoji: '🐸', label: 'Frog' },
    { emoji: '🦁', label: 'Lion' },
    { emoji: '🐘', label: 'Elephant' },
    { emoji: '🦋', label: 'Butterfly' },
    { emoji: '🐠', label: 'Fish' },
    { emoji: '🐦', label: 'Bird' },
    { emoji: '🐍', label: 'Snake' },
    { emoji: '🦊', label: 'Fox' },
    { emoji: '🐻', label: 'Bear' },
    { emoji: '🐺', label: 'Wolf' },
  ],
  nature: [
    { emoji: '🌲', label: 'Tree' },
    { emoji: '🌸', label: 'Flower' },
    { emoji: '🌊', label: 'Wave' },
    { emoji: '⛰️', label: 'Mountain' },
    { emoji: '🌙', label: 'Moon' },
    { emoji: '☀️', label: 'Sun' },
    { emoji: '🌈', label: 'Rainbow' },
    { emoji: '⚡', label: 'Lightning' },
    { emoji: '🌿', label: 'Leaf' },
    { emoji: '🍄', label: 'Mushroom' },
    { emoji: '🔥', label: 'Fire' },
    { emoji: '❄️', label: 'Snow' },
  ],
  objects: [
    { emoji: '🏠', label: 'House' },
    { emoji: '🚗', label: 'Car' },
    { emoji: '⚔️', label: 'Sword' },
    { emoji: '🛡️', label: 'Shield' },
    { emoji: '💎', label: 'Gem' },
    { emoji: '🗝️', label: 'Key' },
    { emoji: '📦', label: 'Box' },
    { emoji: '🪑', label: 'Chair' },
    { emoji: '🪞', label: 'Mirror' },
    { emoji: '🔮', label: 'Crystal Ball' },
    { emoji: '⛺', label: 'Tent' },
    { emoji: '🌉', label: 'Bridge' },
  ],
  feelings: [
    { emoji: '❤️', label: 'Love' },
    { emoji: '💔', label: 'Broken Heart' },
    { emoji: '😰', label: 'Anxious' },
    { emoji: '😡', label: 'Angry' },
    { emoji: '😊', label: 'Happy' },
    { emoji: '😢', label: 'Sad' },
    { emoji: '🌟', label: 'Star' },
    { emoji: '⚡', label: 'Energy' },
    { emoji: '🌑', label: 'Dark' },
    { emoji: '☁️', label: 'Cloudy' },
    { emoji: '🎯', label: 'Goal' },
    { emoji: '🤝', label: 'Together' },
  ],
}

function generateId() {
  return `st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export default function DigitalSandTray({ sessionId, role, isLocked }: DigitalSandTrayProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [items, setItems] = useState<PlacedItem[]>([])
  const [mode, setMode] = useState<Mode>('place')
  const [category, setCategory] = useState<Category>('people')
  const [selectedMiniature, setSelectedMiniature] = useState<{ emoji: string; label: string } | null>(null)
  const [note, setNote] = useState('')
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set())

  const canvasRef = useRef<HTMLDivElement>(null)
  const rippleIdRef = useRef(0)
  const itemsRef = useRef<PlacedItem[]>(items)
  const dragInfo = useRef<{
    itemId: string
    startMouseX: number
    startMouseY: number
    startItemX: number
    startItemY: number
  } | null>(null)

  itemsRef.current = items

  const isFirstNoteSync = useRef(true)

  const writeItemsToFirestore = useCallback(async (newItems: PlacedItem[]) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        'moduleState.sandTrayItems': newItems,
        'timestamps.updatedAt': new Date().toISOString(),
      })
    } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const state = data.moduleState || {}
      if (state.sandTrayItems) {
        setItems(state.sandTrayItems)
      }
      if (typeof state.sandTrayNote === 'string') {
        setNote(state.sandTrayNote)
        isFirstNoteSync.current = false
      }
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    if (isFirstNoteSync.current) return
    const timer = setTimeout(() => {
      updateDoc(doc(db, 'liveSessions', sessionId), {
        'moduleState.sandTrayNote': note,
        'timestamps.updatedAt': new Date().toISOString(),
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(timer)
  }, [note, sessionId])

  const addRipple = (x: number, y: number) => {
    const id = rippleIdRef.current++
    setRipples((prev) => [...prev, { id, x, y }])
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id))
    }, 500)
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (mode !== 'place' || !selectedMiniature || !canInteract) return
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    placeItem(selectedMiniature.emoji, selectedMiniature.label, x, y)
    addRipple(x, y)
    setSelectedMiniature(null)
  }

  const handleCanvasTouch = (e: React.TouchEvent) => {
    if (mode !== 'place' || !selectedMiniature || !canInteract) return
    if (!canvasRef.current) return
    const touch = e.touches[0]
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((touch.clientX - rect.left) / rect.width) * 100
    const y = ((touch.clientY - rect.top) / rect.height) * 100
    placeItem(selectedMiniature.emoji, selectedMiniature.label, x, y)
    addRipple(x, y)
    setSelectedMiniature(null)
  }

  const placeItem = (emoji: string, label: string, x: number, y: number) => {
    const newItem: PlacedItem = {
      id: generateId(),
      emoji,
      label,
      x: Math.max(1, Math.min(93, x)),
      y: Math.max(1, Math.min(85, y)),
    }
    const newItems = [...itemsRef.current, newItem]
    setItems(newItems)
    writeItemsToFirestore(newItems)
  }

  const placeAtRandom = (emoji: string, label: string) => {
    if (!canInteract) return
    if (mode === 'place') {
      const x = 5 + Math.random() * 75
      const y = 5 + Math.random() * 70
      placeItem(emoji, label, x, y)
      addRipple(x, y)
    }
  }

  const handleItemMouseDown = (e: React.MouseEvent, item: PlacedItem) => {
    if (mode === 'remove') {
      handleRemoveItem(item.id)
      return
    }
    if (mode !== 'move' || !canInteract) return
    e.preventDefault()
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    dragInfo.current = {
      itemId: item.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragInfo.current || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const dx = ((ev.clientX - dragInfo.current.startMouseX) / rect.width) * 100
      const dy = ((ev.clientY - dragInfo.current.startMouseY) / rect.height) * 100
      const newX = Math.max(0, Math.min(95, dragInfo.current.startItemX + dx))
      const newY = Math.max(0, Math.min(95, dragInfo.current.startItemY + dy))
      setItems((prev) =>
        prev.map((i) =>
          i.id === dragInfo.current!.itemId ? { ...i, x: newX, y: newY } : i
        )
      )
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      if (dragInfo.current) {
        writeItemsToFirestore(itemsRef.current)
        dragInfo.current = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleItemTouchStart = (e: React.TouchEvent, item: PlacedItem) => {
    if (mode === 'remove') {
      handleRemoveItem(item.id)
      return
    }
    if (mode !== 'move' || !canInteract) return
    if (!canvasRef.current) return

    const touch = e.touches[0]
    const rect = canvasRef.current.getBoundingClientRect()
    dragInfo.current = {
      itemId: item.id,
      startMouseX: touch.clientX,
      startMouseY: touch.clientY,
      startItemX: item.x,
      startItemY: item.y,
    }

    const handleTouchMove = (ev: TouchEvent) => {
      if (!dragInfo.current || !canvasRef.current) return
      const t = ev.touches[0]
      const rect = canvasRef.current.getBoundingClientRect()
      const dx = ((t.clientX - dragInfo.current.startMouseX) / rect.width) * 100
      const dy = ((t.clientY - dragInfo.current.startMouseY) / rect.height) * 100
      const newX = Math.max(0, Math.min(95, dragInfo.current.startItemX + dx))
      const newY = Math.max(0, Math.min(95, dragInfo.current.startItemY + dy))
      setItems((prev) =>
        prev.map((i) =>
          i.id === dragInfo.current!.itemId ? { ...i, x: newX, y: newY } : i
        )
      )
    }

    const handleTouchEnd = () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      if (dragInfo.current) {
        writeItemsToFirestore(itemsRef.current)
        dragInfo.current = null
      }
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd)
  }

  const handleRemoveItem = (itemId: string) => {
    if (!canInteract) return
    setRemovingIds((prev) => new Set(prev).add(itemId))
    setTimeout(() => {
      const newItems = itemsRef.current.filter((i) => i.id !== itemId)
      setItems(newItems)
      setRemovingIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
      writeItemsToFirestore(newItems)
    }, 200)
  }

  const handleClear = () => {
    if (!canInteract || items.length === 0) return
    if (!window.confirm('Remove all items from the sand tray?')) return
    setItems([])
    writeItemsToFirestore([])
  }

  const handleSaveMoment = async () => {
    if (items.length === 0) return
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        sandTraySnapshots: arrayUnion({
          items: itemsRef.current,
          timestamp: new Date().toISOString(),
          note: note || '',
        }),
        'timestamps.updatedAt': new Date().toISOString(),
      })
      logModuleEvent(sessionId, {
        module: 'digital-sand-tray',
        type: 'scene_saved',
        detail: `Saved a sand-tray scene with ${items.length} miniature${items.length === 1 ? '' : 's'} placed${note ? `: "${note}"` : ''}`,
      })
    } catch {}
  }

  const canPlace = mode === 'place' && canInteract

  const isInteractive = canInteract

  return (
    <>
      <style>{`
        @keyframes sandPopIn {
          0%   { transform: scale(0) rotate(-10deg); opacity: 0 }
          70%  { transform: scale(1.2) rotate(3deg); opacity: 1 }
          100% { transform: scale(1) rotate(0deg); opacity: 1 }
        }
        @keyframes sandFadeOut {
          0%   { transform: scale(1); opacity: 1 }
          100% { transform: scale(0); opacity: 0 }
        }
        @keyframes sandRipple {
          0%   { transform: scale(0); opacity: 0.5 }
          100% { transform: scale(3); opacity: 0 }
        }
      `}</style>
      <div style={{ display: 'flex', height: '100%', gap: 0 }}>
        {/* Left: Sand Tray Canvas */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}
        >
          {/* Mode bar — therapist only */}
          {isTherapist && (
            <div
              style={{
                display: 'flex',
                gap: 1,
                background: 'rgba(0,0,0,0.3)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: 8,
                padding: 2,
                marginBottom: 6,
                flexShrink: 0,
              }}
            >
              {(['place', 'move', 'remove'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: mode === m ? 'rgba(255,255,255,0.2)' : 'transparent',
                    color: mode === m ? '#fff' : 'rgba(255,255,255,0.5)',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* Locked overlay */}
          {!canInteract && (
            <div
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.4)',
                textAlign: 'center',
                padding: '2px 0 4px',
                flexShrink: 0,
              }}
            >
              Therapist is controlling
            </div>
          )}

          {/* Canvas container */}
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            onTouchEnd={handleCanvasTouch}
            style={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 10,
              border: '3px solid rgba(120,80,30,0.35)',
              boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.15)',
              cursor: canPlace ? 'crosshair' : mode === 'move' && canInteract ? 'grab' : 'default',
              background: `
                radial-gradient(circle at 26% 34%, rgba(0,0,0,0.035) 1px, transparent 1px),
                radial-gradient(ellipse at 50% 60%, #d4b483 0%, #c9a96e 40%, #b8915a 100%)
              `,
              backgroundSize: '14px 14px, 100% 100%',
            }}
          >
            {!canInteract && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  cursor: 'default',
                }}
              />
            )}

            {/* Placed items */}
            {items.map((item) => {
              const isRemoving = removingIds.has(item.id)
              return (
                <div
                  key={item.id}
                  onMouseDown={(e) => handleItemMouseDown(e, item)}
                  onTouchStart={(e) => {
                    const touch = e.touches[0]
                    if (touch) handleItemTouchStart(e, item)
                  }}
                  style={{
                    position: 'absolute',
                    left: `${item.x}%`,
                    top: `${item.y}%`,
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    cursor: mode === 'remove' && canInteract ? 'pointer' : mode === 'move' && canInteract ? 'grab' : 'default',
                    zIndex: 5,
                    pointerEvents: isRemoving ? 'none' : 'auto',
                    animation: isRemoving
                      ? 'sandFadeOut 0.2s ease forwards'
                      : 'sandPopIn 0.3s ease',
                    opacity: isRemoving ? 0 : 1,
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1.2 }}>{item.emoji}</span>
                  <span
                    style={{
                      fontSize: 7,
                      color: 'rgba(255,255,255,0.7)',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 3,
                      padding: '0 4px',
                      whiteSpace: 'nowrap',
                      lineHeight: '12px',
                    }}
                  >
                    {item.label}
                  </span>
                </div>
              )
            })}

            {/* Ripples */}
            {ripples.map((r) => (
              <div
                key={r.id}
                style={{
                  position: 'absolute',
                  left: `${r.x}%`,
                  top: `${r.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.35)',
                  animation: 'sandRipple 0.5s ease forwards',
                  pointerEvents: 'none',
                  zIndex: 4,
                }}
              />
            ))}
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '3px 2px 0',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
              {items.length} {items.length === 1 ? 'item' : 'items'} placed
            </span>
            {isTherapist && (
              <div className="flex items-center" style={{ gap: 4 }}>
                <button
                  onClick={handleClear}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: 9,
                    cursor: items.length > 0 ? 'pointer' : 'default',
                    opacity: items.length > 0 ? 1 : 0.35,
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={handleSaveMoment}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.45)',
                    fontSize: 9,
                    cursor: items.length > 0 ? 'pointer' : 'default',
                    opacity: items.length > 0 ? 1 : 0.35,
                  }}
                >
                  📸 Save moment
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Miniature Picker — therapist only */}
        {isTherapist && (
          <div
            style={{
              width: 140,
              marginLeft: 8,
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>
                Miniatures
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
                tap to place
              </div>
            </div>

            {/* Category tabs */}
            <div
              style={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                paddingBottom: 6,
                flexShrink: 0,
              }}
            >
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: 'none',
                    fontSize: 8,
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    background: 'transparent',
                    color: category === cat.key ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
                    borderBottom: category === cat.key ? '2px solid #4a7c6f' : '2px solid transparent',
                    paddingBottom: category === cat.key ? 4 : 4,
                    transition: 'all 0.15s',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Item grid */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 4,
                overflowY: 'auto',
                alignContent: 'start',
                paddingBottom: 6,
              }}
            >
              {MINIATURES[category].map((min, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedMiniature(min)
                    placeAtRandom(min.emoji, min.label)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1,
                    padding: '4px 0',
                    borderRadius: 6,
                    border: selectedMiniature?.emoji === min.emoji
                      ? '1px solid rgba(74,124,111,0.5)'
                      : '1px solid transparent',
                    background: selectedMiniature?.emoji === min.emoji
                      ? 'rgba(74,124,111,0.2)'
                      : 'rgba(255,255,255,0.05)',
                    cursor: canPlace ? 'pointer' : 'default',
                    opacity: canPlace ? 1 : 0.4,
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1.2 }}>{min.emoji}</span>
                  <span
                    style={{
                      fontSize: 7,
                      color: 'rgba(255,255,255,0.45)',
                      lineHeight: 1.1,
                      textAlign: 'center',
                    }}
                  >
                    {min.label}
                  </span>
                </button>
              ))}
            </div>

            {/* Observation textarea */}
            <div style={{ flexShrink: 0, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note what child is building..."
                style={{
                  width: '100%',
                  height: 52,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: 10,
                  fontFamily: "'DM Sans', sans-serif",
                  resize: 'none',
                  outline: 'none',
                  lineHeight: 1.4,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
