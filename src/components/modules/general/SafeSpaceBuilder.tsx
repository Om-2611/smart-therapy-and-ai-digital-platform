'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface SafeSpaceBuilderProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Size = 'small' | 'medium' | 'large'
interface SObject { id: string; emoji: string; x: number; y: number; size: Size }

const BACKGROUNDS: { id: string; label: string; css: string }[] = [
  { id: 'beige', label: 'Warm beige', css: 'linear-gradient(135deg,#3a3225,#2a2418)' },
  { id: 'blue', label: 'Soft blue', css: 'linear-gradient(135deg,#1f3a4a,#16293a)' },
  { id: 'forest', label: 'Forest green', css: 'linear-gradient(135deg,#1f3a2a,#16291d)' },
  { id: 'sunset', label: 'Sunset orange', css: 'linear-gradient(135deg,#4a2a1f,#3a1d16)' },
  { id: 'night', label: 'Night purple', css: 'linear-gradient(135deg,#2a1f4a,#1d163a)' },
]

const LIBRARY: { cat: string; items: string[] }[] = [
  { cat: 'Light', items: ['🕯️', '🔦', '☀️', '🌙'] },
  { cat: 'Nature', items: ['🌲', '🌸', '🌊', '⛰️'] },
  { cat: 'Comfort', items: ['🛋️', '🛏️', '🧸', '🍵'] },
  { cat: 'Pets', items: ['🐕', '🐈', '🐇'] },
  { cat: 'Sounds', items: ['🌧️', '🎵', '🌬️', '🔕'] },
  { cat: 'Safety', items: ['🔒', '🏠', '🪟'] },
]
const SIZE_PX: Record<Size, number> = { small: 24, medium: 38, large: 56 }

export default function SafeSpaceBuilder({ sessionId, role, isLocked }: SafeSpaceBuilderProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [clientId, setClientId] = useState<string | null>(null)
  const [background, setBackground] = useState('blue')
  const [objects, setObjects] = useState<SObject[]>([])
  const [anchors, setAnchors] = useState<string[]>([])
  const [name, setName] = useState('')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [anchorInput, setAnchorInput] = useState('')
  const [saved, setSaved] = useState(false)
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Resolve clientId from the live session participants
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const parts = snap.data().participants || {}
      const client = Object.values(parts).find((p: any) => p?.role === 'client') as any
      if (client?.uid) setClientId(client.uid)
    })
    return () => unsub()
  }, [sessionId])

  // Subscribe to the permanent patient record once we know clientId
  useEffect(() => {
    if (!clientId) return
    const unsub = onSnapshot(doc(db, 'patients', clientId), (snap) => {
      const data = snap.exists() ? (snap.data().safeSpace || {}) : {}
      if (typeof data.background === 'string') setBackground(data.background)
      if (Array.isArray(data.objects)) setObjects(data.objects)
      if (Array.isArray(data.anchors)) setAnchors(data.anchors)
      if (typeof data.name === 'string') setName(data.name)
    })
    return () => unsub()
  }, [clientId])

  // Permanent save — merges into patients/{clientId}.safeSpace
  const persist = useCallback(async (next: Partial<{ background: string; objects: SObject[]; anchors: string[]; name: string }>) => {
    if (!clientId) return
    try {
      await setDoc(doc(db, 'patients', clientId), {
        safeSpace: {
          background: next.background ?? background,
          objects: next.objects ?? objects,
          anchors: next.anchors ?? anchors,
          name: next.name ?? name,
          savedAt: Date.now(),
        },
      }, { merge: true })
    } catch {}
  }, [clientId, background, objects, anchors, name])

  const addObject = useCallback((emoji: string) => {
    if (!canInteract) return
    const obj: SObject = { id: `ss${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, emoji, x: 40 + Math.random() * 30, y: 40 + Math.random() * 20, size: 'medium' }
    const next = [...objects, obj]
    setObjects(next)
    persist({ objects: next })
    setPickerOpen(false)
  }, [canInteract, objects, persist])

  const removeObject = useCallback((id: string) => {
    if (!canInteract) return
    const next = objects.filter(o => o.id !== id)
    setObjects(next)
    persist({ objects: next })
  }, [canInteract, objects, persist])

  const cycleSize = useCallback((id: string) => {
    if (!canInteract) return
    const order: Size[] = ['small', 'medium', 'large']
    const next = objects.map(o => o.id === id ? { ...o, size: order[(order.indexOf(o.size) + 1) % 3] } : o)
    setObjects(next)
    persist({ objects: next })
  }, [canInteract, objects, persist])

  const onPointerDown = (e: React.PointerEvent, obj: SObject) => {
    if (!canInteract) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = { id: obj.id, offX: e.clientX - rect.left - (obj.x / 100) * rect.width, offY: e.clientY - rect.top - (obj.y / 100) * rect.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !canInteract) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left - dragRef.current.offX) / rect.width) * 100
    const y = ((e.clientY - rect.top - dragRef.current.offY) / rect.height) * 100
    const id = dragRef.current.id
    setObjects(prev => prev.map(o => o.id === id ? { ...o, x: Math.max(0, Math.min(92, x)), y: Math.max(0, Math.min(88, y)) } : o))
  }
  const onPointerUp = () => {
    if (dragRef.current) { persist({ objects }); dragRef.current = null }
  }

  const addAnchor = useCallback(() => {
    if (!isT || !anchorInput.trim()) return
    const next = [...anchors, anchorInput.trim()]
    setAnchors(next)
    persist({ anchors: next })
    setAnchorInput('')
  }, [isT, anchorInput, anchors, persist])

  const saveSpace = useCallback(async () => {
    await persist({})
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }, [persist])

  const bg = BACKGROUNDS.find(b => b.id === background)?.css || BACKGROUNDS[1].css

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        🏡 {name || 'Safe Space Builder'}
      </div>
      {!clientId && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Waiting for client to join…</div>}

      {/* Canvas */}
      <div ref={canvasRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        style={{ position: 'relative', height: 220, borderRadius: 14, background: bg, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', touchAction: 'none' }}>
        {objects.map(o => (
          <div key={o.id} onPointerDown={e => onPointerDown(e, o)}
            onDoubleClick={() => removeObject(o.id)}
            onClick={() => { /* single tap no-op; size via button */ }}
            title="Drag to move · double-click to remove"
            style={{ position: 'absolute', left: `${o.x}%`, top: `${o.y}%`, fontSize: SIZE_PX[o.size], cursor: canInteract ? 'grab' : 'default', userSelect: 'none', lineHeight: 1 }}>
            {o.emoji}
            {canInteract && (
              <button onClick={(e) => { e.stopPropagation(); cycleSize(o.id) }} style={{ position: 'absolute', top: -6, right: -10, fontSize: 8, padding: '0 3px', borderRadius: 4, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', cursor: 'pointer' }}>⤢</button>
            )}
          </div>
        ))}
        {objects.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Add objects to build your space</div>}
      </div>

      {/* Sensory anchors */}
      {anchors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {anchors.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>{a}</div>
          ))}
        </div>
      )}

      {/* Object picker */}
      {pickerOpen && canInteract && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {LIBRARY.map(group => (
            <div key={group.cat}>
              <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{group.cat}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {group.items.map(em => (
                  <button key={em} onClick={() => addObject(em)} style={{ fontSize: 20, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer' }}>{em}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => setPickerOpen(o => !o)} style={{ ...btnStyle, flex: 1 }}>Add object</button>
            <button onClick={saveSpace} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.22)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>{saved ? 'Saved ✓' : 'Save space'}</button>
            <button onClick={() => persist({})} style={{ ...btnStyle, flex: 1 }}>Reopen saved</button>
          </div>
          <input placeholder="Name this space" value={name} onChange={e => setName(e.target.value)} onBlur={() => persist({ name })} style={inputStyle} />
          <div>
            <div style={labelStyle}>Background</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {BACKGROUNDS.map(b => (
                <button key={b.id} onClick={() => { setBackground(b.id); persist({ background: b.id }) }}
                  style={{ flex: 1, minWidth: 60, padding: '6px 4px', borderRadius: 6, fontSize: 9, cursor: 'pointer', background: b.css, border: background === b.id ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder='Anchor e.g. "I can hear: rain"' value={anchorInput} onChange={e => setAnchorInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAnchor()} style={inputStyle} />
            <button onClick={addAnchor} style={btnStyle}>Add anchor</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
