'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface EmotionWheelProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

// valence buckets for coloring
type Valence = 'pos' | 'neg' | 'anger'
const VALENCE: Record<string, Valence> = {
  good: 'pos', surprised: 'pos',
  bad: 'neg', scared: 'neg', disgusted: 'neg',
  angry: 'anger',
}

const L1 = ['bad', 'good', 'scared', 'disgusted', 'surprised', 'angry']

const L2: Record<string, string[]> = {
  bad: ['sad', 'numb', 'bored', 'lonely'],
  good: ['happy', 'excited', 'grateful', 'hopeful'],
  scared: ['anxious', 'worried', 'overwhelmed', 'helpless'],
  angry: ['frustrated', 'irritated', 'jealous', 'hurt'],
  disgusted: ['awful', 'repelled', 'judgemental', 'embarrassed'],
  surprised: ['confused', 'amazed', 'shocked', 'unsure'],
}

const L3: Record<string, string[]> = {
  sad: ['heartbroken', 'disappointed', 'grief'],
  numb: ['empty', 'detached', 'withdrawn'],
  bored: ['indifferent', 'restless', 'apathetic'],
  lonely: ['isolated', 'abandoned', 'unseen'],
  happy: ['content', 'joyful', 'playful'],
  excited: ['energetic', 'eager', 'thrilled'],
  grateful: ['thankful', 'blessed', 'appreciative'],
  hopeful: ['optimistic', 'inspired', 'encouraged'],
  anxious: ['panicked', 'nervous', 'tense'],
  worried: ['uneasy', 'fearful', 'dreadful'],
  overwhelmed: ['swamped', 'frazzled', 'pressured'],
  helpless: ['powerless', 'stuck', 'trapped'],
  frustrated: ['impatient', 'bitter', 'resentful'],
  irritated: ['annoyed', 'agitated', 'grumpy'],
  jealous: ['envious', 'insecure', 'threatened'],
  hurt: ['ignored', 'betrayed', 'unimportant'],
  awful: ['nauseated', 'horrified', 'revulsed'],
  repelled: ['put-off', 'sickened', 'turned-off'],
  judgemental: ['critical', 'disapproving', 'skeptical'],
  embarrassed: ['ashamed', 'self-conscious', 'mortified'],
  confused: ['puzzled', 'disoriented', 'perplexed'],
  amazed: ['awe', 'astonished', 'wonderstruck'],
  shocked: ['stunned', 'startled', 'dismayed'],
  unsure: ['hesitant', 'doubtful', 'torn'],
}

function colorFor(word: string, rootValence: Valence | undefined, selected: boolean, highlighted: boolean) {
  if (selected) return { bg: 'rgba(74,124,111,0.4)', border: 'rgba(74,124,111,0.7)', text: '#cfe6df' }
  if (highlighted) return { bg: 'rgba(220,150,40,0.3)', border: 'rgba(220,150,40,0.6)', text: '#f0d28a' }
  if (rootValence === 'pos') return { bg: 'rgba(220,170,60,0.14)', border: 'rgba(220,170,60,0.3)', text: 'rgba(255,255,255,0.85)' }
  if (rootValence === 'anger') return { bg: 'rgba(200,80,50,0.16)', border: 'rgba(200,80,50,0.35)', text: 'rgba(255,255,255,0.85)' }
  return { bg: 'rgba(90,110,200,0.14)', border: 'rgba(90,110,200,0.3)', text: 'rgba(255,255,255,0.85)' } // neg / default cool
}

export default function EmotionWheel({ sessionId, role, isLocked }: EmotionWheelProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [level, setLevel] = useState(1)
  const [path, setPath] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [comparePrompt, setComparePrompt] = useState<string[]>([])

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.ewLevel === 'number') setLevel(s.ewLevel)
      if (Array.isArray(s.ewPath)) setPath(s.ewPath)
      if (typeof s.ewSelected === 'string') setSelected(s.ewSelected)
      if (Array.isArray(s.ewHighlighted)) setHighlighted(s.ewHighlighted)
    })
    return () => unsub()
  }, [sessionId])

  const rootValence = path[0] ? VALENCE[path[0]] : undefined

  const drillIn = useCallback((word: string) => {
    if (!canInteract) return
    const newPath = [...path.slice(0, level - 1), word]
    if (level === 1 && L2[word]) {
      write({ 'moduleState.ewLevel': 2, 'moduleState.ewPath': newPath, 'moduleState.ewSelected': '' })
    } else if (level === 2 && L3[word]) {
      write({ 'moduleState.ewLevel': 3, 'moduleState.ewPath': newPath, 'moduleState.ewSelected': '' })
    } else {
      write({ 'moduleState.ewPath': newPath, 'moduleState.ewSelected': word })
    }
  }, [canInteract, path, level, write])

  const goBack = useCallback(() => {
    if (!canInteract || level <= 1) return
    write({ 'moduleState.ewLevel': level - 1, 'moduleState.ewPath': path.slice(0, level - 1), 'moduleState.ewSelected': '' })
  }, [canInteract, level, path, write])

  const toggleHighlight = useCallback((word: string) => {
    if (!isT) return
    const next = highlighted.includes(word) ? highlighted.filter(w => w !== word) : [...highlighted, word]
    write({ 'moduleState.ewHighlighted': next })
  }, [isT, highlighted, write])

  const options = level === 1 ? L1 : level === 2 ? (L2[path[0]] || []) : (L3[path[1]] || [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        🎡 Emotion Wheel
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', minHeight: 18 }}>
        {level > 1 && canInteract && <button onClick={goBack} style={{ ...btnStyle, padding: '3px 8px' }}>‹ Back</button>}
        <span style={{ textTransform: 'capitalize' }}>{path.length ? path.join(' › ') : 'Choose a broad feeling'}</span>
      </div>

      {/* Concentric ring visual hint */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
        {[1, 2, 3].map(l => (
          <div key={l} style={{ width: 8, height: 8, borderRadius: '50%', background: level === l ? '#4a7c6f' : 'rgba(255,255,255,0.15)' }} />
        ))}
      </div>

      {/* Options as ring segments */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '8px 0' }}>
        {options.map(word => {
          const isSel = selected === word
          const isHi = highlighted.includes(word)
          const c = colorFor(word, rootValence, isSel, isHi)
          return (
            <div key={word} style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              <button onClick={() => drillIn(word)} disabled={!canInteract}
                style={{
                  padding: '12px 18px', borderRadius: 999, fontSize: level === 1 ? 14 : 13, textTransform: 'capitalize',
                  cursor: canInteract ? 'pointer' : 'default', background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                  fontFamily: isSel ? '"DM Serif Display", serif' : '"DM Sans", sans-serif',
                }}>
                {word}
              </button>
              {isT && (
                <button onClick={() => toggleHighlight(word)} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: isHi ? '#f0d28a' : 'rgba(255,255,255,0.35)', cursor: 'pointer' }}>
                  {isHi ? '★ highlighted' : 'highlight'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ background: 'rgba(74,124,111,0.15)', border: '1px solid rgba(74,124,111,0.35)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>You named it</div>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20, textTransform: 'capitalize', color: '#cfe6df', marginTop: 4 }}>{selected}</div>
        </div>
      )}

      {/* Therapist compare */}
      {isT && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={labelStyle}>Compare two emotions (body sensation)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="Emotion A" value={comparePrompt[0] || ''} onChange={e => setComparePrompt([e.target.value, comparePrompt[1] || ''])} style={inputStyle} />
            <input placeholder="Emotion B" value={comparePrompt[1] || ''} onChange={e => setComparePrompt([comparePrompt[0] || '', e.target.value])} style={inputStyle} />
          </div>
          {comparePrompt[0] && comparePrompt[1] && (
            <div style={{ display: 'flex', gap: 6 }}>
              {comparePrompt.map((em, i) => (
                <div key={i} style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                  Where do you feel <strong style={{ textTransform: 'capitalize' }}>{em}</strong> in your body?
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', outline: 'none', fontFamily: '"DM Sans", sans-serif' }
const btnStyle: React.CSSProperties = { padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }
