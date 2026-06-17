'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface ValuesCardSortProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Bucket = 'pool' | 'important' | 'notNow' | 'final'
interface VCard { id: string; text: string; bucket: Bucket }

const DEFAULT_VALUES = [
  'family', 'honesty', 'freedom', 'health', 'success', 'kindness', 'creativity',
  'faith', 'rest', 'courage', 'learning', 'connection', 'fun', 'purpose',
  'integrity', 'adventure', 'stability', 'compassion', 'growth', 'love',
]

export default function ValuesCardSort({ sessionId, role, isLocked }: ValuesCardSortProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [cards, setCards] = useState<VCard[]>([])
  const [round, setRound] = useState(1)
  const [highlighted, setHighlighted] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [comparePair, setComparePair] = useState<[string, string] | null>(null)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (Array.isArray(s.vsCards)) setCards(s.vsCards)
      if (typeof s.vsRound === 'number') setRound(s.vsRound)
      if (typeof s.vsHighlighted === 'string') setHighlighted(s.vsHighlighted)
    })
    return () => unsub()
  }, [sessionId])

  const startRound1 = useCallback(() => {
    if (!isT) return
    const fresh: VCard[] = DEFAULT_VALUES.map((v, i) => ({ id: `vs${i}`, text: v, bucket: 'pool' }))
    write({ 'moduleState.vsCards': fresh, 'moduleState.vsRound': 1, 'moduleState.vsHighlighted': '' })
  }, [isT, write])

  const reset = startRound1

  const advanceRound = useCallback(() => {
    if (!isT) return
    if (round === 1) {
      // keep only important cards for round 2
      write({ 'moduleState.vsRound': 2 })
    } else if (round === 2) {
      // promote remaining important to final
      const updated = cards.map(c => c.bucket === 'important' ? { ...c, bucket: 'final' as Bucket } : c)
      write({ 'moduleState.vsCards': updated, 'moduleState.vsRound': 3 })
    }
  }, [isT, round, cards, write])

  const sortCard = useCallback((id: string, bucket: Bucket) => {
    if (!canInteract) return
    const updated = cards.map(c => c.id === id ? { ...c, bucket } : c)
    write({ 'moduleState.vsCards': updated })
  }, [cards, canInteract, write])

  // Round 2: eliminate one of a pair (loser -> notNow)
  const eliminate = useCallback((keepId: string, dropId: string) => {
    if (!canInteract) return
    const updated = cards.map(c => c.id === dropId ? { ...c, bucket: 'notNow' as Bucket } : c)
    write({ 'moduleState.vsCards': updated })
    setComparePair(null)
  }, [cards, canInteract, write])

  const addCustom = useCallback(() => {
    if (!isT || !customValue.trim()) return
    const card: VCard = { id: `vs${Date.now()}`, text: customValue.trim().toLowerCase(), bucket: round === 1 ? 'pool' : 'important' }
    write({ 'moduleState.vsCards': [...cards, card] })
    setCustomValue('')
  }, [isT, customValue, cards, round, write])

  const highlight = useCallback((id: string) => {
    if (!canInteract) return
    write({ 'moduleState.vsHighlighted': highlighted === id ? '' : id })
  }, [canInteract, highlighted, write])

  const pool = cards.filter(c => c.bucket === 'pool')
  const important = cards.filter(c => c.bucket === 'important')
  const notNow = cards.filter(c => c.bucket === 'notNow')
  const final = cards.filter(c => c.bucket === 'final')

  // auto compute compare pair for round 2
  useEffect(() => {
    if (round === 2 && !comparePair && important.length > 1) {
      setComparePair([important[0].id, important[1].id])
    }
    if (round === 2 && important.length <= 1) setComparePair(null)
  }, [round, important, comparePair])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`@keyframes vs-glow { 0%,100%{box-shadow:0 0 10px rgba(220,150,40,0.4)} 50%{box-shadow:0 0 20px rgba(220,150,40,0.7)} }`}</style>

      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        🃏 Values Card Sort — Round {round}
      </div>

      {cards.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12, padding: 20 }}>
          {isT ? 'Press "Start Round 1" to begin.' : 'Waiting for therapist to start…'}
        </div>
      ) : round === 1 ? (
        <>
          <div style={labelStyle}>Sort all cards: Important to me · Not right now</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {pool.map(c => (
              <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ValuePill text={c.text} />
                {canInteract && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button onClick={() => sortCard(c.id, 'important')} style={miniBtn('rgba(74,124,111,0.3)')}>✓</button>
                    <button onClick={() => sortCard(c.id, 'notNow')} style={miniBtn('rgba(255,255,255,0.06)')}>✗</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            <span>Important: {important.length}</span>
            <span>Not now: {notNow.length}</span>
          </div>
        </>
      ) : round === 2 ? (
        <>
          <div style={{ textAlign: 'center', fontSize: 13, color: '#cfe6df' }}>Which matters MORE?</div>
          {comparePair ? (
            <div style={{ display: 'flex', gap: 10 }}>
              {comparePair.map((pid, idx) => {
                const card = cards.find(c => c.id === pid)
                const other = comparePair[idx === 0 ? 1 : 0]
                if (!card) return null
                return (
                  <button key={pid} onClick={() => eliminate(pid, other)} disabled={!canInteract}
                    style={{ flex: 1, padding: '24px 8px', borderRadius: 12, fontFamily: '"DM Serif Display", serif', fontSize: 18, textTransform: 'capitalize', cursor: canInteract ? 'pointer' : 'default', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.9)' }}>
                    {card.text}
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{important.length} value(s) remain</div>
          )}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
            {important.length} remaining — keep going until 3–5 remain
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>
            Which one have you been living least lately?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', padding: '12px 0' }}>
            {final.slice(0, 5).map(c => (
              <div key={c.id} onClick={() => highlight(c.id)}
                style={{
                  padding: '18px 22px', borderRadius: 14, cursor: 'pointer',
                  fontFamily: '"DM Serif Display", serif', fontSize: 18, textTransform: 'capitalize',
                  background: 'rgba(220,150,40,0.15)', border: '1px solid rgba(220,150,40,0.4)',
                  color: 'rgba(255,255,255,0.92)',
                  animation: highlighted === c.id ? 'vs-glow 2s ease-in-out infinite' : 'none',
                }}>
                {c.text}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={startRound1} style={{ ...btnStyle, flex: 1 }}>Start Round 1</button>
            {round < 3 && <button onClick={advanceRound} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.22)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Advance round →</button>}
            <button onClick={reset} style={{ ...btnStyle, flex: 1 }}>Reset</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={customValue} onChange={e => setCustomValue(e.target.value)} placeholder="Add custom value"
              onKeyDown={e => e.key === 'Enter' && addCustom()} style={inputStyle} />
            <button onClick={addCustom} style={btnStyle}>Add value</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ValuePill({ text }: { text: string }) {
  return (
    <div style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, textTransform: 'capitalize', color: 'rgba(255,255,255,0.85)' }}>
      {text}
    </div>
  )
}
const miniBtn = (bg: string): React.CSSProperties => ({ flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 11, cursor: 'pointer', background: bg, border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' })
const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
