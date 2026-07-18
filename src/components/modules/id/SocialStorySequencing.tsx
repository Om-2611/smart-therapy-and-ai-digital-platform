'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface SocialStorySequencingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface Panel {
  id: string
  emoji: string
  caption: string
  correctIndex: number
}

interface Story {
  id: string
  title: string
  panels: Panel[]
}

const STORIES: Story[] = [
  {
    id: 'getting-ready-school', title: 'Getting Ready for School',
    panels: [
      { id: 's1p1', emoji: '😴', caption: 'Wake up when the alarm rings', correctIndex: 0 },
      { id: 's1p2', emoji: '🦷', caption: 'Brush teeth and wash face', correctIndex: 1 },
      { id: 's1p3', emoji: '👕', caption: 'Put on school clothes', correctIndex: 2 },
      { id: 's1p4', emoji: '🍳', caption: 'Eat breakfast', correctIndex: 3 },
      { id: 's1p5', emoji: '🎒', caption: 'Pack bag and go to school', correctIndex: 4 },
    ],
  },
  {
    id: 'meeting-someone-new', title: 'Meeting Someone New',
    panels: [
      { id: 's2p1', emoji: '👀', caption: 'See someone new', correctIndex: 0 },
      { id: 's2p2', emoji: '😊', caption: 'Smile and say hello', correctIndex: 1 },
      { id: 's2p3', emoji: '🤝', caption: 'Tell them your name', correctIndex: 2 },
      { id: 's2p4', emoji: '🗣️', caption: 'Ask their name and listen', correctIndex: 3 },
    ],
  },
  {
    id: 'when-i-feel-angry', title: 'When I Feel Angry',
    panels: [
      { id: 's3p1', emoji: '😡', caption: 'I start to feel angry', correctIndex: 0 },
      { id: 's3p2', emoji: '✋', caption: 'Stop and take a deep breath', correctIndex: 1 },
      { id: 's3p3', emoji: '💭', caption: "Think about why I'm angry", correctIndex: 2 },
      { id: 's3p4', emoji: '🗣️', caption: 'Use words to say how I feel', correctIndex: 3 },
      { id: 's3p5', emoji: '😌', caption: 'Feel calmer now', correctIndex: 4 },
    ],
  },
  {
    id: 'going-to-doctor', title: 'Going to the Doctor',
    panels: [
      { id: 's4p1', emoji: '🏥', caption: "We go to the doctor's office", correctIndex: 0 },
      { id: 's4p2', emoji: '🪑', caption: 'Wait quietly in the waiting room', correctIndex: 1 },
      { id: 's4p3', emoji: '👨‍⚕️', caption: 'The doctor calls my name', correctIndex: 2 },
      { id: 's4p4', emoji: '🩺', caption: "Doctor checks how I'm feeling", correctIndex: 3 },
      { id: 's4p5', emoji: '😊', caption: 'We say thank you and go home', correctIndex: 4 },
    ],
  },
  {
    id: 'sharing-with-friend', title: 'Sharing with a Friend',
    panels: [
      { id: 's5p1', emoji: '🎮', caption: 'I have a toy I like', correctIndex: 0 },
      { id: 's5p2', emoji: '👦', caption: 'My friend wants to play too', correctIndex: 1 },
      { id: 's5p3', emoji: '🤝', caption: 'I share my toy with them', correctIndex: 2 },
      { id: 's5p4', emoji: '😊', caption: 'We both feel happy playing together', correctIndex: 3 },
    ],
  },
  {
    id: 'asking-for-help', title: 'Asking for Help',
    panels: [
      { id: 's6p1', emoji: '😕', caption: "I don't understand something", correctIndex: 0 },
      { id: 's6p2', emoji: '🙋', caption: 'I raise my hand or go to a grown-up', correctIndex: 1 },
      { id: 's6p3', emoji: '🗣️', caption: 'Can you help me please?', correctIndex: 2 },
      { id: 's6p4', emoji: '😊', caption: 'I get help and feel better', correctIndex: 3 },
    ],
  },
  {
    id: 'handling-disappointment', title: 'Handling Disappointment',
    panels: [
      { id: 's7p1', emoji: '🤩', caption: 'I was really looking forward to something', correctIndex: 0 },
      { id: 's7p2', emoji: '😞', caption: "It didn't happen the way I wanted", correctIndex: 1 },
      { id: 's7p3', emoji: '😢', caption: 'I feel sad and disappointed', correctIndex: 2 },
      { id: 's7p4', emoji: '💭', caption: "I remind myself: it's okay to feel sad", correctIndex: 3 },
      { id: 's7p5', emoji: '🌈', caption: 'I think of something else to look forward to', correctIndex: 4 },
    ],
  },
  {
    id: 'birthday-party', title: 'Going to a Birthday Party',
    panels: [
      { id: 's8p1', emoji: '💌', caption: 'I get an invitation to a party', correctIndex: 0 },
      { id: 's8p2', emoji: '🎁', caption: 'We buy a present for my friend', correctIndex: 1 },
      { id: 's8p3', emoji: '🏠', caption: 'We arrive at the party', correctIndex: 2 },
      { id: 's8p4', emoji: '🎈', caption: 'I say happy birthday and give the gift', correctIndex: 3 },
      { id: 's8p5', emoji: '🎂', caption: 'We eat cake and play games', correctIndex: 4 },
      { id: 's8p6', emoji: '👋', caption: 'I say thank you and goodbye', correctIndex: 5 },
    ],
  },
]

const PICKER_EMOJIS = ['😊','😢','😡','😕','🤩','😞','😌','😰','🙋','👀','🤝','🗣️','👋','✋','💭','🌈','🏠','🏥','🎒','🪑','👨‍⚕️','🩺','🎮','🎁','🎈','🎂','🍳','🦷','👕','💌','👦','🦁','🐶','🐱','🌻','📚','🎵','🏆','🌟','🎉']

const PLAY_DUR = 1200
const TRANS_DUR = 300

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

export default function SocialStorySequencing({ sessionId, role, isLocked }: SocialStorySequencingProps) {
  const isT = role === 'therapist'
  const canDrop = isT || !isLocked

  const [storyId, setStoryId] = useState('getting-ready-school')
  const [panels, setPanels] = useState<Panel[]>(STORIES[0].panels)
  const [shuffled, setShuffled] = useState<string[]>([])
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [difficulty, setDifficulty] = useState('standard')
  const [readAloud, setReadAloud] = useState(true)
  const [attempts, setAttempts] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [storiesDone, setStoriesDone] = useState(0)
  const [showedAnswer, setShowedAnswer] = useState(false)
  const [customStory, setCustomStory] = useState<Story | null>(null)

  const [dragItem, setDragItem] = useState<string | null>(null)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null)
  const [wrongSlots, setWrongSlots] = useState<Set<number>>(new Set())
  const [correctSlots, setCorrectSlots] = useState<Set<number>>(new Set())
  const [playIdx, setPlayIdx] = useState(-1)
  const [hintPanel, setHintPanel] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customPanels, setCustomPanels] = useState<{ emoji: string; caption: string }[]>(Array.from({ length: 4 }, () => ({ emoji: '😊', caption: '' })))
  const [toast, setToast] = useState<{ msg: string } | null>(null)
  const [waiting, setWaiting] = useState(false)

  const cRef = useRef<HTMLDivElement>(null)
  const isDrag = useRef(false)
  const dragId = useRef<string | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const playT = useRef<ReturnType<typeof setTimeout>>()
  const chain = useRef<ReturnType<typeof setTimeout>[]>([])

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.ssStoryId === 'string') setStoryId(s.ssStoryId)
      if (Array.isArray(s.ssPanels)) setPanels(s.ssPanels as Panel[])
      if (Array.isArray(s.ssShuffled)) setShuffled(s.ssShuffled)
      if (typeof s.ssPlaced === 'object' && s.ssPlaced !== null) setPlaced(s.ssPlaced as Record<string, string>)
      if (typeof s.ssDifficulty === 'string') setDifficulty(s.ssDifficulty)
      if (typeof s.ssReadAloud === 'boolean') setReadAloud(s.ssReadAloud)
      if (typeof s.ssAttempts === 'number') setAttempts(s.ssAttempts)
      if (typeof s.ssCompleted === 'boolean') setCompleted(s.ssCompleted)
      if (typeof s.ssStoriesCompleted === 'number') setStoriesDone(s.ssStoriesCompleted)
      if (typeof s.ssShowedAnswer === 'boolean') setShowedAnswer(s.ssShowedAnswer)
      if (s.ssCustomStory && typeof s.ssCustomStory === 'object') {
        const cs = s.ssCustomStory as { title: string; panels: Panel[] }
        if (Array.isArray(cs.panels)) setCustomStory({ id: 'custom', title: cs.title || 'Custom Story', panels: cs.panels })
      }
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => () => {
    if (toastT.current) clearTimeout(toastT.current)
    chain.current.forEach(t => clearTimeout(t))
    chain.current = []
    window.speechSynthesis?.cancel()
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast({ msg })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const activePanels = useMemo(() => {
    if (customStory && storyId === 'custom') return customStory.panels
    return STORIES.find(s => s.id === storyId)?.panels || panels
  }, [storyId, customStory, panels])

  const panelMap = useMemo(() => {
    const m = new Map<string, Panel>()
    for (const p of activePanels) m.set(p.id, p)
    return m
  }, [activePanels])

  const resolvedShuffled = useMemo(() => {
    const old = shuffled.filter(id => panelMap.has(id))
    if (old.length === activePanels.length) return old
    return shuffle(activePanels.map(p => p.id))
  }, [shuffled, panelMap, activePanels])

  const slotCount = activePanels.length
  const placedCount = Object.keys(placed).length
  const unplacedIds = resolvedShuffled.filter(id => !Object.values(placed).includes(id))
  const allFilled = placedCount === slotCount
  const isCorrect = useMemo(() => {
    if (!allFilled) return false
    for (let i = 0; i < slotCount; i++) {
      const pid = placed[String(i)]
      if (!pid || panelMap.get(pid)?.correctIndex !== i) return false
    }
    return true
  }, [placed, slotCount, panelMap, allFilled])

  const loadStory = useCallback((sid: string) => {
    const story = STORIES.find(s => s.id === sid)
    if (!story) return
    const ord = shuffle(story.panels.map(p => p.id))
    write({
      'moduleState.ssStoryId': sid,
      'moduleState.ssPanels': story.panels,
      'moduleState.ssShuffled': ord,
      'moduleState.ssPlaced': {},
      'moduleState.ssAttempts': 0,
      'moduleState.ssCompleted': false,
      'moduleState.ssShowedAnswer': false,
    })
    setWrongSlots(new Set())
    setCorrectSlots(new Set())
    setHintPanel(null)
    setShowAnswer(false)
    setPlayIdx(-1)
  }, [write])

  const handleDrop = useCallback((panelId: string, slotIdx: number) => {
    if (!canDrop || completed) return
    if (Object.values(placed).includes(panelId)) return
    const slotKey = String(slotIdx)
    write({ [`moduleState.ssPlaced.${slotKey}`]: panelId })
    setWrongSlots(prev => { const n = new Set(prev); n.delete(slotIdx); return n })
    setCorrectSlots(prev => { const n = new Set(prev); n.delete(slotIdx); return n })
    if (readAloud && !completed) {
      const panel = panelMap.get(panelId)
      if (panel) {
        window.speechSynthesis?.cancel()
        const u = new SpeechSynthesisUtterance(panel.caption)
        u.rate = 0.9
        window.speechSynthesis.speak(u)
      }
    }
  }, [canDrop, completed, placed, write, readAloud, panelMap])

  const removeFromSlot = useCallback((slotIdx: number) => {
    if (!canDrop || completed) return
    write({ [`moduleState.ssPlaced.${slotIdx}`]: {} }) // remove by setting to empty
    chain.current.forEach(t => clearTimeout(t))
    chain.current = []
    setPlayIdx(-1)
    setShowAnswer(false)
    setCorrectSlots(new Set())
    setWrongSlots(new Set())
  }, [canDrop, completed, write])

  const handleCheck = useCallback(() => {
    if (!allFilled) return
    const wrong = new Set<number>()
    const correct = new Set<number>()
    for (let i = 0; i < slotCount; i++) {
      const pid = placed[String(i)]
      if (pid && panelMap.get(pid)?.correctIndex === i) correct.add(i)
      else wrong.add(i)
    }
    if (wrong.size === 0) {
      setCorrectSlots(correct)
      write({ 'moduleState.ssCompleted': true, 'moduleState.ssStoriesDone': storiesDone + 1 })
      const storyTitle = customStory && storyId === 'custom'
        ? customStory.title
        : STORIES.find(s => s.id === storyId)?.title ?? storyId
      logModuleEvent(sessionId, {
        module: 'social-story-sequencing',
        type: 'story_completed',
        detail: `Sequenced "${storyTitle}" correctly in ${(attempts || 0) + 1} attempt${(attempts || 0) + 1 === 1 ? '' : 's'}`,
      })
      showToast('🌟 You got the story right!')
      setTimeout(() => {
        const p = activePanels.sort((a, b) => a.correctIndex - b.correctIndex)
        const arr: ReturnType<typeof setTimeout>[] = []
        p.forEach((panel, i) => {
          const t = setTimeout(() => {
            setPlayIdx(i)
            if (readAloud) {
              window.speechSynthesis?.cancel()
              const u = new SpeechSynthesisUtterance(panel.caption)
              u.rate = 0.9
              window.speechSynthesis.speak(u)
            }
          }, i * (PLAY_DUR + TRANS_DUR))
          arr.push(t)
        })
        const last = setTimeout(() => {
          setPlayIdx(-1)
          setWaiting(true)
        }, p.length * (PLAY_DUR + TRANS_DUR) + 500)
        arr.push(last)
        chain.current = arr
      }, 600)
    } else {
      setWrongSlots(wrong)
      setCorrectSlots(correct)
      const na = (attempts || 0) + 1
      write({ 'moduleState.ssAttempts': na })
      showToast('Almost! Try moving the highlighted panels')
      if (na >= 2) {
        const firstWrong = Array.from(wrong)[0]
        const correctPanelId = activePanels.find(p => p.correctIndex === firstWrong)?.id
        if (correctPanelId) setHintPanel(correctPanelId)
      }
    }
  }, [allFilled, placed, slotCount, panelMap, write, storiesDone, showToast, activePanels, readAloud, attempts, sessionId, storyId, customStory])

  useEffect(() => {
    if (completed && waiting && !showAnswer) {
      showToast('🌟 Story complete!')
    }
  }, [completed, waiting, showAnswer, showToast])

  const revealAnswer = useCallback(() => {
    if (!isT) return
    write({ 'moduleState.ssShowedAnswer': true })
    const p = [...activePanels].sort((a, b) => a.correctIndex - b.correctIndex)
    const newPlaced: Record<string, string> = {}
    p.forEach((panel, i) => { newPlaced[String(i)] = panel.id })
    write({ 'moduleState.ssPlaced': newPlaced })
    setShowAnswer(true)
    setWrongSlots(new Set())
    setCorrectSlots(new Set())
  }, [isT, write, activePanels])

  const resetStory = useCallback(() => {
    const ord = shuffle(activePanels.map(p => p.id))
    write({
      'moduleState.ssShuffled': ord,
      'moduleState.ssPlaced': {},
      'moduleState.ssAttempts': 0,
      'moduleState.ssCompleted': false,
      'moduleState.ssShowedAnswer': false,
    })
    chain.current.forEach(t => clearTimeout(t))
    chain.current = []
    setPlayIdx(-1)
    setWrongSlots(new Set())
    setCorrectSlots(new Set())
    setHintPanel(null)
    setShowAnswer(false)
    setWaiting(false)
  }, [write, activePanels])

  const nextStory = useCallback(() => {
    const currentIdx = STORIES.findIndex(s => s.id === storyId)
    const next = STORIES[(currentIdx + 1) % STORIES.length]
    loadStory(next.id)
    setWaiting(false)
    setShowCustomForm(false)
  }, [storyId, loadStory])

  const saveCustomStory = useCallback(() => {
    if (!customTitle.trim()) return
    const ps: Panel[] = customPanels.filter(p => p.caption.trim()).map((p, i) => ({
      id: `cp${i}`, emoji: p.emoji, caption: p.caption.trim(), correctIndex: i,
    }))
    if (ps.length < 3) { showToast('Need at least 3 panels'); return }
    const ord = shuffle(ps.map(p => p.id))
    write({
      'moduleState.ssCustomStory': { title: customTitle.trim(), panels: ps },
      'moduleState.ssStoryId': 'custom',
      'moduleState.ssPanels': ps,
      'moduleState.ssShuffled': ord,
      'moduleState.ssPlaced': {},
      'moduleState.ssAttempts': 0,
      'moduleState.ssCompleted': false,
      'moduleState.ssShowedAnswer': false,
    })
    setShowCustomForm(false)
  }, [customTitle, customPanels, write, showToast])

  // --- HTML5 Drag ---
  const onDragStart = useCallback((e: React.DragEvent, panelId: string) => {
    if (!canDrop || completed) return
    isDrag.current = true
    dragId.current = panelId
    e.dataTransfer.setData('text/plain', panelId)
    e.dataTransfer.effectAllowed = 'move'
  }, [canDrop, completed])

  const onDragEnd = useCallback(() => { isDrag.current = false; dragId.current = null; setHoverSlot(null) }, [])

  const onSlotDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onSlotDragEnter = useCallback((e: React.DragEvent, idx: number) => { e.preventDefault(); setHoverSlot(idx) }, [])
  const onSlotDragLeave = useCallback(() => setHoverSlot(null), [])

  const onSlotDrop = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragId.current
    setHoverSlot(null)
    if (id) handleDrop(id, idx)
  }, [handleDrop])

  // --- Touch ---
  useEffect(() => {
    const el = cRef.current
    if (!el) return
    const onTM = (e: TouchEvent) => {
      if (!isDrag.current || !dragId.current) return
      e.preventDefault()
      const t = e.touches[0]
      setGhostPos({ x: t.clientX, y: t.clientY })
      const el2 = document.elementFromPoint(t.clientX, t.clientY)
      const slotEl = el2?.closest('[data-slot]')
      setHoverSlot(slotEl ? parseInt(slotEl.getAttribute('data-slot')!) : null)
    }
    const onTE = (e: TouchEvent) => {
      if (!isDrag.current || !dragId.current) return
      const t = e.changedTouches[0]
      const el2 = document.elementFromPoint(t.clientX, t.clientY)
      const slotEl = el2?.closest('[data-slot]')
      if (slotEl) handleDrop(dragId.current, parseInt(slotEl.getAttribute('data-slot')!))
      isDrag.current = false
      dragId.current = null
      setGhostPos(null)
      setHoverSlot(null)
    }
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE)
    el.addEventListener('touchcancel', onTE)
    return () => { el.removeEventListener('touchmove', onTM); el.removeEventListener('touchend', onTE); el.removeEventListener('touchcancel', onTE) }
  }, [handleDrop])

  const onTouchStart = useCallback((panelId: string) => (e: React.TouchEvent) => {
    if (!canDrop || completed) return
    e.preventDefault()
    isDrag.current = true
    dragId.current = panelId
    setGhostPos({ x: e.touches[0].clientX, y: e.touches[0].clientY })
  }, [canDrop, completed])

  const currentStory = customStory && storyId === 'custom' ? customStory : STORIES.find(s => s.id === storyId)

  const canCheck = allFilled && !completed && !showAnswer

  return (
    <>
      <style>{`
        @keyframes sf{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}
        @keyframes sh{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
        .pk-a{animation:sf .3s ease}
        .sh-a{animation:sh .35s ease}
        @keyframes pl{0%,100%{box-shadow:0 0 0 rgba(74,124,111,0)}50%{box-shadow:0 0 16px rgba(74,124,111,.4)}}
        .hint-pulse{animation:pl 1s ease-in-out infinite}
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10 }}>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'thin' }}>
            {STORIES.map(s => (
              <button key={s.id} onClick={() => loadStory(s.id)}
                style={{
                  whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
                  border: storyId === s.id ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: storyId === s.id ? 'rgba(74,124,111,0.2)' : 'transparent',
                  color: storyId === s.id ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                }}
              >{s.title}</button>
            ))}
            {customStory && (
              <button onClick={() => loadStory('custom')}
                style={{
                  whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
                  border: storyId === 'custom' ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: storyId === 'custom' ? 'rgba(74,124,111,0.2)' : 'transparent',
                  color: storyId === 'custom' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                }}
              >📝 {customStory.title}</button>
            )}
            <button onClick={() => setShowCustomForm(true)}
              style={{ whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 10, border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.4)' }}
            >+ Custom</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Difficulty:</span>
            {['guided', 'standard', 'challenge'].map(d => (
              <button key={d} onClick={() => write({ 'moduleState.ssDifficulty': d, 'moduleState.ssPlaced': {}, 'moduleState.ssAttempts': 0, 'moduleState.ssCompleted': false })}
                style={{
                  padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, textTransform: 'capitalize',
                  border: difficulty === d ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: difficulty === d ? 'rgba(74,124,111,0.15)' : 'transparent',
                  color: difficulty === d ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                }}
              >{d === 'challenge' ? 'Challenge' : d === 'standard' ? 'Standard' : 'Guided'}</button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', marginLeft: 4 }}>
              <input type="checkbox" checked={readAloud} onChange={e => write({ 'moduleState.ssReadAloud': e.target.checked })} style={{ accentColor: '#4a7c6f' }} />
              Read aloud
            </label>
          </div>
        </div>
      )}

      {/* Custom story form */}
      {showCustomForm && (
        <div style={{ flexShrink: 0, padding: '8px 10px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          <div style={{ fontSize: 13, fontFamily: '"DM Serif Display", serif', color: 'rgba(255,255,255,0.8)' }}>Create Custom Story</div>
          <input value={customTitle} onChange={e => setCustomTitle(e.target.value)} placeholder="Story title"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, outline: 'none' }}
          />
          {customPanels.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, minWidth: 14 }}>{i + 1}.</span>
              <div style={{ position: 'relative' }}>
                <span style={{ fontSize: 20, cursor: 'pointer' }}
                  onClick={() => {
                    const current = PICKER_EMOJIS.indexOf(p.emoji)
                    const next = PICKER_EMOJIS[(current + 1) % PICKER_EMOJIS.length]
                    const cp = [...customPanels]; cp[i] = { ...cp[i], emoji: next }; setCustomPanels(cp)
                  }}
                >{p.emoji}</span>
              </div>
              <input value={p.caption} onChange={e => { const cp = [...customPanels]; cp[i] = { ...cp[i], caption: e.target.value.slice(0, 40) }; setCustomPanels(cp) }}
                placeholder="Caption (max 40 chars)" maxLength={40}
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 6px', color: '#fff', fontSize: 10, outline: 'none' }}
              />
              {customPanels.length > 3 && (
                <button onClick={() => setCustomPanels(cp => cp.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'rgba(200,80,80,0.6)', cursor: 'pointer', padding: 2, fontSize: 10 }}>✕</button>
              )}
            </div>
          ))}
          {customPanels.length < 6 && (
            <button onClick={() => setCustomPanels(cp => [...cp, { emoji: '😊', caption: '' }])}
              style={{ padding: '3px 0', borderRadius: 4, border: '1px dashed rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 10 }}
            >+ Add panel</button>
          )}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={saveCustomStory}
              style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(74,124,111,0.5)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 11 }}
            >Save & use</button>
            <button onClick={() => setShowCustomForm(false)}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11 }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* No story selected (client) */}
      {!currentStory && !isT && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Waiting for therapist to choose a story...
        </div>
      )}

      {currentStory && (
        <div ref={cRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 10, gap: 8, touchAction: 'none' }}>
          {/* Story title */}
          <div style={{ fontSize: 14, fontFamily: '"DM Serif Display", serif', color: 'rgba(255,255,255,0.8)', textAlign: 'center', flexShrink: 0 }}>
            {currentStory.title}
          </div>

          {/* Sequence slots */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {Array.from({ length: slotCount }, (_, idx) => {
              const pid = placed[String(idx)]
              const panel = pid ? panelMap.get(pid) : null
              const isHover = hoverSlot === idx
              const isWrong = wrongSlots.has(idx)
              const isCorrect = correctSlots.has(idx)
              const isPlay = playIdx === idx
              const isOccupied = !!pid
              return (
                <div key={idx} data-slot={idx}
                  onDragOver={onSlotDragOver}
                  onDragEnter={e => onSlotDragEnter(e, idx)}
                  onDragLeave={onSlotDragLeave}
                  onDrop={e => onSlotDrop(e, idx)}
                  style={{
                    flex: 1, aspectRatio: '0.85', borderRadius: 12,
                    background: isPlay ? 'rgba(74,124,111,0.2)' : isWrong ? 'rgba(200,96,42,0.15)' : isCorrect ? 'rgba(74,124,111,0.15)' : isHover ? 'rgba(74,124,111,0.1)' : 'rgba(255,255,255,0.04)',
                    border: isPlay ? '2px solid #4a7c6f' : isWrong ? '1.5px solid rgba(200,96,42,0.5)' : isCorrect ? '1.5px solid rgba(74,124,111,0.6)' : isHover ? '1.5px solid rgba(74,124,111,0.4)' : '1.5px dashed rgba(255,255,255,0.15)',
                    borderStyle: isHover ? 'solid' : isPlay ? 'solid' : isWrong ? 'solid' : isCorrect ? 'solid' : 'dashed',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    transition: 'all 0.2s', cursor: canDrop && !isOccupied ? 'pointer' : 'default',
                    transform: isPlay ? 'scale(1.08)' : isHover ? 'scale(1.03)' : 'scale(1)',
                    boxShadow: isPlay ? '0 0 16px rgba(74,124,111,0.3)' : 'none',
                    position: 'relative',
                  }}
                  onClick={() => { if (isOccupied && canDrop) removeFromSlot(idx) }}
                >
                  {panel ? (
                    <>
                      <span style={{ fontSize: 28, lineHeight: 1 }}>{panel.emoji}</span>
                      {difficulty !== 'challenge' && (
                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.2, padding: '0 2px' }}>{panel.caption}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {difficulty === 'guided' && (
                        <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.15)', fontWeight: 700 }}>{idx + 1}</span>
                      )}
                      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.15)' }}>Drop here</span>
                    </>
                  )}
                  {isWrong && <div className="sh-a" style={{ position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none' }} />}
                </div>
              )
            })}
          </div>

          {/* Shuffled panel cards */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, minHeight: 86, alignContent: 'flex-start', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.08)', flex: 1, overflowY: 'auto' }}>
            {unplacedIds.map(id => {
              const panel = panelMap.get(id)
              if (!panel) return null
              const isHint = hintPanel === id
              return (
                <div key={id}
                  draggable={canDrop && !completed}
                  onDragStart={e => onDragStart(e, id)}
                  onDragEnd={onDragEnd}
                  onTouchStart={onTouchStart(id)}
                  className={isHint ? 'hint-pulse' : ''}
                  style={{
                    width: 68, height: 80, borderRadius: 12,
                    background: 'rgba(255,255,255,0.07)', border: isHint ? '1.5px solid rgba(74,124,111,0.5)' : '1.5px solid rgba(255,255,255,0.12)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 4,
                    cursor: canDrop && !completed ? 'grab' : 'default',
                    transition: 'all 0.15s', userSelect: 'none', WebkitUserSelect: 'none',
                    boxShadow: dragItem === id ? '0 8px 20px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
                    opacity: dragItem === id ? 0.8 : 1,
                    transform: dragItem === id ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: 26, lineHeight: 1 }}>{panel.emoji}</span>
                  {difficulty !== 'challenge' && (
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {panel.caption}
                    </span>
                  )}
                </div>
              )
            })}
            {unplacedIds.length === 0 && <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 10, padding: 8 }}>All panels placed!</div>}
          </div>

          {/* Check button */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={handleCheck}
              disabled={!canCheck}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, cursor: canCheck ? 'pointer' : 'default',
                background: canCheck ? 'rgba(74,124,111,0.3)' : 'rgba(255,255,255,0.04)',
                border: canCheck ? '1px solid rgba(74,124,111,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: canCheck ? '#b8d4ce' : 'rgba(255,255,255,0.25)',
                opacity: canCheck ? 1 : 0.4,
              }}
            >Check my story ✓</button>
            {(attempts || 0) >= 3 && isT && !completed && (
              <button onClick={revealAnswer}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(200,96,42,0.3)', background: 'rgba(200,96,42,0.1)', color: 'rgba(200,120,80,0.8)', cursor: 'pointer', fontSize: 11 }}
              >Show answer</button>
            )}
          </div>

          {/* Score */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            <span>🌟 {storiesDone} stories completed</span>
            <span>🔄 Attempt {attempts || 0} on this story</span>
          </div>
        </div>
      )}

      {/* Touch ghost */}
      {ghostPos && dragId.current && panelMap.get(dragId.current) && (
        <div style={{
          position: 'fixed', left: ghostPos.x - 34, top: ghostPos.y - 60,
          width: 68, height: 80, borderRadius: 12, zIndex: 1000, pointerEvents: 'none',
          background: 'rgba(74,124,111,0.15)', border: '1.5px solid rgba(74,124,111,0.4)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          boxShadow: '0 8px 20px rgba(0,0,0,0.3)', transform: 'scale(1.1)', opacity: 0.85, padding: 4,
        }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{panelMap.get(dragId.current)!.emoji}</span>
          {difficulty !== 'challenge' && (
            <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 1.2 }}>{panelMap.get(dragId.current)!.caption}</span>
          )}
        </div>
      )}

      {/* Completion overlay */}
      {completed && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'rgba(74,124,111,0.2)', backdropFilter: 'blur(6px)', zIndex: 50, padding: 20,
        }}>
          <div style={{ fontSize: 36 }}>🌟</div>
          <div style={{ fontSize: 18, fontFamily: '"DM Serif Display", serif', color: '#fff', textAlign: 'center' }}>You got the story right!</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Attempts: {attempts || 0}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={resetStory}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 12 }}
            >Same story</button>
            {isT && (
              <button onClick={nextStory}
                style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 12 }}
              >New story</button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 10,
          padding: '8px 16px', color: '#fff', fontSize: 13, zIndex: 100, pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
