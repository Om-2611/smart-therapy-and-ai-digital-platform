'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface FactsVsFeelingsProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Bin = 'pool' | 'facts' | 'feelings' | 'stories'
interface Card { id: string; text: string; bin: Bin }

const BINS: { id: Exclude<Bin, 'pool'>; label: string; tint: string; border: string }[] = [
  { id: 'facts', label: '📷 Facts', tint: 'rgba(40,130,210,0.14)', border: 'rgba(40,130,210,0.4)' },
  { id: 'feelings', label: '💛 Feelings', tint: 'rgba(220,150,40,0.14)', border: 'rgba(220,150,40,0.4)' },
  { id: 'stories', label: '💭 Stories', tint: 'rgba(107,92,231,0.14)', border: 'rgba(107,92,231,0.4)' },
]

const FEELING_WORDS = ['scared', 'worried', 'sad', 'happy', 'anxious', 'upset', 'frustrated', 'angry', 'hopeless', 'excited', 'hurt']
const ABSOLUTE_WORDS = ['definitely', 'always', 'never', 'everyone', 'nobody', 'everything', 'nothing']

export default function FactsVsFeelings({ sessionId, role, isLocked }: FactsVsFeelingsProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [cards, setCards] = useState<Card[]>([])
  const [cardInput, setCardInput] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverBin, setDragOverBin] = useState<Bin | null>(null)
  const [bounceMsg, setBounceMsg] = useState<{ id: string; msg: string } | null>(null)
  const [overrideId, setOverrideId] = useState<Set<string>>(new Set())

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (Array.isArray(s.ffCards)) setCards(s.ffCards)
    })
    return () => unsub()
  }, [sessionId])

  const addCard = useCallback(() => {
    const t = cardInput.trim()
    if (!t || !isT) return
    const card: Card = { id: `ff${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, bin: 'pool' }
    write({ 'moduleState.ffCards': [...cards, card] })
    setCardInput('')
  }, [cardInput, isT, cards, write])

  const validateForFacts = (text: string): string | null => {
    const lower = text.toLowerCase()
    if (FEELING_WORDS.some(w => new RegExp(`\\b${w}\\b`).test(lower))) return 'Is that what a camera would see?'
    if (ABSOLUTE_WORDS.some(w => new RegExp(`\\b${w}\\b`).test(lower))) return 'Does that sound like a fact?'
    return null
  }

  const moveCard = useCallback((id: string, bin: Bin) => {
    if (!canInteract) return
    const card = cards.find(c => c.id === id)
    if (!card) return
    // Validation only applies to client drops into Facts, unless therapist overrode
    if (bin === 'facts' && !isT && !overrideId.has(id)) {
      const msg = validateForFacts(card.text)
      if (msg) {
        setBounceMsg({ id, msg })
        setTimeout(() => setBounceMsg(null), 2200)
        return // bounce back — do not move
      }
    }
    const updated = cards.map(c => c.id === id ? { ...c, bin } : c)
    write({ 'moduleState.ffCards': updated })
  }, [cards, canInteract, isT, overrideId, write])

  const overrideCard = useCallback((id: string) => {
    if (!isT) return
    setOverrideId(prev => new Set(prev).add(id))
    // keep the card in facts even if rule would bounce it
    const updated = cards.map(c => c.id === id ? { ...c, bin: 'facts' as Bin } : c)
    write({ 'moduleState.ffCards': updated })
  }, [isT, cards, write])

  const pool = cards.filter(c => c.bin === 'pool')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`@keyframes ff-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>

      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        Facts vs Feelings
      </div>

      {isT && (
        <div style={{ display: 'flex', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <input value={cardInput} onChange={e => setCardInput(e.target.value)} placeholder="Add a card to sort"
            onKeyDown={e => e.key === 'Enter' && addCard()} style={inputStyle} />
          <button onClick={addCard} style={btnStyle}>Add card</button>
        </div>
      )}

      {/* Pool */}
      <div>
        <div style={labelStyle}>Cards to sort</div>
        <div onDragOver={e => { e.preventDefault(); setDragOverBin('pool') }} onDrop={() => { if (dragId) moveCard(dragId, 'pool'); setDragId(null); setDragOverBin(null) }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 40, padding: 8, borderRadius: 8, border: dragOverBin === 'pool' ? '1px solid rgba(255,255,255,0.3)' : '1px dashed rgba(255,255,255,0.12)' }}>
          {pool.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No cards yet</span>}
          {pool.map(c => <Pill key={c.id} card={c} canInteract={canInteract} onDragStart={() => setDragId(c.id)} />)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {BINS.map(bin => {
          const binCards = cards.filter(c => c.bin === bin.id)
          return (
            <div key={bin.id}
              onDragOver={e => { e.preventDefault(); setDragOverBin(bin.id) }}
              onDragLeave={() => setDragOverBin(null)}
              onDrop={() => { if (dragId) moveCard(dragId, bin.id); setDragId(null); setDragOverBin(null) }}
              style={{
                flex: 1, minHeight: 90, padding: 8, borderRadius: 10, background: bin.tint,
                border: dragOverBin === bin.id ? `1.5px solid ${bin.border}` : `1.5px dashed ${bin.border}`,
                boxShadow: dragOverBin === bin.id ? `0 0 10px ${bin.border}` : 'none',
                display: 'flex', flexDirection: 'column', gap: 5, transition: 'box-shadow 0.15s',
              }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{bin.label}</div>
              {binCards.map(c => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Pill card={c} canInteract={canInteract} onDragStart={() => setDragId(c.id)} />
                  {isT && bin.id === 'facts' && !overrideId.has(c.id) && (
                    <button onClick={() => overrideCard(c.id)} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Keep here</button>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {bounceMsg && (
        <div style={{ background: 'rgba(200,96,42,0.18)', border: '1px solid rgba(200,96,42,0.4)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e8a87c', textAlign: 'center' }}>
          {bounceMsg.msg}
        </div>
      )}
    </div>
  )
}

function Pill({ card, canInteract, onDragStart }: { card: Card; canInteract: boolean; onDragStart: () => void }) {
  return (
    <div draggable={canInteract} onDragStart={onDragStart}
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: 'rgba(255,255,255,0.85)', cursor: canInteract ? 'grab' : 'default' }}>
      {card.text}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
