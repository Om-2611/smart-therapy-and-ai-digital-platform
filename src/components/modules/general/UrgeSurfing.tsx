'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface UrgeSurfingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

const TOTAL = 7 * 60 // 7 minutes in seconds
const PHASES = [
  'Notice the urge. Don\'t fight it.',
  'Rate it. Stay with the feeling.',
  'Try a coping action.',
  'The wave is passing. Notice it dropping.',
]

export default function UrgeSurfing({ sessionId, role, isLocked }: UrgeSurfingProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [active, setActive] = useState(false)
  const [startTime, setStartTime] = useState(0)
  const [rating, setRating] = useState(0)
  const [phase, setPhase] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pausedElapsed, setPausedElapsed] = useState(0)

  const [now, setNow] = useState(Date.now())
  const [copingOpen, setCopingOpen] = useState(false)
  const [customCoping, setCustomCoping] = useState('')
  const [copingList, setCopingList] = useState<string[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval>>()

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.usActive === 'boolean') setActive(s.usActive)
      if (typeof s.usStartTime === 'number') setStartTime(s.usStartTime)
      if (typeof s.usUrgeRating === 'number') setRating(s.usUrgeRating)
      if (typeof s.usPhase === 'number') setPhase(s.usPhase)
      if (typeof s.usPaused === 'boolean') setPaused(s.usPaused)
      if (typeof s.usPausedElapsed === 'number') setPausedElapsed(s.usPausedElapsed)
      if (Array.isArray(s.usCoping)) setCopingList(s.usCoping)
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    if (active && !paused) {
      tickRef.current = setInterval(() => setNow(Date.now()), 250)
      return () => { if (tickRef.current) clearInterval(tickRef.current) }
    }
  }, [active, paused])

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current) }, [])

  const elapsed = active ? (paused ? pausedElapsed : Math.min(TOTAL, pausedElapsed + (now - startTime) / 1000)) : 0
  const remaining = Math.max(0, TOTAL - elapsed)
  const mm = Math.floor(remaining / 60)
  const ss = Math.floor(remaining % 60)

  // bell curve wave height 0..1 peaking at midpoint
  const progress = elapsed / TOTAL
  const height = Math.exp(-Math.pow((progress - 0.5) / 0.22, 2)) // gaussian
  // auto phase from elapsed minutes
  const autoPhase = elapsed < 120 ? 0 : elapsed < 240 ? 1 : elapsed < 360 ? 2 : 3

  // therapist drives phase to firestore as time crosses
  useEffect(() => {
    if (isT && active && !paused && autoPhase !== phase) {
      write({ 'moduleState.usPhase': autoPhase })
    }
  }, [autoPhase, isT, active, paused, phase, write])

  const launch = useCallback(() => {
    if (!isT) return
    write({ 'moduleState.usActive': true, 'moduleState.usStartTime': Date.now(), 'moduleState.usPhase': 0, 'moduleState.usPaused': false, 'moduleState.usPausedElapsed': 0, 'moduleState.usUrgeRating': 0 })
    logModuleEvent(sessionId, {
      module: 'urge-surfing',
      type: 'started',
      detail: 'Started a 7-minute urge-surfing exercise (riding the urge wave without acting on it)',
    })
  }, [isT, write, sessionId])

  const togglePause = useCallback(() => {
    if (!isT) return
    if (paused) {
      write({ 'moduleState.usPaused': false, 'moduleState.usStartTime': Date.now() })
    } else {
      write({ 'moduleState.usPaused': true, 'moduleState.usPausedElapsed': elapsed })
    }
  }, [isT, paused, elapsed, write])

  const reset = useCallback(() => {
    if (!isT) return
    write({ 'moduleState.usActive': false, 'moduleState.usStartTime': 0, 'moduleState.usPhase': 0, 'moduleState.usPaused': false, 'moduleState.usPausedElapsed': 0, 'moduleState.usUrgeRating': 0 })
  }, [isT, write])

  const rate = useCallback((n: number) => {
    if (!canInteract) return
    write({ 'moduleState.usUrgeRating': n })
  }, [canInteract, write])

  const addCoping = useCallback(() => {
    if (!isT || !customCoping.trim()) return
    write({ 'moduleState.usCoping': [...copingList, customCoping.trim()] })
    setCustomCoping('')
  }, [isT, customCoping, copingList, write])

  // wave color from calm blue -> intense at peak
  const r = Math.round(60 + height * 140)
  const g = Math.round(120 - height * 60)
  const b = Math.round(180 - height * 40)
  const waveColor = `rgba(${r},${g},${b},0.55)`
  const waveTop = 120 - height * 95

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        🌊 Urge Surfing
      </div>

      {/* Timer */}
      <div style={{ textAlign: 'center', fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontVariantNumeric: 'tabular-nums' }}>
        {mm}:{ss.toString().padStart(2, '0')}
      </div>

      {/* Phase label */}
      <div style={{ textAlign: 'center', fontSize: 13, color: '#cfe6df', fontStyle: 'italic', minHeight: 20 }}>
        {active ? PHASES[phase] : 'The wave is calm. Ready when you are.'}
      </div>

      {/* Wave */}
      <div style={{ position: 'relative', height: 130, borderRadius: 14, overflow: 'hidden', background: 'rgba(20,40,60,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <svg width="100%" height="130" viewBox="0 0 400 130" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, transition: 'all 0.5s ease' }}>
          <path d={`M0,${waveTop + 130} L0,${waveTop} Q100,${waveTop - 18} 200,${waveTop} T400,${waveTop} L400,130 Z`} fill={waveColor} style={{ transition: 'all 0.5s ease' }} />
          <path d={`M0,${waveTop} Q100,${waveTop - 18} 200,${waveTop} T400,${waveTop}`} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ transition: 'all 0.5s ease' }} />
        </svg>
        {rating > 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
            {rating}
          </div>
        )}
      </div>

      {/* Rate urge */}
      <div>
        <div style={labelStyle}>Rate your urge (0–10)</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} onClick={() => rate(n)} disabled={!canInteract}
              style={{
                flex: 1, minWidth: 26, padding: '6px 0', borderRadius: 6, fontSize: 12, cursor: canInteract ? 'pointer' : 'default',
                background: rating === n ? 'rgba(74,124,111,0.4)' : 'rgba(255,255,255,0.05)',
                border: rating === n ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.1)',
                color: rating === n ? '#cfe6df' : 'rgba(255,255,255,0.6)',
              }}>{n}</button>
          ))}
        </div>
      </div>

      {/* Coping */}
      <button onClick={() => setCopingOpen(o => !o)} style={{ ...btnStyle, width: '100%' }}>Try a coping action ▾</button>
      {copingOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={copingItem}>✍️ Trace circles with your finger or mouse</div>
          <div style={copingItem}>🫁 Tap a breathing rhythm: 4 in · 7 hold · 8 out</div>
          <div style={copingItem}>👀 Name 3 things you can see right now</div>
          {copingList.map((c, i) => <div key={i} style={copingItem}>⭐ {c}</div>)}
        </div>
      )}

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {!active ? (
              <button onClick={launch} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.22)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Launch wave</button>
            ) : (
              <button onClick={togglePause} style={{ ...btnStyle, flex: 1 }}>{paused ? 'Resume' : 'Pause'}</button>
            )}
            <button onClick={reset} style={{ ...btnStyle, flex: 1 }}>Reset timer</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customCoping} onChange={e => setCustomCoping(e.target.value)} placeholder="Add custom coping action"
              onKeyDown={e => e.key === 'Enter' && addCoping()} style={inputStyle} />
            <button onClick={addCoping} style={btnStyle}>Add</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
const copingItem: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,0.7)', padding: '4px 0' }
