'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface ThoughtChallengerProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Bin = 'pool' | 'for' | 'against' | 'unclear'
interface Card {
  id: string
  text: string
  bin: Bin
}

const BINS: { id: Exclude<Bin, 'pool'>; label: string; tint: string; border: string }[] = [
  { id: 'for', label: 'Evidence For', tint: 'rgba(200,96,42,0.14)', border: 'rgba(200,96,42,0.4)' },
  { id: 'against', label: 'Evidence Against', tint: 'rgba(74,124,111,0.15)', border: 'rgba(74,124,111,0.4)' },
  { id: 'unclear', label: 'Assumption / Unclear', tint: 'rgba(107,92,231,0.15)', border: 'rgba(107,92,231,0.4)' },
]

export default function ThoughtChallenger({ sessionId, role, isLocked }: ThoughtChallengerProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [thought, setThought] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [reframe, setReframe] = useState('')

  const [thoughtInput, setThoughtInput] = useState('')
  const [cardInput, setCardInput] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverBin, setDragOverBin] = useState<Bin | null>(null)
  const [shakeId, setShakeId] = useState<string | null>(null)
  const [bounceId, setBounceId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.tcThought === 'string') setThought(s.tcThought)
      if (Array.isArray(s.tcCards)) setCards(s.tcCards)
      if (typeof s.tcReframe === 'string') setReframe(s.tcReframe)
    })
    return () => unsub()
  }, [sessionId])

  const setThoughtFs = useCallback(() => {
    const t = thoughtInput.trim()
    if (!t || !isT) return
    write({ 'moduleState.tcThought': t })
    logModuleEvent(sessionId, {
      module: 'thought-challenger',
      type: 'thought_set',
      detail: `Examined the automatic thought: "${t}"`,
    })
    setThoughtInput('')
  }, [thoughtInput, isT, write, sessionId])

  const addCard = useCallback(() => {
    const t = cardInput.trim()
    if (!t || !isT) return
    const card: Card = { id: `tc${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, bin: 'pool' }
    write({ 'moduleState.tcCards': [...cards, card] })
    setCardInput('')
  }, [cardInput, isT, cards, write])

  const moveCard = useCallback((id: string, bin: Bin) => {
    if (!canInteract) return
    const updated = cards.map(c => c.id === id ? { ...c, bin } : c)
    write({ 'moduleState.tcCards': updated })
    setBounceId(id)
    setTimeout(() => setBounceId(null), 400)
  }, [cards, canInteract, write])

  // Therapist flags a card as wrongly placed: shake + return to pool
  const flagCard = useCallback((id: string) => {
    if (!isT) return
    setShakeId(id)
    setTimeout(() => {
      setShakeId(null)
      const updated = cards.map(c => c.id === id ? { ...c, bin: 'pool' as Bin } : c)
      write({ 'moduleState.tcCards': updated })
    }, 450)
  }, [isT, cards, write])

  const generateReframe = useCallback(() => {
    if (!isT) return
    const fors = cards.filter(c => c.bin === 'for').map(c => c.text)
    const against = cards.filter(c => c.bin === 'against').map(c => c.text)
    const forStr = fors.length ? fors.join(', ') : 'some evidence'
    const againstStr = against.length ? against.join(', ') : 'other evidence'
    const text = `Some ${forStr} may be true, but ${againstStr} shows it's not absolute.`
    write({ 'moduleState.tcReframe': text })
    logModuleEvent(sessionId, {
      module: 'thought-challenger',
      type: 'reframe_generated',
      detail: `Generated a balanced reframe: "${text}"`,
    })
  }, [isT, cards, write, sessionId])

  const saveNotes = useCallback(async () => {
    if (!isT) return
    try {
      await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, type: 'thought-challenger', thought, reframe }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch {}
  }, [isT, sessionId, thought, reframe])

  const pool = cards.filter(c => c.bin === 'pool')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`
        @keyframes tc-bounce { 0%{transform:scale(1)} 40%{transform:scale(1.18)} 70%{transform:scale(0.94)} 100%{transform:scale(1)} }
        @keyframes tc-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={thoughtInput} onChange={e => setThoughtInput(e.target.value)} placeholder="Enter the automatic thought"
              onKeyDown={e => e.key === 'Enter' && setThoughtFs()}
              style={inputStyle} />
            <button onClick={setThoughtFs} style={btnStyle}>Set thought</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={cardInput} onChange={e => setCardInput(e.target.value)} placeholder="Add evidence card"
              onKeyDown={e => e.key === 'Enter' && addCard()}
              style={inputStyle} />
            <button onClick={addCard} style={btnStyle}>Add evidence</button>
          </div>
          <button onClick={generateReframe} style={{ ...btnStyle, background: 'rgba(74,124,111,0.25)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Generate reframe</button>
        </div>
      )}

      {/* Thought display */}
      <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 18px' }}>
        <div style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>Automatic thought</div>
        <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 16, color: 'rgba(255,255,255,0.9)' }}>
          {thought || (isT ? 'Set a thought to begin…' : 'Waiting for therapist…')}
        </div>
      </div>

      {/* Evidence pool */}
      <div>
        <div style={labelStyle}>Evidence cards</div>
        <div onDragOver={e => { e.preventDefault(); setDragOverBin('pool') }} onDrop={() => { if (dragId) moveCard(dragId, 'pool'); setDragId(null); setDragOverBin(null) }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 40, padding: 8, borderRadius: 8, border: dragOverBin === 'pool' ? '1px solid rgba(255,255,255,0.3)' : '1px dashed rgba(255,255,255,0.12)' }}>
          {pool.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No cards yet</span>}
          {pool.map(c => (
            <CardPill key={c.id} card={c} canInteract={canInteract} isT={isT} shake={shakeId === c.id} bounce={bounceId === c.id}
              onDragStart={() => setDragId(c.id)} onFlag={() => flagCard(c.id)} />
          ))}
        </div>
      </div>

      {/* 3 bins */}
      <div style={{ display: 'flex', gap: 6 }}>
        {BINS.map(bin => {
          const binCards = cards.filter(c => c.bin === bin.id)
          return (
            <div key={bin.id}
              onDragOver={e => { e.preventDefault(); setDragOverBin(bin.id) }}
              onDragLeave={() => setDragOverBin(null)}
              onDrop={() => { if (dragId) moveCard(dragId, bin.id); setDragId(null); setDragOverBin(null) }}
              style={{
                flex: 1, minHeight: 80, padding: 8, borderRadius: 10, background: bin.tint,
                border: dragOverBin === bin.id ? `1.5px solid ${bin.border}` : `1.5px dashed ${bin.border}`,
                boxShadow: dragOverBin === bin.id ? `0 0 10px ${bin.border}` : 'none',
                display: 'flex', flexDirection: 'column', gap: 5, transition: 'box-shadow 0.15s',
              }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textAlign: 'center' }}>{bin.label}</div>
              {binCards.map(c => (
                <CardPill key={c.id} card={c} canInteract={canInteract} isT={isT} shake={shakeId === c.id} bounce={bounceId === c.id}
                  onDragStart={() => setDragId(c.id)} onFlag={() => flagCard(c.id)} />
              ))}
            </div>
          )
        })}
      </div>

      {/* Reframe card */}
      {reframe && (
        <div style={{ background: 'rgba(74,124,111,0.15)', border: '1px solid rgba(74,124,111,0.3)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#b8d4ce', marginBottom: 6 }}>💡 Reframed thought:</div>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>{reframe}</div>
          {isT && (
            <button onClick={saveNotes} style={{ ...btnStyle, marginTop: 10, width: '100%', background: 'rgba(74,124,111,0.25)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>
              {saved ? 'Saved ✓' : 'Save to session notes'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CardPill({ card, canInteract, isT, shake, bounce, onDragStart, onFlag }: {
  card: Card; canInteract: boolean; isT: boolean; shake: boolean; bounce: boolean
  onDragStart: () => void; onFlag: () => void
}) {
  return (
    <div
      draggable={canInteract}
      onDragStart={onDragStart}
      onDoubleClick={() => { if (isT && card.bin !== 'pool') onFlag() }}
      title={isT && card.bin !== 'pool' ? 'Double-click to flag (returns to pool)' : ''}
      style={{
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
        padding: '7px 12px', fontSize: 12, color: 'rgba(255,255,255,0.85)', cursor: canInteract ? 'grab' : 'default',
        animation: shake ? 'tc-shake 0.45s ease' : bounce ? 'tc-bounce 0.4s ease' : 'none',
      }}>
      {card.text}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7,
  padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif',
}
const btnStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif',
}
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
