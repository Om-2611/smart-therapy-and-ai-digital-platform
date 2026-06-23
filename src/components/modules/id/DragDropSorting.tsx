'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface DragDropSortingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface BinDef { id: string; emoji: string; label: string }
interface ItemDef { id: string; emoji: string; label: string; binId: string }
interface CategorySet { id: string; name: string; bins: BinDef[]; items: ItemDef[] }

const DIFF: Record<string, { total: number }> = { easy: { total: 6 }, medium: { total: 10 }, hard: { total: 14 } }

const SETS: CategorySet[] = [
  {
    id: 'fruits-vs-veggies', name: 'Fruits vs Vegetables',
    bins: [{ id: 'fruits', emoji: '🍎', label: 'Fruits' }, { id: 'veggies', emoji: '🥦', label: 'Vegetables' }],
    items: [
      ...'🍎🍊🍋🍇🍓🍌🍑🍒🥭🍍'.split('').map((e, i) => ({ id: `f${i}`, emoji: e, label: ['Apple','Orange','Lemon','Grapes','Strawberry','Banana','Peach','Cherry','Mango','Pineapple'][i], binId: 'fruits' })),
      ...'🥦🥕🧅🥔🌽🍆🥒🧄🥬🫑'.split('').map((e, i) => ({ id: `v${i}`, emoji: e, label: ['Broccoli','Carrot','Onion','Potato','Corn','Eggplant','Cucumber','Garlic','Lettuce','Pepper'][i], binId: 'veggies' })),
    ],
  },
  {
    id: 'animals', name: 'Animals: Land·Water·Sky',
    bins: [{ id: 'land', emoji: '🦁', label: 'Land' }, { id: 'water', emoji: '🐠', label: 'Water' }, { id: 'sky', emoji: '🦅', label: 'Sky' }],
    items: [
      ...'🦁🐘🐶🐱🐸🐢🦊🐺'.split('').map((e, i) => ({ id: `l${i}`, emoji: e, label: ['Lion','Elephant','Dog','Cat','Frog','Turtle','Fox','Wolf'][i], binId: 'land' })),
      ...'🐠🐳🦈🐙🦑🐡🦭🐬'.split('').map((e, i) => ({ id: `w${i}`, emoji: e, label: ['Fish','Whale','Shark','Octopus','Squid','Pufferfish','Seal','Dolphin'][i], binId: 'water' })),
      ...'🦅🦋🐦🦜🦆🦉🐧🦚'.split('').map((e, i) => ({ id: `s${i}`, emoji: e, label: ['Eagle','Butterfly','Bird','Parrot','Duck','Owl','Penguin','Peacock'][i], binId: 'sky' })),
    ],
  },
  {
    id: 'big-vs-small', name: 'Big vs Small',
    bins: [{ id: 'big', emoji: '🐘', label: 'Big' }, { id: 'small', emoji: '🐭', label: 'Small' }],
    items: [
      ...'🐘🦒🦛🐋🦏🦬🐊🦍'.split('').map((e, i) => ({ id: `bg${i}`, emoji: e, label: ['Elephant','Giraffe','Hippo','Whale','Rhino','Buffalo','Crocodile','Gorilla'][i], binId: 'big' })),
      ...'🐭🐜🐝🐛🦎🐞🐜🐿️'.split('').map((e, i) => ({ id: `sm${i}`, emoji: e, label: ['Mouse','Ant','Bee','Caterpillar','Lizard','Ladybug','Bug','Squirrel'][i], binId: 'small' })),
    ],
  },
  {
    id: 'clean-vs-dirty', name: 'Clean vs Dirty',
    bins: [{ id: 'clean', emoji: '✨', label: 'Clean' }, { id: 'dirty', emoji: '🧹', label: 'Needs Cleaning' }],
    items: [
      ...'🛁🧼🪥🧴🚿🪒🧽✨'.split('').map((e, i) => ({ id: `cl${i}`, emoji: e, label: ['Bathtub','Soap','Toothbrush','Lotion','Shower','Razor','Sponge','Sparkle'][i], binId: 'clean' })),
      ...'🦷🧺👟🍽️🗑️🧹🪣💧'.split('').map((e, i) => ({ id: `di${i}`, emoji: e, label: ['Dirty Teeth','Laundry','Dirty Shoes','Dirty Dishes','Trash','Broom','Bucket','Dirty Water'][i], binId: 'dirty' })),
    ],
  },
  {
    id: 'happy-vs-sad', name: 'Happy vs Sad',
    bins: [{ id: 'happy', emoji: '😊', label: 'Happy Things' }, { id: 'sad', emoji: '😢', label: 'Sad Things' }],
    items: [
      ...'🎂🎁🎠🌈🎉🌸🎶🏆'.split('').map((e, i) => ({ id: `h${i}`, emoji: e, label: ['Cake','Gift','Carousel','Rainbow','Party','Flowers','Music','Trophy'][i], binId: 'happy' })),
      ...'💔🌧️😢🤒🥀⛈️😞🚫'.split('').map((e, i) => ({ id: `sd${i}`, emoji: e, label: ['Broken Heart','Rain','Sadness','Sick','Wilted Flower','Storm','Disappointed','No Entry'][i], binId: 'sad' })),
    ],
  },
  {
    id: 'day-vs-night', name: 'Day vs Night',
    bins: [{ id: 'day', emoji: '☀️', label: 'Daytime' }, { id: 'night', emoji: '🌙', label: 'Nighttime' }],
    items: [
      ...'☀️🌻🐓🏫🌤️🍳🚌🏃'.split('').map((e, i) => ({ id: `d${i}`, emoji: e, label: ['Sun','Sunflower','Rooster','School','Sunny','Eggs','School Bus','Running'][i], binId: 'day' })),
      ...'🌙⭐🦉🛌🌃🌠🦇🔦'.split('').map((e, i) => ({ id: `n${i}`, emoji: e, label: ['Moon','Stars','Owl','Bed','Night Sky','Shooting Star','Bat','Flashlight'][i], binId: 'night' })),
    ],
  },
  {
    id: 'hot-vs-cold', name: 'Hot vs Cold',
    bins: [{ id: 'hot', emoji: '🔥', label: 'Hot' }, { id: 'cold', emoji: '❄️', label: 'Cold' }],
    items: [
      ...'🔥☀️🍵🌋🏜️🌡️♨️🫖'.split('').map((e, i) => ({ id: `ho${i}`, emoji: e, label: ['Fire','Sun','Tea','Volcano','Desert','Thermometer','Steam','Teapot'][i], binId: 'hot' })),
      ...'❄️🌨️🧊🏔️🥶🍦⛄🌬️'.split('').map((e, i) => ({ id: `co${i}`, emoji: e, label: ['Snowflake','Snow','Ice','Mountain','Cold','Ice Cream','Snowman','Wind'][i], binId: 'cold' })),
    ],
  },
  {
    id: 'school-vs-home', name: 'School vs Home',
    bins: [{ id: 'school', emoji: '🏫', label: 'School' }, { id: 'home', emoji: '🏠', label: 'Home' }],
    items: [
      ...'📚✏️📐🎒🖊️📏🔬🗂️'.split('').map((e, i) => ({ id: `sc${i}`, emoji: e, label: ['Books','Pencil','Ruler','Backpack','Pen','Triangle','Microscope','Folder'][i], binId: 'school' })),
      ...'🛋️🍳🛁🛏️📺🪴🧹🔑'.split('').map((e, i) => ({ id: `hm${i}`, emoji: e, label: ['Couch','Cooking','Bathtub','Bed','TV','Plant','Broom','Keys'][i], binId: 'home' })),
    ],
  },
  {
    id: 'numbers-vs-letters', name: 'Numbers vs Letters',
    bins: [{ id: 'numbers', emoji: '🔢', label: 'Numbers' }, { id: 'letters', emoji: '🔤', label: 'Letters' }],
    items: [
      ...'1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣'.split('').map((e, i) => ({ id: `n${i}`, emoji: e, label: ['One','Two','Three','Four','Five','Six','Seven','Eight'][i], binId: 'numbers' })),
      ...'🅰️🅱️©️🆒🆓🆔🅾️🆘'.split('').map((e, i) => ({ id: `lt${i}`, emoji: e, label: ['A','B','C','D','E','F','O','SOS'][i], binId: 'letters' })),
    ],
  },
  {
    id: 'healthy-vs-unhealthy', name: 'Healthy vs Unhealthy',
    bins: [{ id: 'healthy', emoji: '💚', label: 'Healthy' }, { id: 'unhealthy', emoji: '🚫', label: 'Unhealthy' }],
    items: [
      ...'🥦🍎🥕🥗🫐🥑🥚🐟'.split('').map((e, i) => ({ id: `he${i}`, emoji: e, label: ['Broccoli','Apple','Carrot','Salad','Blueberries','Avocado','Egg','Fish'][i], binId: 'healthy' })),
      ...'🍔🍟🍕🧁🍭🥤🍿🍩'.split('').map((e, i) => ({ id: `un${i}`, emoji: e, label: ['Burger','Fries','Pizza','Cupcake','Candy','Soda','Popcorn','Donut'][i], binId: 'unhealthy' })),
    ],
  },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

export default function DragDropSorting({ sessionId, role, isLocked }: DragDropSortingProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [setId, setSetId] = useState('fruits-vs-veggies')
  const [difficulty, setDifficulty] = useState('medium')
  const [displayMode, setDisplayMode] = useState<'emoji+label' | 'emoji'>('emoji+label')
  const [itemOrder, setItemOrder] = useState<string[]>([])
  const [sorted, setSorted] = useState<Record<string, string>>({})
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [completed, setCompleted] = useState(false)

  const [dragItem, setDragItem] = useState<string | null>(null)
  const [hoverBin, setHoverBin] = useState<string | null>(null)
  const [animBounce, setAnimBounce] = useState<Set<string>>(new Set())
  const [animShake, setAnimShake] = useState<Set<string>>(new Set())
  const [flashWrong, setFlashWrong] = useState<Set<string>>(new Set())
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [checkItems, setCheckItems] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  const cRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const dragId = useRef<string | null>(null)
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const ctr = useRef(0)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.ddSet === 'string') setSetId(s.ddSet)
      if (typeof s.ddDifficulty === 'string') setDifficulty(s.ddDifficulty)
      if (s.ddDisplayMode === 'emoji' || s.ddDisplayMode === 'emoji+label') setDisplayMode(s.ddDisplayMode)
      if (Array.isArray(s.ddItemOrder)) setItemOrder(s.ddItemOrder)
      if (typeof s.ddSorted === 'object' && s.ddSorted !== null) setSorted(s.ddSorted as Record<string, string>)
      if (typeof s.ddCorrect === 'number') setCorrect(s.ddCorrect)
      if (typeof s.ddWrong === 'number') setWrong(s.ddWrong)
      if (typeof s.ddCompleted === 'boolean') setCompleted(s.ddCompleted)
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => () => { if (toastT.current) clearTimeout(toastT.current) }, [])

  const showToast = useCallback((msg: string) => {
    setToast({ msg })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 2000)
  }, [])

  const currentSet = SETS.find(s => s.id === setId) || SETS[0]

  const usedBins = useMemo(() => {
    if (difficulty === 'easy') return currentSet.bins.slice(0, 2)
    return currentSet.bins
  }, [currentSet, difficulty])

  const poolItems = useMemo(() => {
    const total = DIFF[difficulty]?.total || 10
    const perBin = Math.ceil(total / usedBins.length)
    const items: ItemDef[] = []
    for (const bin of usedBins) {
      const bi = currentSet.items.filter(i => i.binId === bin.id).slice(0, perBin)
      items.push(...bi)
    }
    return items.slice(0, total)
  }, [currentSet, usedBins, difficulty])

  const itemMap = useMemo(() => {
    const m = new Map<string, ItemDef>()
    for (const item of poolItems) m.set(item.id, item)
    return m
  }, [poolItems])

  const sortedCount = Object.keys(sorted).length
  const totalItems = itemOrder.length
  const remaining = totalItems - sortedCount
  const pct = totalItems > 0 ? Math.round((sortedCount / totalItems) * 100) : 0
  const allDone = completed || (totalItems > 0 && sortedCount >= totalItems)

  const resolvedItems = useMemo(() => {
    const fromStore = itemOrder.filter(id => itemMap.has(id))
    if (fromStore.length > 0) return fromStore
    return shuffle(Array.from(itemMap.keys()))
  }, [itemOrder, itemMap])

  const unsortedItems = resolvedItems.filter(id => !sorted[id])
  const sortedEntries = Object.entries(sorted).filter(([id]) => itemMap.has(id))

  const handleDrop = useCallback((itemId: string, binId: string) => {
    if (!canInteract) return
    const item = itemMap.get(itemId)
    if (!item || sorted[itemId]) return
    const correctBin = item.binId === binId
    if (correctBin) {
      setAnimBounce(prev => new Set(prev).add(itemId))
      setCheckItems(prev => new Set(prev).add(itemId))
      const n = ++ctr.current
      setTimeout(() => { setAnimBounce(prev => { const s = new Set(prev); s.delete(itemId); return s }); setCheckItems(prev => { const s = new Set(prev); s.delete(itemId); return s }) }, 450)
      write({ [`moduleState.ddSorted.${itemId}`]: binId, 'moduleState.ddCorrect': correct + 1 })
      if (sortedCount + 1 >= totalItems) {
        setTimeout(() => write({ 'moduleState.ddCompleted': true }), 300)
      }
      if ('speechSynthesis' in window) {
        const voices = speechSynthesis.getVoices()
        const u = new SpeechSynthesisUtterance(item.label)
        u.rate = 0.9; u.pitch = 1.1
        speechSynthesis.speak(u)
      }
    } else {
      setAnimShake(prev => new Set(prev).add(itemId))
      setFlashWrong(prev => new Set(prev).add(binId))
      setTimeout(() => {
        setAnimShake(prev => { const s = new Set(prev); s.delete(itemId); return s })
        setFlashWrong(prev => { const s = new Set(prev); s.delete(binId); return s })
      }, 400)
      write({ 'moduleState.ddWrong': wrong + 1 })
    }
  }, [canInteract, itemMap, sorted, write, correct, wrong, sortedCount, totalItems])

  const loggedDoneRef = useRef(false)
  useEffect(() => {
    if (allDone && completed) {
      if (isT && !loggedDoneRef.current) {
        loggedDoneRef.current = true
        logModuleEvent(sessionId, {
          module: 'drag-drop-sorting',
          type: 'completed',
          detail: `Completed the "${currentSet.name}" sorting activity (${correct} correct, ${wrong} wrong attempt${wrong === 1 ? '' : 's'})`,
        })
      }
      const wc = wrong
      const star = wc === 0 ? '⭐⭐⭐ Perfect!' : wc <= 3 ? '⭐⭐ Great job!' : '⭐ Keep practising!'
      showToast(`All sorted! ${star}`)
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(wc === 0 ? 'Wonderful! You sorted everything perfectly!' : 'Great sorting!')
        u.rate = 0.85
        speechSynthesis.speak(u)
      }
    }
    if (!allDone) loggedDoneRef.current = false
  }, [allDone, completed, wrong, correct, showToast, isT, sessionId, currentSet.name])

  const handleReset = useCallback(() => {
    write({ 'moduleState.ddSorted': {}, 'moduleState.ddCorrect': 0, 'moduleState.ddWrong': 0, 'moduleState.ddCompleted': false })
    const fresh = shuffle(Array.from(itemMap.keys()))
    write({ 'moduleState.ddItemOrder': fresh })
  }, [write, itemMap])

  const handleShuffle = useCallback(() => {
    const fresh = shuffle(resolvedItems.filter(id => !sorted[id]).concat(sortedEntries.map(([id]) => id)))
    write({ 'moduleState.ddItemOrder': fresh })
  }, [write, resolvedItems, sorted, sortedEntries])

  const handleNewSet = useCallback(() => {
    write({ 'moduleState.ddSorted': {}, 'moduleState.ddCorrect': 0, 'moduleState.ddWrong': 0, 'moduleState.ddCompleted': false })
  }, [write])

  const handleSetChange = useCallback((newSetId: string) => {
    const s = SETS.find(x => x.id === newSetId) || SETS[0]
    const total = DIFF[difficulty]?.total || 10
    const perBin = Math.ceil(total / (difficulty === 'easy' ? Math.min(2, s.bins.length) : s.bins.length))
    const items: ItemDef[] = []
    const bins = difficulty === 'easy' ? s.bins.slice(0, 2) : s.bins
    for (const bin of bins) {
      const bi = s.items.filter(i => i.binId === bin.id).slice(0, perBin)
      items.push(...bi)
    }
    const finalItems = items.slice(0, total)
    const order = shuffle(finalItems.map(i => i.id))
    write({ 'moduleState.ddSet': newSetId, 'moduleState.ddSorted': {}, 'moduleState.ddCorrect': 0, 'moduleState.ddWrong': 0, 'moduleState.ddCompleted': false, 'moduleState.ddItemOrder': order })
  }, [difficulty, write])

  const handleDifficultyChange = useCallback((d: string) => {
    write({ 'moduleState.ddDifficulty': d, 'moduleState.ddSorted': {}, 'moduleState.ddCorrect': 0, 'moduleState.ddWrong': 0, 'moduleState.ddCompleted': false })
  }, [write])

  // --- HTML5 Drag Handlers ---
  const onDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    if (!canInteract) return
    isDragging.current = true
    dragId.current = itemId
    e.dataTransfer.setData('text/plain', itemId)
    e.dataTransfer.effectAllowed = 'move'
  }, [canInteract])

  const onDragEnd = useCallback(() => {
    isDragging.current = false
    dragId.current = null
    setHoverBin(null)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDragEnter = useCallback((e: React.DragEvent, binId: string) => {
    e.preventDefault()
    setHoverBin(binId)
  }, [])

  const onDragLeave = useCallback(() => {
    setHoverBin(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent, binId: string) => {
    e.preventDefault()
    const itemId = e.dataTransfer.getData('text/plain') || dragId.current
    setHoverBin(null)
    if (itemId) handleDrop(itemId, binId)
  }, [handleDrop])

  // --- Touch Drag Handlers ---
  useEffect(() => {
    const el = cRef.current
    if (!el) return
    const onTM = (e: TouchEvent) => {
      if (!isDragging.current || !dragId.current) return
      e.preventDefault()
      const touch = e.touches[0]
      setGhostPos({ x: touch.clientX, y: touch.clientY })
      const el2 = document.elementFromPoint(touch.clientX, touch.clientY)
      const binEl = el2?.closest('[data-bin]')
      setHoverBin(binEl ? binEl.getAttribute('data-bin')! : null)
    }
    const onTE = (e: TouchEvent) => {
      if (!isDragging.current || !dragId.current) return
      const touch = e.changedTouches[0]
      const el2 = document.elementFromPoint(touch.clientX, touch.clientY)
      const binEl = el2?.closest('[data-bin]')
      if (binEl) {
        const binId = binEl.getAttribute('data-bin')!
        handleDrop(dragId.current, binId)
      }
      isDragging.current = false
      dragId.current = null
      setGhostPos(null)
      setHoverBin(null)
    }
    el.addEventListener('touchmove', onTM, { passive: false })
    el.addEventListener('touchend', onTE)
    el.addEventListener('touchcancel', onTE)
    return () => { el.removeEventListener('touchmove', onTM); el.removeEventListener('touchend', onTE); el.removeEventListener('touchcancel', onTE) }
  }, [handleDrop])

  const onTouchStart = useCallback((itemId: string) => (e: React.TouchEvent) => {
    if (!canInteract) return
    e.preventDefault()
    isDragging.current = true
    dragId.current = itemId
    const touch = e.touches[0]
    setGhostPos({ x: touch.clientX, y: touch.clientY })
  }, [canInteract])

  const starText = wrong === 0 ? '⭐⭐⭐ Perfect!' : wrong <= 3 ? '⭐⭐ Great job!' : '⭐ Keep practising!'

  const gridCols = usedBins.length === 2 ? '1fr 1fr' : usedBins.length === 3 ? '1fr 1fr 1fr' : '1fr 1fr'

  return (
    <>
      <style>{`
        @keyframes bi {0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15)}80%{transform:scale(.95)}100%{transform:scale(1);opacity:1}}
        @keyframes ws {0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
        @keyframes fb {0%{transform:scale(.8);opacity:.6}100%{transform:scale(1);opacity:1}}
        @keyframes cf {0%{opacity:0}100%{opacity:1}}
        .bi-a {animation:bi .4s ease forwards}
        .ws-a {animation:ws .35s ease}
        .fb-a {animation:fb .3s ease}
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10 }}>
          {/* Set selector */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'thin' }}>
            {SETS.map(s => (
              <button key={s.id} onClick={() => handleSetChange(s.id)}
                style={{
                  whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
                  border: setId === s.id ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: setId === s.id ? 'rgba(74,124,111,0.2)' : 'transparent',
                  color: setId === s.id ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                }}
              >{s.name}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Difficulty:</span>
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => handleDifficultyChange(d)}
                style={{
                  padding: '2px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, textTransform: 'capitalize',
                  border: difficulty === d ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: difficulty === d ? 'rgba(74,124,111,0.15)' : 'transparent',
                  color: difficulty === d ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                }}
              >{d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard'}</button>
            ))}
            <span style={{ marginLeft: 4, color: 'rgba(255,255,255,0.4)' }}>Show:</span>
            <button onClick={() => write({ 'moduleState.ddDisplayMode': displayMode === 'emoji+label' ? 'emoji' : 'emoji+label' })}
              style={{ padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)' }}
            >{displayMode === 'emoji+label' ? 'Emoji+Label' : 'Emoji'}</button>
            <button onClick={handleShuffle} style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)' }}>🔀 Shuffle</button>
            <button onClick={handleReset} style={{ padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, border: '1px solid rgba(200,60,60,0.3)', background: 'transparent', color: 'rgba(200,80,80,0.7)' }}>↺ Reset</button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={cRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column', padding: 10, gap: 8, touchAction: 'none' }}>

        {/* Item pool */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10,
          minHeight: 80, border: '1px dashed rgba(255,255,255,0.08)',
          display: 'flex', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start',
        }}>
          {unsortedItems.map(id => {
            const item = itemMap.get(id)
            if (!item) return null
            const isShaking = animShake.has(id)
            const isBouncing = animBounce.has(id)
            if (isBouncing) return null
            return (
              <div key={id} data-item-id={id}
                draggable={canInteract}
                onDragStart={e => onDragStart(e, id)}
                onDragEnd={onDragEnd}
                onTouchStart={onTouchStart(id)}
                className={isShaking ? 'ws-a fb-a' : ''}
                style={{
                  width: 60, height: 60, borderRadius: 12,
                  background: dragItem === id ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.08)',
                  border: `1.5px solid ${dragItem === id ? 'rgba(74,124,111,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  cursor: canInteract ? 'grab' : 'default',
                  transition: 'all 0.15s',
                  boxShadow: dragItem === id ? '0 8px 20px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.2)',
                  opacity: dragItem === id ? 0.85 : 1,
                  transform: dragItem === id ? 'scale(1.12)' : 'scale(1)',
                  userSelect: 'none', WebkitUserSelect: 'none',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{item.emoji}</span>
                {displayMode === 'emoji+label' && (
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.2 }}>{item.label}</span>
                )}
              </div>
            )
          })}
          {unsortedItems.length === 0 && !allDone && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>
              {totalItems > 0 ? 'All items sorted!' : 'Loading items...'}
            </div>
          )}
        </div>

        {/* Bins */}
        <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0 }}>
          {usedBins.map(bin => {
            const isHover = hoverBin === bin.id
            const isFlash = flashWrong.has(bin.id)
            const binItems = sortedEntries.filter(([, b]) => b === bin.id)
            return (
              <div key={bin.id} data-bin={bin.id}
                onDragOver={onDragOver}
                onDragEnter={e => onDragEnter(e, bin.id)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, bin.id)}
                style={{
                  flex: 1, borderRadius: 12, minHeight: 80, padding: 6,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.2s', overflowY: 'auto',
                  background: isFlash ? 'rgba(200,96,42,0.2)' : isHover ? 'rgba(74,124,111,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isFlash ? '1.5px solid rgba(200,96,42,0.5)' : isHover ? '1.5px solid rgba(74,124,111,0.5)' : '1.5px dashed rgba(255,255,255,0.12)',
                  borderStyle: isHover ? 'solid' : 'dashed',
                  transform: isHover ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize: 22 }}>{bin.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{bin.label}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                  {binItems.map(([itemId]) => {
                    const item = itemMap.get(itemId)
                    if (!item) return null
                    return (
                      <div key={itemId} className="bi-a"
                        style={{
                          width: 44, height: 44, borderRadius: 8,
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                          animation: 'bi 0.4s ease',
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{item.emoji}</span>
                        <span style={{ position: 'absolute', top: -2, right: -2, fontSize: 8, opacity: 0.7 }}>✓</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Score bar */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>
            <span>✓ {correct} sorted correctly</span>
            <span>{remaining} left</span>
          </div>
          <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#4a7c6f', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      </div>

      {/* Touch ghost */}
      {ghostPos && dragId.current && itemMap.get(dragId.current) && (
        <div style={{
          position: 'fixed', left: ghostPos.x - 30, top: ghostPos.y - 60,
          width: 60, height: 60, borderRadius: 12, zIndex: 1000, pointerEvents: 'none',
          background: 'rgba(74,124,111,0.15)', border: '1.5px solid rgba(74,124,111,0.4)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          boxShadow: '0 8px 20px rgba(0,0,0,0.3)', transform: 'scale(1.12)',
          opacity: 0.85,
        }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{itemMap.get(dragId.current)!.emoji}</span>
          {displayMode === 'emoji+label' && (
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.2 }}>{itemMap.get(dragId.current)!.label}</span>
          )}
        </div>
      )}

      {/* Completion overlay */}
      {allDone && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'rgba(74,124,111,0.2)', backdropFilter: 'blur(6px)', zIndex: 50, padding: 20,
        }}>
          <div style={{ fontSize: 36, animation: 'cf 0.5s ease' }}>🎉</div>
          <div style={{ fontSize: 18, fontFamily: '"DM Serif Display", serif', color: '#fff', textAlign: 'center' }}>All sorted! 🎉</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 1.6 }}>
            Correct: {correct} | Wrong attempts: {wrong}
            <br />{starText}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReset}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 12 }}
            >Same set again</button>
            <button onClick={handleNewSet}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 12 }}
            >New set</button>
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
