'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface MicroQuestBoardProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Effort = 'Easy' | 'Medium' | 'Hard'
interface Quest {
  id: string
  text: string
  effort: Effort
  completed: boolean
  completedAt: number | null
  therapistNote: string
}

const EFFORT_COLOR: Record<Effort, string> = {
  Easy: 'rgba(74,124,111,0.3)', Medium: 'rgba(220,150,40,0.3)', Hard: 'rgba(200,80,50,0.3)',
}

export default function MicroQuestBoard({ sessionId, role, isLocked }: MicroQuestBoardProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [clientId, setClientId] = useState<string | null>(null)
  const [quests, setQuests] = useState<Quest[]>([])

  const [questText, setQuestText] = useState('')
  const [effort, setEffort] = useState<Effort>('Easy')
  const [reviewMode, setReviewMode] = useState(false)
  const [celebrate, setCelebrate] = useState<string | null>(null)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const parts = snap.data().participants || {}
      const client = Object.values(parts).find((p: any) => p?.role === 'client') as any
      if (client?.uid) setClientId(client.uid)
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    if (!clientId) return
    const unsub = onSnapshot(doc(db, 'patients', clientId), (snap) => {
      const data = snap.exists() ? snap.data() : {}
      if (Array.isArray(data.quests)) setQuests(data.quests)
    })
    return () => unsub()
  }, [clientId])

  const persist = useCallback(async (next: Quest[]) => {
    if (!clientId) return
    try { await setDoc(doc(db, 'patients', clientId), { quests: next }, { merge: true }) } catch {}
  }, [clientId])

  const addQuest = useCallback(() => {
    if (!isT || !questText.trim()) return
    const q: Quest = { id: `q${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, text: questText.trim(), effort, completed: false, completedAt: null, therapistNote: '' }
    const next = [...quests, q]
    setQuests(next); persist(next); setQuestText('')
  }, [isT, questText, effort, quests, persist])

  const removeQuest = useCallback((id: string) => {
    if (!isT) return
    const next = quests.filter(q => q.id !== id)
    setQuests(next); persist(next)
  }, [isT, quests, persist])

  const toggleComplete = useCallback((id: string) => {
    if (!canInteract) return
    const next = quests.map(q => q.id === id ? { ...q, completed: !q.completed, completedAt: !q.completed ? Date.now() : null } : q)
    setQuests(next); persist(next)
    const q = quests.find(x => x.id === id)
    if (q && !q.completed) { setCelebrate(id); setTimeout(() => setCelebrate(null), 1200) }
  }, [canInteract, quests, persist])

  const setNote = useCallback((id: string, note: string) => {
    if (!isT) return
    const next = quests.map(q => q.id === id ? { ...q, therapistNote: note } : q)
    setQuests(next)
  }, [isT, quests])

  const completedCount = quests.filter(q => q.completed).length
  const momentum = quests.length ? Math.round((completedCount / quests.length) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`@keyframes mq-pop { 0%{transform:scale(1)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }`}</style>

      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        ⚔️ Micro-Quest Board
      </div>

      {/* Momentum meter */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          <span>Momentum</span><span>{completedCount}/{quests.length}</span>
        </div>
        <div style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${momentum}%`, background: 'linear-gradient(90deg,#4a7c6f,#7fc8b3)', transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>Resets each Monday</div>
      </div>

      {!clientId && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Waiting for client to join…</div>}

      {/* Quest grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {quests.map(q => (
          <div key={q.id} style={{
            position: 'relative', padding: 12, borderRadius: 10,
            background: q.completed ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.06)',
            border: q.completed ? '1px solid rgba(74,124,111,0.4)' : '1px dashed rgba(255,255,255,0.18)',
            animation: celebrate === q.id ? 'mq-pop 1.2s ease' : 'none',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: EFFORT_COLOR[q.effort], color: 'rgba(255,255,255,0.8)' }}>{q.effort}</span>
              {isT && <button onClick={() => removeQuest(q.id)} style={{ fontSize: 10, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>✕</button>}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: '6px 0' }}>{q.text}</div>
            <button onClick={() => toggleComplete(q.id)} disabled={!canInteract}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, border: 'none', background: 'transparent', color: q.completed ? '#cfe6df' : 'rgba(255,255,255,0.5)', cursor: canInteract ? 'pointer' : 'default' }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{q.completed ? '✓' : ''}</span>
              {q.completed ? 'Done!' : 'Mark complete'}
            </button>
            {/* path segment */}
            <div style={{ height: 3, marginTop: 8, borderRadius: 2, background: q.completed ? 'linear-gradient(90deg,#4a7c6f,#7fc8b3)' : 'repeating-linear-gradient(90deg,rgba(255,255,255,0.15) 0 4px,transparent 4px 8px)' }} />
            {isT && reviewMode && q.completed && (
              <input placeholder="Which felt hardest and why?" value={q.therapistNote} onChange={e => setNote(q.id, e.target.value)} onBlur={() => persist(quests)}
                style={{ ...inputStyle, marginTop: 6, fontSize: 10 }} />
            )}
          </div>
        ))}
        {quests.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: 16 }}>No quests yet</div>}
      </div>

      {/* Therapist controls */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <input placeholder="New quest / micro-task" value={questText} onChange={e => setQuestText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuest()} style={inputStyle} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(['Easy', 'Medium', 'Hard'] as Effort[]).map(e => (
              <button key={e} onClick={() => setEffort(e)} style={{ ...btnStyle, flex: 1, background: effort === e ? EFFORT_COLOR[e] : 'rgba(255,255,255,0.06)' }}>{e}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addQuest} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.22)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Add quest</button>
            <button onClick={() => setReviewMode(r => !r)} style={{ ...btnStyle, flex: 1 }}>{reviewMode ? 'Exit review' : 'Review mode'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', width: '100%', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
