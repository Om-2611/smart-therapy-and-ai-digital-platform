'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ChevronLeft, Lightbulb } from 'lucide-react'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface EmotionWheelProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

/* ---- Taxonomy (unchanged) --------------------------------------------
   `L1` keys are the values persisted in `moduleState.ewPath`, so they stay
   exactly as they were. Two of them read better to a client under their
   mockup labels — see CORE below — but only the *label* differs. */
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

/* ---- Body sensations --------------------------------------------------
   The section used to print "Where do you feel X in your body?" and stop
   there. That question presumes an emotion lives in one place, which is not
   how interoception works and is hard for a child to answer — most feelings
   show up as several sensations at once, and some show up as an absence.

   So the question becomes "What do you notice in your body?" and the answer
   becomes a pick-list. Wording is deliberately plain and concrete: "tummy",
   not "abdomen"; "buzzy", not "hyperaroused". Every option is something a
   child can check against their own body right now. */
interface Sensation { id: string; emoji: string; label: string }

const SENSATIONS: Record<string, Sensation> = {
  racingHeart:  { id: 'racingHeart',  emoji: '💓', label: 'Racing heart' },
  tightChest:   { id: 'tightChest',   emoji: '🫁', label: 'Tight chest' },
  fastBreath:   { id: 'fastBreath',   emoji: '💨', label: 'Fast breathing' },
  butterflies:  { id: 'butterflies',  emoji: '🦋', label: 'Butterflies in tummy' },
  sickTummy:    { id: 'sickTummy',    emoji: '🤢', label: 'Sick or churny tummy' },
  shakyHands:   { id: 'shakyHands',   emoji: '🤲', label: 'Shaky hands' },
  tenseMuscles: { id: 'tenseMuscles', emoji: '💪', label: 'Tense muscles' },
  clenchedJaw:  { id: 'clenchedJaw',  emoji: '😬', label: 'Clenched jaw or fists' },
  hotFace:      { id: 'hotFace',      emoji: '🔥', label: 'Hot face' },
  cold:         { id: 'cold',         emoji: '🧊', label: 'Cold or shivery' },
  dizzy:        { id: 'dizzy',        emoji: '💫', label: 'Dizzy or spinny' },
  headache:     { id: 'headache',     emoji: '🤕', label: 'Aching head' },
  lumpThroat:   { id: 'lumpThroat',   emoji: '😖', label: 'Lump in throat' },
  teary:        { id: 'teary',        emoji: '💧', label: 'Teary eyes' },
  heavy:        { id: 'heavy',        emoji: '🪨', label: 'Heavy body' },
  tired:        { id: 'tired',        emoji: '🥱', label: 'Tired, low energy' },
  frozen:       { id: 'frozen',       emoji: '🧍', label: 'Frozen still' },
  fidgety:      { id: 'fidgety',      emoji: '🦵', label: 'Fidgety legs' },
  buzzy:        { id: 'buzzy',        emoji: '⚡', label: 'Buzzy energy' },
  light:        { id: 'light',        emoji: '🎈', label: 'Light and floaty' },
  warm:         { id: 'warm',         emoji: '☀️', label: 'Warm feeling' },
  relaxed:      { id: 'relaxed',      emoji: '😌', label: 'Relaxed body' },
  bigSmile:     { id: 'bigSmile',     emoji: '😄', label: 'Big smile' },
  nothingMuch:  { id: 'nothingMuch',  emoji: '🌫️', label: 'Not much at all' },
}

/* Which sensations to offer, by emotion family. Offering all 24 every time
   would be a reading test; each family shows the handful that actually fit it.
   `nothingMuch` is on every list on purpose — "I do not notice anything" is a
   real and common answer, especially with numbness, and a list that cannot
   express it teaches a child to invent a sensation to please the adult. */
const SENSATIONS_BY_FAMILY: Record<string, string[]> = {
  scared:    ['racingHeart', 'tightChest', 'fastBreath', 'butterflies', 'shakyHands', 'sickTummy', 'frozen', 'dizzy', 'nothingMuch'],
  angry:     ['hotFace', 'tenseMuscles', 'clenchedJaw', 'racingHeart', 'fastBreath', 'headache', 'fidgety', 'tightChest', 'nothingMuch'],
  bad:       ['heavy', 'tired', 'lumpThroat', 'teary', 'tightChest', 'cold', 'sickTummy', 'frozen', 'nothingMuch'],
  good:      ['warm', 'relaxed', 'light', 'bigSmile', 'buzzy', 'fastBreath', 'racingHeart', 'fidgety', 'nothingMuch'],
  disgusted: ['sickTummy', 'lumpThroat', 'hotFace', 'tenseMuscles', 'cold', 'heavy', 'frozen', 'nothingMuch'],
  surprised: ['racingHeart', 'frozen', 'dizzy', 'butterflies', 'fastBreath', 'buzzy', 'hotFace', 'nothingMuch'],
}

/* A general set for a word typed freehand that is not in the taxonomy. */
const SENSATIONS_GENERAL = [
  'racingHeart', 'tightChest', 'butterflies', 'tenseMuscles', 'shakyHands',
  'warm', 'relaxed', 'heavy', 'tired', 'buzzy', 'hotFace', 'nothingMuch',
]

/* Walk the taxonomy to find which L1 family a word belongs to, at any depth,
   so "heartbroken" resolves to `bad` and gets the low-and-heavy list rather
   than the generic one. Free text is matched case-insensitively. */
function familyOf(word: string): string | null {
  const w = word.trim().toLowerCase()
  if (!w) return null
  if (L1.includes(w)) return w
  for (const root of L1) {
    const l2 = L2[root] || []
    if (l2.includes(w)) return root
    for (const mid of l2) if ((L3[mid] || []).includes(w)) return root
  }
  return null
}

function sensationsFor(word: string): Sensation[] {
  const fam = familyOf(word)
  const ids = (fam && SENSATIONS_BY_FAMILY[fam]) || SENSATIONS_GENERAL
  return ids.map(id => SENSATIONS[id]).filter(Boolean)
}

/* ---- Palette ----------------------------------------------------------
   This module renders on ModuleStage's WHITE canvas, so every colour is
   stated literally and dark-on-light. The shared `--ink-*` CSS vars are
   authored for the dark sidebar panel and are deliberately NOT used here. */
const INK = '#16233A'          // headings — dark navy
const INK_BODY = '#334155'     // card copy
const INK_MUTED = '#475569'    // helper copy (7:1 on white)
const INK_FAINT = '#64748B'    // micro-labels (4.9:1 on white)
const LINE = '#e7eaef'
const AMBER = '#D97706'        // therapist highlight marker

interface CoreEmotion {
  key: string       // taxonomy key — what Firestore stores
  label: string     // what the client reads
  emoji: string
  accent: string    // saturated: text on tint, or fill behind white text
  tint: string      // pale wash behind the tile
  ring: string      // focus/selection halo
}

/* Mockup order, left to right. Each accent is dark enough to read on its own
   tint (e.g. #DC2626 on #FEF2F2 ≈ 4.9:1) — never pale-on-pale. */
const CORE: CoreEmotion[] = [
  { key: 'angry',     label: 'Angry',     emoji: '😡', accent: '#DC2626', tint: '#FEF2F2', ring: 'rgba(220,38,38,0.18)' },
  { key: 'bad',       label: 'Sad',       emoji: '😟', accent: '#2563EB', tint: '#EFF6FF', ring: 'rgba(37,99,235,0.18)' },
  { key: 'scared',    label: 'Scared',    emoji: '😨', accent: '#7C3AED', tint: '#F5F3FF', ring: 'rgba(124,58,237,0.18)' },
  { key: 'good',      label: 'Happy',     emoji: '😄', accent: '#16A34A', tint: '#F0FDF4', ring: 'rgba(22,163,74,0.18)' },
  { key: 'surprised', label: 'Surprised', emoji: '😮', accent: '#D97706', tint: '#FFFBEB', ring: 'rgba(217,119,6,0.18)' },
  { key: 'disgusted', label: 'Disgusted', emoji: '🤢', accent: '#65A30D', tint: '#F7FEE7', ring: 'rgba(101,163,13,0.18)' },
]

const CORE_BY_KEY: Record<string, CoreEmotion> = Object.fromEntries(CORE.map(c => [c.key, c]))

/* Layers 2 and 3 are shades of whichever core emotion the client opened, so
   they inherit that emotion's pair and keep the tile language. */
const NEUTRAL: CoreEmotion = { key: '', label: '', emoji: '💭', accent: '#334155', tint: '#F8FAFC', ring: 'rgba(51,65,85,0.16)' }

const labelFor = (word: string) => CORE_BY_KEY[word]?.label ?? word

export default function EmotionWheel({ sessionId, role, isLocked }: EmotionWheelProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [level, setLevel] = useState(1)
  const [path, setPath] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [highlighted, setHighlighted] = useState<string[]>([])
  const [comparePrompt, setComparePrompt] = useState<string[]>([])
  /* Sensations picked per slot, keyed '0' and '1'. Shared, because the person
     answering "what do you notice in your body" is the client, and the pair
     itself has to reach their screen for them to answer it. */
  const [sensations, setSensations] = useState<Record<string, string[]>>({})

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
      if (Array.isArray(s.ewComparePair)) setComparePrompt(s.ewComparePair as string[])
      if (s.ewSensations && typeof s.ewSensations === 'object') {
        setSensations(s.ewSensations as Record<string, string[]>)
      }
    })
    return () => unsub()
  }, [sessionId])

  const drillIn = useCallback((word: string) => {
    if (!canInteract) return
    const newPath = [...path.slice(0, level - 1), word]
    if (level === 1 && L2[word]) {
      write({ 'moduleState.ewLevel': 2, 'moduleState.ewPath': newPath, 'moduleState.ewSelected': '' })
    } else if (level === 2 && L3[word]) {
      write({ 'moduleState.ewLevel': 3, 'moduleState.ewPath': newPath, 'moduleState.ewSelected': '' })
    } else {
      write({ 'moduleState.ewPath': newPath, 'moduleState.ewSelected': word })
      logModuleEvent(sessionId, {
        module: 'emotion-wheel',
        type: 'emotion_named',
        detail: `Named the emotion "${word}" (${newPath.join(' › ')})`,
      })
    }
  }, [canInteract, path, level, write, sessionId])

  const goBack = useCallback(() => {
    if (!canInteract || level <= 1) return
    write({ 'moduleState.ewLevel': level - 1, 'moduleState.ewPath': path.slice(0, level - 1), 'moduleState.ewSelected': '' })
  }, [canInteract, level, path, write])

  const toggleHighlight = useCallback((word: string) => {
    if (!isT) return
    const next = highlighted.includes(word) ? highlighted.filter(w => w !== word) : [...highlighted, word]
    write({ 'moduleState.ewHighlighted': next })
  }, [isT, highlighted, write])

  /* Therapist sets the pair; changing it clears the answers, because a
     sensation picked for "angry" means nothing once the slot says "grateful". */
  const setPair = useCallback((a: string, b: string) => {
    if (!isT) return
    setComparePrompt([a, b])
    write({ 'moduleState.ewComparePair': [a, b], 'moduleState.ewSensations': {} })
  }, [isT, write])

  const toggleSensation = useCallback((slot: number, id: string) => {
    if (!canInteract) return
    const key = String(slot)
    const cur = sensations[key] || []
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
    const merged = { ...sensations, [key]: next }
    setSensations(merged)
    write({ 'moduleState.ewSensations': merged })
    if (!cur.includes(id)) {
      const em = comparePrompt[slot]
      const label = SENSATIONS[id]?.label
      if (em && label) {
        logModuleEvent(sessionId, {
          module: 'emotion-wheel',
          type: 'body_sensation',
          detail: `Noticed "${label}" in the body when feeling "${em}"`,
        })
      }
    }
  }, [canInteract, sensations, comparePrompt, write, sessionId])

  const options = level === 1 ? L1 : level === 2 ? (L2[path[0]] || []) : (L3[path[1]] || [])
  // Level 1 is laid out in the mockup's reading order; the taxonomy list itself is untouched.
  const ordered = level === 1 ? CORE.map(c => c.key).filter(k => options.includes(k)) : options

  // Deeper layers borrow the palette of the core emotion they descend from.
  const rootPalette = CORE_BY_KEY[path[0]] ?? NEUTRAL
  const isCoreLevel = level === 1

  return (
    /* Root fills the stage and never scrolls itself: ModuleStage's body is
       overflow:hidden and hands every module a `height:100%` box with an
       internal `flex:1` region. Only the tile field scrolls, and only if a
       very short canvas forces it. */
    <div style={{
      height: '100%', minHeight: 0, maxWidth: '100%',
      display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: '"DM Sans", sans-serif', color: INK,
    }}>
      <style>{`
        .ew-tile { transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease; }
        .ew-tile:not(:disabled):hover { transform: translateY(-3px); }
        .ew-tile:disabled { cursor: default; }
        .ew-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        .ew-scroll::-webkit-scrollbar { width: 7px; }
        .ew-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
        .ew-input::placeholder { color: #94a3b8; }
        .ew-input:focus { border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(100,116,139,0.12); }
      `}</style>

      {/* ---- Identity mark + subtitle. The module TITLE is deliberately absent:
              ModuleStage already renders "Emotion Wheel" and the category line
              directly above this body. ---- */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div aria-hidden style={{
          width: 44, height: 44, borderRadius: '50%', background: '#ffffff',
          border: `1px solid ${LINE}`, boxShadow: '0 2px 8px rgba(20,30,45,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: `conic-gradient(${CORE.map((c, i) => `${c.accent} ${i * 60}deg ${(i + 1) * 60}deg`).join(', ')})`,
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.75)',
          }} />
        </div>
        <div style={{ fontSize: 18.5, fontWeight: 500, color: INK_MUTED, textAlign: 'center' }}>
          Choose an emotion to explore deeper.
        </div>
      </div>

      {/* ---- Layer bar: back, breadcrumb, depth dots. Fixed height so the tile
              field never reflows between layers. ---- */}
      <div style={{
        flexShrink: 0, minHeight: 30, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {level > 1 && canInteract && (
          <button onClick={goBack} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px 6px 8px', borderRadius: 999,
            border: `1px solid ${LINE}`, background: '#ffffff',
            fontSize: 16.5, fontWeight: 600, color: INK_MUTED,
            fontFamily: '"DM Sans", sans-serif', cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(20,30,45,0.05)',
          }}>
            <ChevronLeft size={15} strokeWidth={2.4} /> Back
          </button>
        )}

        <span style={{
          padding: '6px 14px', borderRadius: 999,
          background: level > 1 ? rootPalette.tint : '#F8FAFC',
          border: `1px solid ${level > 1 ? rootPalette.accent : LINE}`,
          fontSize: 16.5, fontWeight: 700, letterSpacing: 0.1,
          color: level > 1 ? rootPalette.accent : INK_FAINT,
          textTransform: 'capitalize',
        }}>
          {path.length ? path.map(labelFor).join(' › ') : 'Layer 1 · core feelings'}
        </span>

        <span aria-hidden style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          {[1, 2, 3].map(l => (
            <span key={l} style={{
              width: 7, height: 7, borderRadius: '50%',
              background: level >= l ? (level > 1 ? rootPalette.accent : INK_FAINT) : '#DDE3EC',
            }} />
          ))}
        </span>
      </div>

      {/* ---- The tile field ---- */}
      <div className="ew-scroll" style={{
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px 0',
      }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 14,
          justifyContent: 'center', alignItems: 'flex-start', width: '100%',
        }}>
          {ordered.map(word => {
            const p = isCoreLevel ? (CORE_BY_KEY[word] ?? NEUTRAL) : rootPalette
            const isSel = selected === word
            const isHi = highlighted.includes(word)
            return (
              <div key={word} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button
                  className="ew-tile"
                  onClick={() => drillIn(word)}
                  disabled={!canInteract}
                  title={canInteract ? `Explore ${labelFor(word)}` : undefined}
                  style={{
                    position: 'relative', boxSizing: 'border-box',
                    width: isCoreLevel ? 150 : 162,
                    minHeight: isCoreLevel ? 150 : 126,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: isCoreLevel ? 10 : 8, padding: '14px 10px',
                    borderRadius: isCoreLevel ? 20 : 18,
                    background: p.tint,
                    border: isSel
                      ? `2px solid ${p.accent}`
                      : isHi ? `2px solid ${AMBER}` : `1.5px solid ${p.ring}`,
                    boxShadow: isSel
                      ? `0 0 0 4px ${p.ring}, 0 6px 16px rgba(20,30,45,0.08)`
                      : isHi ? '0 0 0 4px rgba(217,119,6,0.18)' : '0 2px 8px rgba(20,30,45,0.05)',
                    cursor: canInteract ? 'pointer' : 'default',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {isHi && (
                    <span aria-label="highlighted" style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 20, height: 20, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#FEF3C7', border: `1px solid ${AMBER}`,
                      fontSize: 13, color: '#92400E', lineHeight: 1,
                    }}>★</span>
                  )}

                  <span aria-hidden style={{
                    fontSize: isCoreLevel ? 54 : 34, lineHeight: 1,
                    filter: 'drop-shadow(0 3px 5px rgba(20,30,45,0.16))',
                  }}>
                    {p.emoji}
                  </span>

                  <span style={{
                    fontSize: isCoreLevel ? 19 : 15.5, fontWeight: 800, letterSpacing: -0.2,
                    lineHeight: 1.2, textAlign: 'center', textTransform: 'capitalize',
                    color: p.accent,
                  }}>
                    {labelFor(word)}
                  </span>
                </button>

                {/* Therapist-only marker, unchanged behaviour. */}
                <div style={{ minHeight: 20 }}>
                  {isT && (
                    <button onClick={() => toggleHighlight(word)} style={{
                      padding: '2px 9px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${isHi ? AMBER : LINE}`,
                      background: isHi ? '#FFFBEB' : '#ffffff',
                      fontSize: 13.5, fontWeight: 700,
                      color: isHi ? '#92400E' : INK_FAINT,
                      fontFamily: '"DM Sans", sans-serif',
                    }}>
                      {isHi ? '★ highlighted' : 'highlight'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {ordered.length === 0 && (
            <span style={{ fontSize: 16.5, color: INK_FAINT, padding: '20px 0' }}>
              No further shades here — this is as specific as the wheel goes.
            </span>
          )}
        </div>
      </div>

      {/* ---- Footer: the named emotion once we reach the leaf, otherwise the
              lightbulb tip from the mockup. ---- */}
      {selected ? (
        <div style={{
          flexShrink: 0, alignSelf: 'center', maxWidth: 620,
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 22px', borderRadius: 16,
          background: rootPalette.tint, border: `1.5px solid ${rootPalette.accent}`,
          boxShadow: '0 4px 14px rgba(20,30,45,0.06)',
        }}>
          <span aria-hidden style={{ fontSize: 33, lineHeight: 1 }}>{rootPalette.emoji}</span>
          <span>
            <span style={{
              display: 'block', fontSize: 13.5, fontWeight: 800, letterSpacing: 1.3,
              textTransform: 'uppercase', color: INK_FAINT,
            }}>
              You named it
            </span>
            <span style={{
              display: 'block', marginTop: 2, fontSize: 28, fontWeight: 800,
              letterSpacing: -0.3, textTransform: 'capitalize', color: rootPalette.accent,
            }}>
              {selected}
            </span>
          </span>
        </div>
      ) : (
        <div style={{
          flexShrink: 0, alignSelf: 'center', maxWidth: 620,
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 20px', borderRadius: 16,
          background: '#ffffff', border: `1px solid ${LINE}`,
          boxShadow: '0 4px 14px rgba(20,30,40,0.05)',
        }}>
          <span aria-hidden style={{
            width: 34, height: 34, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#FEF6DF', border: '1px solid #FBE3A6',
          }}>
            <Lightbulb size={18} color={AMBER} fill="#FCD34D" />
          </span>
          <span style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.45, color: INK_BODY }}>
            There are many shades to every emotion.<br />
            Let&apos;s explore them together, one layer at a time.
          </span>
        </div>
      )}

      {/* ---- Therapist compare tool (local-only prompt, unchanged) ---- */}
      {/* ---- Compare two emotions: what the body notices ----
           Visible to BOTH roles now. The therapist still chooses the pair, but
           the person answering "what do you notice in your body" is the client,
           so the question has to reach their screen. It was therapist-only,
           which meant nobody could actually answer it. */}
      {(isT || (comparePrompt[0] && comparePrompt[1])) && (
        <div style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 9,
          padding: '11px 14px 13px', borderRadius: 16,
          background: '#ffffff', border: `1px solid ${LINE}`,
          boxShadow: '0 2px 10px rgba(20,30,45,0.05)',
        }}>
          <div style={{
            fontSize: 13.5, fontWeight: 800, letterSpacing: 1.3,
            textTransform: 'uppercase', color: INK_FAINT,
          }}>
            Compare two emotions (body sensation)
          </div>

          {isT && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="ew-input" placeholder="Emotion A" value={comparePrompt[0] || ''}
                onChange={e => setPair(e.target.value, comparePrompt[1] || '')} style={inputStyle} />
              <input className="ew-input" placeholder="Emotion B" value={comparePrompt[1] || ''}
                onChange={e => setPair(comparePrompt[0] || '', e.target.value)} style={inputStyle} />
            </div>
          )}

          {comparePrompt[0] && comparePrompt[1] && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {comparePrompt.map((em, i) => {
                const picked = sensations[String(i)] || []
                const opts = sensationsFor(em)
                return (
                  <div key={i} style={{
                    flex: 1, minWidth: 0, padding: '11px 12px 12px', borderRadius: 14,
                    background: '#F8FAFC', border: `1px solid ${LINE}`,
                  }}>
                    <div style={{
                      fontSize: 16.5, lineHeight: 1.4, color: INK_BODY,
                      textAlign: 'center', marginBottom: 9,
                    }}>
                      What do you notice in your body when you feel{' '}
                      <strong style={{ textTransform: 'capitalize', color: INK }}>{em}</strong>?
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                      {opts.map(sn => {
                        const on = picked.includes(sn.id)
                        return (
                          <button
                            key={sn.id}
                            onClick={() => toggleSensation(i, sn.id)}
                            disabled={!canInteract}
                            aria-pressed={on}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '7px 12px', borderRadius: 999,
                              border: `1.5px solid ${on ? AMBER : LINE}`,
                              background: on ? '#FEF6E7' : '#ffffff',
                              color: on ? '#8A4B08' : INK_MUTED,
                              fontSize: 15, fontWeight: on ? 800 : 600,
                              fontFamily: '"DM Sans", sans-serif',
                              cursor: canInteract ? 'pointer' : 'default',
                              transition: 'background .12s, border-color .12s, color .12s',
                            }}
                          >
                            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>{sn.emoji}</span>
                            {sn.label}
                          </button>
                        )
                      })}
                    </div>

                    {/* Several sensations at once is the normal answer, so the
                        count is shown rather than implying one right pick. */}
                    <div style={{
                      marginTop: 9, textAlign: 'center', fontSize: 14, fontWeight: 600,
                      color: picked.length ? '#8A4B08' : INK_FAINT,
                    }}>
                      {picked.length
                        ? `${picked.length} noticed`
                        : 'Pick as many as you notice'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, boxSizing: 'border-box', outline: 'none',
  background: '#ffffff', border: `1px solid ${LINE}`, borderRadius: 12,
  padding: '9px 12px', fontSize: 16.5, color: INK_BODY,
  fontFamily: '"DM Sans", sans-serif',
  transition: 'border-color .15s, box-shadow .15s',
}
