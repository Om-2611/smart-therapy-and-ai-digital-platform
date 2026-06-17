'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface DefusionRiverProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface Leaf { id: string; text: string; posX: number; posY: number }

const STEPS = [
  'Read the thought on the leaf',
  'Say: "I am having the thought that…"',
  'Now just watch it float away',
]

export default function DefusionRiver({ sessionId, role, isLocked }: DefusionRiverProps) {
  const isT = role === 'therapist'

  const [thought, setThought] = useState('')
  const [leaves, setLeaves] = useState<Leaf[]>([])
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.drThought === 'string') setThought(s.drThought)
      if (Array.isArray(s.drLeaves)) setLeaves(s.drLeaves)
      if (typeof s.drPaused === 'boolean') setPaused(s.drPaused)
      if (typeof s.drStep === 'number') setStep(s.drStep)
    })
    return () => unsub()
  }, [sessionId])

  const placeLeaf = useCallback((txt?: string) => {
    if (!isT) return
    const t = (txt ?? input).trim()
    if (!t) return
    const leaf: Leaf = { id: `dr${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, posX: 0, posY: 20 + Math.random() * 50 }
    write({ 'moduleState.drThought': t, 'moduleState.drLeaves': [...leaves, leaf] })
    if (!txt) setInput('')
  }, [isT, input, leaves, write])

  const releaseAll = useCallback(() => { if (isT) write({ 'moduleState.drLeaves': [] }) }, [isT, write])
  const togglePause = useCallback(() => { if (isT) write({ 'moduleState.drPaused': !paused }) }, [isT, paused, write])
  const advance = useCallback(() => { if (isT) write({ 'moduleState.drStep': (step + 1) % STEPS.length }) }, [isT, step, write])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`
        @keyframes dr-drift { from{left:-20%} to{left:110%} }
        @keyframes dr-bob { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-6px) rotate(2deg)} }
        @keyframes dr-ripple { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
        @keyframes dr-breathe { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.25);opacity:0.9} }
      `}</style>

      {/* Step guide */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{
            fontSize: 12, padding: '6px 10px', borderRadius: 7,
            background: step === i ? 'rgba(74,124,111,0.2)' : 'rgba(255,255,255,0.04)',
            border: step === i ? '1px solid rgba(74,124,111,0.4)' : '1px solid rgba(255,255,255,0.07)',
            color: step === i ? '#cfe6df' : 'rgba(255,255,255,0.5)',
            fontWeight: step === i ? 600 : 400,
          }}>
            {i + 1}. {s}{step === 1 && i === 1 && thought ? ` "${thought}"` : ''}
          </div>
        ))}
      </div>

      {/* River */}
      <div style={{
        position: 'relative', height: 200, borderRadius: 14, overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(30,80,120,0.3), rgba(20,60,80,0.4))',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {/* ripple lines */}
        {[30, 70, 110, 150].map((top, i) => (
          <svg key={i} width="100%" height="20" style={{ position: 'absolute', top, left: 0, animation: `dr-ripple ${3 + i}s ease-in-out infinite` }}>
            <path d="M0,10 Q40,2 80,10 T160,10 T240,10 T320,10 T400,10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          </svg>
        ))}

        {/* leaves */}
        {leaves.map((leaf, idx) => (
          <div key={leaf.id} style={{
            position: 'absolute', top: leaf.posY, left: '-20%',
            animation: paused ? 'none' : `dr-drift ${10 + (idx % 3) * 2}s linear infinite`,
            animationDelay: `${idx * 1.5}s`,
          }}>
            <div style={{ animation: 'dr-bob 3s ease-in-out infinite', position: 'relative', width: 92, height: 56 }}>
              <svg width="92" height="56" viewBox="0 0 92 56" style={{ position: 'absolute', inset: 0 }}>
                <path d="M46,4 C70,8 86,24 88,46 C66,52 28,52 6,46 C8,24 24,8 46,4 Z" fill="rgba(90,150,90,0.85)" stroke="rgba(60,110,60,0.9)" strokeWidth="1.5" />
                <path d="M46,8 L46,48" stroke="rgba(60,110,60,0.7)" strokeWidth="1" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'rgba(255,255,255,0.95)', textAlign: 'center', padding: '0 12px', lineHeight: 1.1 }}>
                {leaf.text.length > 28 ? leaf.text.slice(0, 28) + '…' : leaf.text}
              </div>
            </div>
          </div>
        ))}

        {/* breathing circle */}
        <div style={{ position: 'absolute', bottom: 10, right: 10, width: 34, height: 34, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', animation: 'dr-breathe 4s ease-in-out infinite' }} />
        {leaves.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {isT ? 'Place a thought on a leaf' : 'Watching the river…'}
          </div>
        )}
      </div>

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Enter the thought"
              onKeyDown={e => e.key === 'Enter' && placeLeaf()} style={inputStyle} />
            <button onClick={() => placeLeaf()} style={btnStyle}>Place on leaf</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={togglePause} style={{ ...btnStyle, flex: 1 }}>{paused ? 'Resume river' : 'Pause river'}</button>
            <button onClick={() => thought && placeLeaf(thought)} style={{ ...btnStyle, flex: 1 }}>Duplicate thought</button>
            <button onClick={releaseAll} style={{ ...btnStyle, flex: 1 }}>Release all</button>
            <button onClick={advance} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.22)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Next step →</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
