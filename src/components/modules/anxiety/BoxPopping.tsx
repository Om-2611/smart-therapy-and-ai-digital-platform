'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { Clock, Target, Sparkles, Volume2, Send, Rocket, RotateCcw, Lightbulb } from 'lucide-react'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface BoxPoppingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

/* ---------------------------------------------------------------------------
   Art assets. The delivered folder name contains spaces, so every path segment
   is encoded individually and the file is painted as a CSS background —
   next/image cannot take these paths. Same helper shape as WorryVault and
   GroundingGame.
--------------------------------------------------------------------------- */
const BP_BG = (file: string) => `/assets/modules/Background/${encodeURIComponent(file)}`

/* Pastel dawn sky the balloon mockup floats its worries in. */
const BP_SCENE = BP_BG('worry balloon popping.png')

const GRID_MAP: Record<string, { cols: number; rows: number; total: number }> = {
  small: { cols: 6, rows: 8, total: 48 },
  medium: { cols: 8, rows: 10, total: 80 },
  large: { cols: 10, rows: 12, total: 120 },
}

/* Pastel balloon skins — light enough to carry DARK worry text, which is what
   the mockup shows. Consumed by balloonLayout as `b.color`. */
const WORRY_COLORS = ['#F9A8D4', '#FDE68A', '#C4B5FD', '#5EEAD4', '#FCA5A5', '#BFDBFE']
const CONFETTI_COLORS = ['#EC4899', '#F97316', '#FACC15', '#4ADE80', '#3B82F6', '#A855F7', '#2DD4BF', '#F43F5E']
const MOOD_EMOJIS = ['😌', '😊', '😐', '😢', '😰']
const MODE_LABELS: Record<string, string> = { wrap: 'Bubble Wrap', balloon: 'Worry Balloons' }

/* Candy palette for the game objects — base + a deeper stop so each bubble can
   be shaded into a glossy 3D sphere rather than a flat tile. */
const CANDY: { base: string; deep: string }[] = [
  { base: '#F43F8E', deep: '#BE1D63' }, // pink
  { base: '#F97316', deep: '#C2410C' }, // orange
  { base: '#FACC15', deep: '#CA8A04' }, // yellow
  { base: '#4ADE80', deep: '#16A34A' }, // green
  { base: '#3B82F6', deep: '#1D4ED8' }, // blue
  { base: '#A855F7', deep: '#7E22CE' }, // violet
  { base: '#2DD4BF', deep: '#0D9488' }, // teal
]

/* Palette — the stage canvas is WHITE, so every label here is dark ink on a
   pale surface. White text appears ONLY on the solid green pill and the dark
   toast. (This file used to print rgba(255,255,255,0.4) copy, which was
   invisible on that canvas.) */
const GREEN = '#1F7A44'
const VIOLET = '#7C3AED'
const PINK = '#DB2777'
const INK = '#151b26'
const INK_BODY = '#333c4a'
const MUTED = '#6b7280'
const BORDER = '#e7eaef'
const CARD_SHADOW = '0 1px 2px rgba(20,30,45,0.04), 0 6px 16px rgba(20,30,45,0.06)'

const DIFFICULTY: { key: string; label: string }[] = [
  { key: 'small', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Hard' },
]

const MODE_META: Record<'wrap' | 'balloon', { title: string; subtitle: string; goal: string }> = {
  wrap: {
    title: 'Bubble Wrap Popping',
    subtitle: 'Pop the bubbles to release tension and clear your mind.',
    goal: 'Pop the bubbles to release tension',
  },
  balloon: {
    title: 'Worry Balloon Popping',
    subtitle: 'Pop worries. Feel lighter. You’ve got this!',
    goal: 'Let go of what you can’t control and breathe',
  },
}

const FOCUS_LINES = ['Anxiety & Depression', 'Tension release', 'Cognitive defusion']

/* Static confetti specks left behind in a popped cell — [left%, top%, candy idx]. */
const SPENT_DOTS: [number, number, number][] = [
  [17, 24, 0], [73, 17, 2], [50, 7, 5], [21, 71, 3], [79, 68, 4], [47, 87, 1], [88, 41, 6],
]

/**
 * Burst colour for the pop particles. Presentation only — popCell's burst
 * handling is untouched, this just swaps the old muted teal/navy/plum for the
 * candy palette the mockup uses.
 */
function rowColor(row: number, a: number): string {
  const s = [[236, 72, 153], [250, 204, 21], [59, 130, 246]]
  const [r, g, b] = s[row % 3]
  return `rgba(${r},${g},${b},${Math.min(1, a + 0.5)})`
}

/**
 * Position the balloons and report how tall the canvas must be to show them all.
 *
 * The canvas is `position: relative` and every balloon is absolutely positioned,
 * so the canvas contributes NO content height. It relied on `flex: 1`, which does
 * nothing because the real parent (GlassModulePanel's .gm-canvas) is a block box,
 * not a flex column. The canvas therefore collapsed to 0px and `overflow: hidden`
 * clipped every balloon — the launch worked, the balloons existed, and nothing was
 * ever visible. Returning `height` lets the canvas claim the space it needs; the
 * board now scales the layer down when that height exceeds the board.
 */
function balloonLayout(worries: string[], w: number, h: number) {
  if (worries.length === 0) return { items: [], height: 0 }
  const width = Math.max(240, w)
  const n = worries.length
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(n * 1.4))))
  const gap = Math.max(84, Math.floor(width / (cols + 1)))
  const rowH = 118
  const items = worries.map((worry, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      id: `b${i}`,
      worry,
      x: Math.max(4, Math.min(width - 84, gap * (col + 1) - 40 + (row % 2) * 12)),
      y: 14 + row * rowH + (i % 3) * 6,
      color: WORRY_COLORS[i % WORRY_COLORS.length],
      size: 70 + (i % 4) * 4,
      dur: 3.5 + (i % 5) * 0.3,
      del: (i % 6) * 0.5,
    }
  })
  const rows = Math.ceil(n / cols)
  // Tallest balloon + its string, plus the row offsets.
  const height = Math.max(h, 14 + rows * rowH + 40)
  return { items, height }
}

/* --------------------------------------------------------------------------
   Presentational bits
-------------------------------------------------------------------------- */

/** Wall-clock time on this activity. Owns its own tick so the board doesn't
    re-render every second along with it. */
function ElapsedClock() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return <>{mm}:{ss}</>
}

/** Glossy bubble cluster that labels the "Bubble Popping" mode. */
function BubbleClusterArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <radialGradient id="bpArtBlue" cx="34%" cy="28%" r="74%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="17%" stopColor="#bfdbfe" /><stop offset="100%" stopColor="#2563EB" />
        </radialGradient>
        <radialGradient id="bpArtPink" cx="34%" cy="28%" r="74%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="17%" stopColor="#fbcfe8" /><stop offset="100%" stopColor="#DB2777" />
        </radialGradient>
        <radialGradient id="bpArtYellow" cx="34%" cy="28%" r="74%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="17%" stopColor="#fef3c7" /><stop offset="100%" stopColor="#EAB308" />
        </radialGradient>
        <radialGradient id="bpArtGreen" cx="34%" cy="28%" r="74%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="17%" stopColor="#bbf7d0" /><stop offset="100%" stopColor="#22C55E" />
        </radialGradient>
      </defs>
      <circle cx="23" cy="33" r="17" fill="url(#bpArtBlue)" />
      <circle cx="44" cy="17" r="10" fill="url(#bpArtPink)" />
      <circle cx="48" cy="37" r="8" fill="url(#bpArtYellow)" />
      <circle cx="33" cy="52" r="9" fill="url(#bpArtGreen)" />
      <ellipse cx="17" cy="25" rx="5" ry="3.3" fill="#ffffff" opacity="0.9" transform="rotate(-26 17 25)" />
    </svg>
  )
}

/** Pink balloon that labels the "Balloon Popping" mode. */
function BalloonArt({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <radialGradient id="bpArtBalloon" cx="33%" cy="25%" r="76%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="16%" stopColor="#fbcfe8" /><stop offset="100%" stopColor="#DB2777" />
        </radialGradient>
      </defs>
      <path d="M32 5c10.5 0 17.5 8.2 17.5 18.5C49.5 34 40.5 42 32 44.5 23.5 42 14.5 34 14.5 23.5 14.5 13.2 21.5 5 32 5Z" fill="url(#bpArtBalloon)" />
      <path d="M32 44.5l-3.2 4.3h6.4Z" fill="#BE185D" />
      <path d="M32 48.8c4 3.6-4 6.4 0 10.2" stroke="#C4849F" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <ellipse cx="24" cy="17" rx="4.6" ry="3" fill="#ffffff" opacity="0.9" transform="rotate(-28 24 17)" />
    </svg>
  )
}

/** White info card for the narrow left column. */
function InfoCard({ icon, tint, title, children }: { icon: ReactNode; tint: string; title?: string; children: ReactNode }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        gap: 8,
        padding: '9px 10px',
        borderRadius: 14,
        border: `1px solid ${BORDER}`,
        background: '#ffffff',
        boxShadow: CARD_SHADOW,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26, height: 26, flexShrink: 0, borderRadius: 9, background: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <div style={{ fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.2, marginBottom: 2 }}>{title}</div>}
        {children}
      </div>
    </div>
  )
}

export default function BoxPopping({ sessionId, role, isLocked }: BoxPoppingProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [mode, setMode] = useState<'wrap' | 'balloon'>('wrap')
  const [gridSize, setGridSize] = useState('medium')
  const [intensity, setIntensity] = useState('normal')
  const [worries, setWorries] = useState<string[]>([])
  const [launched, setLaunched] = useState(false)
  const [canvasW, setCanvasW] = useState(0)
  const [canvasH, setCanvasH] = useState(0)
  const [popped, setPopped] = useState<string[]>([])
  const [endMood, setEndMood] = useState('')

  const [inputVal, setInputVal] = useState('')
  const [animating, setAnimating] = useState<Set<string>>(new Set())
  const [particles, setParticles] = useState<{ id: string; x: number; y: number; col: string; dx: string; dy: string }[]>([])
  const [confettis, setConfettis] = useState<{ id: string; x: number; y: number; col: string; dx: number; dy: number }[]>([])
  const [floaters, setFloaters] = useState<{ id: string; x: number; y: number; text: string }[]>([])
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  const cRef = useRef<HTMLDivElement>(null)
  const isDrag = useRef(false)
  const gPopped = useRef<Set<string>>(new Set())
  const seenMiles = useRef<Set<string>>(new Set())
  const prevPct = useRef(0)
  const init = useRef(false)
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const pk = useRef(0)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() })
    } catch (err) {
      console.warn('[BoxPopping] Firestore write failed', err)
    }
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (s.bpMode === 'wrap' || s.bpMode === 'balloon') setMode(s.bpMode)
      if (typeof s.bpGridSize === 'string') setGridSize(s.bpGridSize)
      if (typeof s.bpIntensity === 'string') setIntensity(s.bpIntensity)
      if (Array.isArray(s.bpWorries)) setWorries(s.bpWorries)
      if (typeof s.bpLaunched === 'boolean') setLaunched(s.bpLaunched)
      if (Array.isArray(s.bpPopped)) setPopped(s.bpPopped)
      if (typeof s.bpEndMood === 'string') setEndMood(s.bpEndMood)
    })
    return () => unsub()
  }, [sessionId])

  // This observer previously destructured width/height and threw them away, so
  // the layout never reflowed and never knew the real canvas width. Height is
  // now kept too — the bubble grid is sized to fit the board in BOTH axes so it
  // can never overflow a container that doesn't scroll.
  useEffect(() => {
    const el = cRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setCanvasW((prev) => (Math.abs(prev - width) < 2 ? prev : width))
      setCanvasH((prev) => (Math.abs(prev - height) < 2 ? prev : height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => { isDrag.current = false; if (toastT.current) clearTimeout(toastT.current) }, [])

  const effectivePopped = useMemo(() => {
    if (mode === 'wrap') return popped.filter(id => /^r\d+-c\d+$/.test(id))
    return popped.filter(id => /^b\d+$/.test(id))
  }, [popped, mode])

  const poppedSet = useMemo(() => new Set(effectivePopped), [effectivePopped])
  const total = mode === 'wrap' ? (GRID_MAP[gridSize] || GRID_MAP.medium).total : worries.length
  const cnt = effectivePopped.length
  const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
  const allDone = total > 0 && cnt >= total

  useEffect(() => {
    if (total === 0) return
    if (!init.current) {
      init.current = true
      prevPct.current = pct
      for (const m of [25, 50, 75, 100]) { if (pct >= m) seenMiles.current.add(`${m}`) }
      return
    }
    for (const m of [25, 50, 75, 100]) {
      if (pct >= m && !seenMiles.current.has(`${m}`) && cnt > 0) {
        seenMiles.current.add(`${m}`)
        if (m < 100) {
          const txt = { 25: 'Keep going! 💪', 50: 'Halfway there! ⭐', 75: 'Almost done! 🔥' }[m] || ''
          setToast({ msg: txt })
          if (toastT.current) clearTimeout(toastT.current)
          toastT.current = setTimeout(() => setToast(null), 2000)
        }
        break
      }
    }
    prevPct.current = pct
  }, [pct, total, cnt])


  const popCell = useCallback((id: string) => {
    if (!canInteract || gPopped.current.has(id) || poppedSet.has(id)) return
    gPopped.current.add(id)
    setAnimating(prev => new Set(prev).add(id))
    const row = parseInt(id.split('-')[0].slice(1), 10)
    const el = cRef.current?.querySelector(`[data-cell="${id}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      const cr = cRef.current!.getBoundingClientRect()
      const cx = r.left - cr.left + r.width / 2
      const cy = r.top - cr.top + r.height / 2
      const color = rowColor(row, 0.4)
      const k = ++pk.current
      const p = [
        { id: `p${k}0`, x: cx, y: cy, col: color, dx: '0', dy: '-20px' },
        { id: `p${k}1`, x: cx, y: cy, col: color, dx: '0', dy: '20px' },
        { id: `p${k}2`, x: cx, y: cy, col: color, dx: '-20px', dy: '0' },
        { id: `p${k}3`, x: cx, y: cy, col: color, dx: '20px', dy: '0' },
      ]
      setParticles(prev => [...prev, ...p])
      setTimeout(() => setParticles(prev => prev.filter(q => !p.find(r => r.id === q.id))), 450)
    }
    setTimeout(() => setAnimating(prev => { const n = new Set(prev); n.delete(id); return n }), 350)
    write({ 'moduleState.bpPopped': arrayUnion(id) })
  }, [canInteract, poppedSet, write])

  const popBalloon = useCallback((id: string, worry: string, x: number, y: number) => {
    if (!canInteract || poppedSet.has(id)) return
    setAnimating(prev => new Set(prev).add(id))

    const k = ++pk.current
    const dots = Array.from({ length: 8 }, (_, i) => ({
      id: `c${k}${i}`, x: x + 35, y: y + 35, col: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dx: (Math.random() - 0.5) * 100, dy: (Math.random() - 0.5) * 100,
    }))
    setConfettis(prev => [...prev, ...dots])
    setTimeout(() => setConfettis(prev => prev.filter(q => !dots.find(r => r.id === q.id))), 650)

    const ft = { id: `ft${k}`, x, y: y - 10, text: `Bye bye, ${worry}! 👋` }
    setFloaters(prev => [...prev, ft])
    setTimeout(() => setFloaters(prev => prev.filter(f => f.id !== ft.id)), 1600)

    // Must outlast the 1.6s release animation, or the balloon is unmounted
    // mid-flight and appears to vanish instead of floating away.
    setTimeout(() => setAnimating(prev => { const n = new Set(prev); n.delete(id); return n }), 1650)
    write({ 'moduleState.bpPopped': arrayUnion(id) })
  }, [canInteract, poppedSet, write])

  const pd = useCallback((e: React.PointerEvent) => {
    if (!canInteract || mode !== 'wrap') return
    isDrag.current = true
    gPopped.current = new Set()
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cell = el?.closest('[data-cell]')
    if (cell) { const id = cell.getAttribute('data-cell')!; popCell(id) }
    try { cRef.current?.setPointerCapture(e.pointerId) } catch {}
  }, [canInteract, mode, popCell])

  const pm = useCallback((e: React.PointerEvent) => {
    if (!isDrag.current || mode !== 'wrap') return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const cell = el?.closest('[data-cell]')
    if (cell) { const id = cell.getAttribute('data-cell')!; popCell(id) }
  }, [mode, popCell])

  const pu = useCallback(() => { isDrag.current = false; gPopped.current = new Set() }, [])

  const resetAll = useCallback(() => {
    if (!isT) return
    seenMiles.current = new Set()
    prevPct.current = 0
    write({ 'moduleState.bpPopped': [], 'moduleState.bpEndMood': '' })
  }, [isT, write])

  // Log activity completion once (therapist browser only) — popping each bubble
  // individually would flood the report, so we record the milestone instead.
  const loggedDoneRef = useRef(false)
  useEffect(() => {
    if (!isT) return
    if (allDone && !loggedDoneRef.current) {
      loggedDoneRef.current = true
      logModuleEvent(sessionId, {
        module: 'virtual-box-popping',
        type: 'completed',
        detail: mode === 'wrap'
          ? `Completed the bubble-wrap popping exercise (${total} bubbles)`
          : `Released all ${total} worry balloon${total === 1 ? '' : 's'}`,
      })
    }
    if (!allDone) loggedDoneRef.current = false
  }, [allDone, isT, sessionId, mode, total])

  const gc = GRID_MAP[gridSize] || GRID_MAP.medium
  const iA = intensity === 'gentle' ? 0.3 : intensity === 'satisfying' ? 0.5 : 0.4

  const balloonView = useMemo(() => {
    if (mode !== 'balloon' || !launched) return { items: [], height: 0 }
    return balloonLayout(worries, canvasW || 380, 0)
  }, [worries, launched, mode, canvasW])
  const balloons = balloonView.items

  /* ---- Board geometry -----------------------------------------------------
     The board never scrolls, so the bubble sheet is sized to whichever axis
     runs out first. The sheet is also laid out COLUMN-first, which paints the
     portrait rows×cols grid across the wide stage — a purely visual transpose:
     every cell keeps its own `r{row}-c{col}` id, so popped state, drag-popping
     and the counters are untouched.
  --------------------------------------------------------------------------- */
  const measured = canvasW > 4 && canvasH > 4
  const dispCols = gc.rows
  const dispRows = gc.cols
  const rawCell = measured ? Math.min(canvasW / dispCols, canvasH / dispRows) : 0
  const gapPx = Math.max(2, Math.min(9, Math.round(rawCell * 0.14)))
  const cell = measured
    ? Math.max(6, Math.floor(Math.min(
        (canvasW - gapPx * (dispCols - 1)) / dispCols,
        (canvasH - gapPx * (dispRows - 1)) / dispRows,
      )))
    : 10
  const dotSize = Math.max(2, Math.round(cell * 0.1))

  // Scale the balloon layer down when its natural height outruns the board,
  // so a full set of worries can never spill past the card.
  const bScale = balloonView.height > 0 && canvasH > 0
    ? Math.min(1, canvasH / balloonView.height)
    : 1

  const meta = MODE_META[mode]

  /* ---- Shared control styles --------------------------------------------- */

  const diffPill = (on: boolean): React.CSSProperties => ({
    minWidth: 92,
    padding: '7px 20px',
    borderRadius: 999,
    border: `1px solid ${on ? GREEN : BORDER}`,
    background: on ? GREEN : '#ffffff',
    color: on ? '#ffffff' : GREEN,
    fontSize: 15,
    fontWeight: 700,
    cursor: isT ? 'pointer' : 'default',
    boxShadow: on ? '0 4px 12px rgba(31,122,68,0.26)' : CARD_SHADOW,
    transition: 'all 0.15s',
  })

  const smallPill = (on: boolean): React.CSSProperties => ({
    padding: '4px 11px',
    borderRadius: 999,
    border: `1px solid ${on ? GREEN : BORDER}`,
    background: on ? 'rgba(31,122,68,0.10)' : '#ffffff',
    color: on ? GREEN : MUTED,
    fontSize: 12.5,
    fontWeight: 700,
    textTransform: 'capitalize',
    cursor: 'pointer',
  })

  const ghostBtn: React.CSSProperties = {
    padding: '5px 11px',
    borderRadius: 9,
    border: `1px solid ${BORDER}`,
    background: '#ffffff',
    color: INK_BODY,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  }

  const modeButton = (m: 'wrap' | 'balloon') => {
    const on = mode === m
    const accent = m === 'wrap' ? VIOLET : PINK
    const art = m === 'wrap' ? <BubbleClusterArt size={44} /> : <BalloonArt size={44} />
    const label = m === 'wrap' ? <>Bubble<br />Popping</> : <>Balloon<br />Popping</>
    const text = (
      <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.13, letterSpacing: -0.2, color: accent, textAlign: m === 'wrap' ? 'left' : 'right' }}>
        {label}
      </span>
    )
    return (
      <button
        type="button"
        onClick={() => { if (isT) write({ 'moduleState.bpMode': m }) }}
        disabled={!isT}
        aria-pressed={on}
        aria-label={`${MODE_LABELS[m]} mode`}
        title={isT ? `Switch to ${MODE_LABELS[m]}` : MODE_LABELS[m]}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '5px 11px',
          borderRadius: 16,
          border: `1px solid ${on ? `${accent}44` : 'transparent'}`,
          background: on ? `${accent}12` : 'transparent',
          opacity: on ? 1 : 0.55,
          cursor: isT ? 'pointer' : 'default',
          transition: 'all 0.18s ease',
        }}
      >
        {m === 'wrap' ? <>{art}{text}</> : <>{text}{art}</>}
      </button>
    )
  }

  /* ---- Left info column --------------------------------------------------- */

  const infoColumn = (
    <div
      className="bp-scroll"
      style={{
        width: 'clamp(136px, 17%, 190px)',
        flexShrink: 0,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingRight: 3,
      }}
    >
      <InfoCard icon={<Clock size={15} strokeWidth={2.3} color={INK_BODY} />} tint="#eef1f6">
        <div style={{ fontSize: 19.5, fontWeight: 800, color: INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          <ElapsedClock />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, marginTop: 1 }}>Time Elapsed</div>
      </InfoCard>

      <InfoCard icon={<Target size={15} strokeWidth={2.3} color="#EA580C" />} tint="#FFF1E6" title="Goal">
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: INK_BODY }}>{meta.goal}</div>
      </InfoCard>

      <InfoCard icon={<Sparkles size={15} strokeWidth={2.3} color={VIOLET} />} tint="#F2ECFE" title="Focus">
        {FOCUS_LINES.map(line => (
          <div key={line} style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: INK_BODY }}>{line}</div>
        ))}
      </InfoCard>

      <InfoCard icon={<Volume2 size={15} strokeWidth={2.3} color={GREEN} />} tint="#E8F5EE" title="Instructions">
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: INK_BODY }}>
          {mode === 'wrap' ? 'Press and drag to pop a whole row.' : 'Tap a balloon to let that worry go.'}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: MUTED, marginTop: 2 }}>
          Keep the volume at max
        </div>
      </InfoCard>

      {/* Progress — the same counters as before, in the column's card language. */}
      <div
        style={{
          flexShrink: 0,
          padding: '9px 10px',
          borderRadius: 14,
          border: `1px solid ${BORDER}`,
          background: '#ffffff',
          boxShadow: CARD_SHADOW,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{cnt} / {total}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, margin: '1px 0 6px' }}>
          {mode === 'wrap' ? 'bubbles popped' : 'worries released'}
        </div>
        <div style={{ width: '100%', height: 6, borderRadius: 999, background: '#eef1f4', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg,#3FBF7A 0%,${GREEN} 100%)`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Worry set-up lives in the column in balloon mode, matching the mockup. */}
      {mode === 'balloon' && isT && (
        <div
          style={{
            flexShrink: 0,
            padding: '10px',
            borderRadius: 14,
            border: `1px solid ${BORDER}`,
            background: '#ffffff',
            boxShadow: CARD_SHADOW,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <BalloonArt size={22} />
            <span style={{ fontSize: 15, fontWeight: 800, color: VIOLET }}>Worry Balloons</span>
          </div>

          {!launched && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, color: MUTED }}>
                Type a worry that&apos;s on your mind and pop it to feel lighter.
              </div>
              <input
                className="bp-input"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && inputVal.trim() && worries.length < 12) {
                    const nw = [...worries, inputVal.trim()]; setWorries(nw); setInputVal(''); write({ 'moduleState.bpWorries': nw })
                  }
                }}
                placeholder="Type your worry here..."
                disabled={worries.length >= 12}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 10,
                  padding: '7px 9px', color: INK, fontSize: 13, fontWeight: 600, outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (inputVal.trim() && worries.length < 12) {
                    const nw = [...worries, inputVal.trim()]; setWorries(nw); setInputVal(''); write({ 'moduleState.bpWorries': nw })
                  }
                }}
                disabled={!inputVal.trim() || worries.length >= 12}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '8px 10px', borderRadius: 10, border: 'none',
                  background: VIOLET, color: '#ffffff', fontSize: 14, fontWeight: 700,
                  cursor: (!inputVal.trim() || worries.length >= 12) ? 'default' : 'pointer',
                  opacity: (!inputVal.trim() || worries.length >= 12) ? 0.45 : 1,
                  boxShadow: '0 4px 12px rgba(124,58,237,0.26)',
                }}
              >
                <Send size={13} strokeWidth={2.4} /> Add Worry
              </button>

              {worries.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {worries.map((w, i) => (
                    <span
                      key={i}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#F5F6FA', border: `1px solid ${BORDER}`, borderRadius: 999,
                        padding: '2px 4px 2px 8px', fontSize: 12, fontWeight: 600, color: INK_BODY, maxWidth: '100%',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 96 }}>{w}</span>
                      <button
                        type="button"
                        onClick={() => { const n = worries.filter((_, j) => j !== i); setWorries(n); write({ 'moduleState.bpWorries': n, 'moduleState.bpPopped': [], 'moduleState.bpEndMood': '' }) }}
                        aria-label={`Remove ${w}`}
                        style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}
                      >✕</button>
                    </span>
                  ))}
                </div>
              )}

              {worries.length > 0 && (
                <button
                  type="button"
                  onClick={() => write({ 'moduleState.bpLaunched': true })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 10px', borderRadius: 10, border: 'none',
                    background: GREEN, color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(31,122,68,0.26)',
                  }}
                >
                  <Rocket size={13} strokeWidth={2.4} /> Launch ({worries.length})
                </button>
              )}
            </>
          )}

          {launched && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>
                {worries.length} balloon{worries.length === 1 ? '' : 's'} · {cnt} popped
              </div>
              <button type="button" onClick={() => write({ 'moduleState.bpLaunched': false })} style={{ ...ghostBtn, justifyContent: 'center' }}>
                Re-land balloons
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'balloon' && (
        <InfoCard icon={<Lightbulb size={15} strokeWidth={2.3} color="#B45309" />} tint="#FEF6E0" title="Tip">
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: INK_BODY }}>
            You can pop as many worries as you want.
          </div>
        </InfoCard>
      )}
    </div>
  )

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        // Belt and braces: in a BLOCK parent (GlassModulePanel's .gm-canvas)
        // `height: 100%` can resolve to auto and collapse the board to 0px.
        minHeight: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        overflow: 'hidden',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}
    >
      <style>{`
        .cp {animation:cp .3s ease forwards}
        @keyframes cp {0%{transform:scale(1)}30%{transform:scale(.75)}55%{transform:scale(.88)}75%{transform:scale(.82)}100%{transform:scale(1)}}
        @keyframes pb {0%{opacity:1;transform:translate(0,0)scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy))scale(0)}}
        @keyframes bb {0%,100%{transform:translate(-4px,0)rotate(-2deg)}50%{transform:translate(4px,-10px)rotate(2deg)}}
        /* Release, not just a pop: the balloon swells, lifts, drifts sideways and
           fades as it floats off — the "letting go of a worry" metaphor. */
        @keyframes bp {
          0%{transform:translate(0,0)scale(1);opacity:1}
          12%{transform:translate(0,-4px)scale(1.12);opacity:1}
          45%{transform:translate(14px,-90px)scale(.95)rotate(6deg);opacity:.85}
          75%{transform:translate(-10px,-190px)scale(.85)rotate(-5deg);opacity:.45}
          100%{transform:translate(6px,-280px)scale(.7)rotate(3deg);opacity:0}
        }
        @keyframes cb {0%{transform:translate(0,0)scale(1);opacity:1}100%{transform:translate(var(--cdx),var(--cdy))scale(0);opacity:0}}
        @keyframes fu {0%{transform:translateY(0);opacity:1}100%{transform:translateY(-40px);opacity:0}}
        .bb-a {animation:bb ease-in-out infinite}
        .bp-a {animation:bp 1.6s cubic-bezier(.33,.0,.55,1) forwards !important}
        .bp-input::placeholder { color:#9aa3ad; font-weight:500; }
        .bp-input:focus { border-color:${VIOLET}; box-shadow:0 0 0 3px rgba(124,58,237,0.14); }
        .bp-scroll { scrollbar-width: thin; scrollbar-color:#d7dde3 transparent; }
        .bp-scroll::-webkit-scrollbar { width:6px; }
        .bp-scroll::-webkit-scrollbar-thumb { background:#d7dde3; border-radius:999px; }
      `}</style>

      {/* ---- Mode switcher: two labelled art clusters flanking the active
          mode's title. This is the BODY's own mode heading, not a repeat of
          ModuleStage's registry title above it. ---- */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        {modeButton('wrap')}
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'clamp(19px, 2.5vw, 30px)',
              fontWeight: 800,
              letterSpacing: -0.7,
              lineHeight: 1.12,
              color: INK,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 'clamp(11px, 1.15vw, 14px)',
              fontWeight: 600,
              color: INK_BODY,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {meta.subtitle}
          </div>
        </div>
        {modeButton('balloon')}
      </div>

      {/* ---- Difficulty pills — wired to the existing bpGridSize field ---- */}
      {mode === 'wrap' && (
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', gap: 10 }}>
          {DIFFICULTY.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => { if (isT) write({ 'moduleState.bpGridSize': d.key }) }}
              disabled={!isT}
              aria-pressed={gridSize === d.key}
              style={diffPill(gridSize === d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* ---- Info column + board ---- */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
        {infoColumn}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
            borderRadius: 24,
            border: `1px solid ${BORDER}`,
            boxShadow: CARD_SHADOW,
            overflow: 'hidden',
            backgroundColor: '#f7f8fc',
            backgroundImage: mode === 'balloon'
              ? `url("${BP_SCENE}"), linear-gradient(165deg,#fdf2f8 0%,#f5f0ff 55%,#fff7ed 100%)`
              : 'linear-gradient(160deg,#fdfdff 0%,#f6f7fc 55%,#f1f2f9 100%)',
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center center, center center',
            backgroundRepeat: 'no-repeat, no-repeat',
          }}
        >
          <div
            ref={cRef}
            style={{
              position: 'absolute',
              inset: 14,
              overflow: 'hidden',
              touchAction: mode === 'wrap' ? 'none' : 'auto',
            }}
            onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerLeave={pu}
          >
            {mode === 'wrap' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div
                  style={{
                    display: 'grid',
                    // Column-first flow paints the portrait grid across the wide
                    // stage without touching a single cell id.
                    gridTemplateRows: `repeat(${dispRows}, ${cell}px)`,
                    gridAutoFlow: 'column',
                    gridAutoColumns: `${cell}px`,
                    gap: gapPx,
                    opacity: measured ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {Array.from({ length: gc.rows * gc.cols }, (_, i) => {
                    const r = Math.floor(i / gc.cols)
                    const c = i % gc.cols
                    const id = `r${r}-c${c}`
                    const isP = poppedSet.has(id)
                    const isA = animating.has(id)
                    const candy = CANDY[(r * 3 + c * 5) % CANDY.length]

                    if (isP && !isA) {
                      // Spent bubble: a faint ring with the confetti it left behind.
                      return (
                        <div
                          key={id}
                          data-cell={id}
                          style={{
                            position: 'relative',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0.35))',
                            border: '1px solid rgba(148,163,184,0.28)',
                            boxShadow: 'inset 0 1px 3px rgba(100,116,139,0.10)',
                            cursor: 'default',
                            transition: 'all 0.15s',
                          }}
                        >
                          {SPENT_DOTS.map(([lx, ly, ci], di) => (
                            <span
                              key={di}
                              aria-hidden
                              style={{
                                position: 'absolute',
                                left: `${lx}%`,
                                top: `${ly}%`,
                                width: dotSize,
                                height: dotSize,
                                borderRadius: 1,
                                background: CANDY[ci].base,
                                opacity: 0.5,
                                transform: `rotate(${di * 37}deg)`,
                              }}
                            />
                          ))}
                        </div>
                      )
                    }

                    return (
                      <div
                        key={id}
                        data-cell={id}
                        className={isA ? 'cp' : ''}
                        style={{
                          position: 'relative',
                          borderRadius: '50%',
                          cursor: canInteract ? 'pointer' : 'default',
                          transition: 'all 0.15s',
                          background: `radial-gradient(circle at 33% 27%, #ffffff 0%, rgba(255,255,255,0.72) 9%, ${candy.base} 44%, ${candy.deep} 100%)`,
                          boxShadow: `inset 0 -2px 5px rgba(0,0,0,${(0.10 + iA * 0.2).toFixed(2)}), inset 0 2px 3px rgba(255,255,255,0.5), 0 3px 7px ${candy.deep}33`,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute',
                            left: '21%',
                            top: '13%',
                            width: '33%',
                            height: '23%',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.92)',
                            transform: 'rotate(-24deg)',
                            pointerEvents: 'none',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {mode === 'balloon' && launched && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: balloonView.height || '100%',
                  transform: `scale(${bScale})`,
                  transformOrigin: 'top center',
                }}
              >
                {balloons.map(b => {
                  const isP = poppedSet.has(b.id)
                  const isA = animating.has(b.id)
                  if (isP && !isA) return null
                  return (
                    <div key={b.id} data-balloon={b.id}
                      className={isA ? 'bp-a' : 'bb-a'}
                      style={{
                        position: 'absolute', left: b.x, top: b.y, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        cursor: canInteract && !isP ? 'pointer' : 'default', animationDuration: isA ? '1.6s' : `${b.dur}s`,
                        animationDelay: isA ? '0s' : `${b.del}s`, pointerEvents: isP ? 'none' : 'auto', zIndex: isA ? 10 : 2,
                        animationFillMode: isA ? 'forwards' : undefined,
                      }}
                      onPointerDown={e => {
                        if (isP || isA || !canInteract) return
                        e.stopPropagation()
                        popBalloon(b.id, b.worry, b.x, b.y)
                      }}
                    >
                      <div style={{
                        width: b.size, height: b.size * 1.15,
                        borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
                        background: `radial-gradient(circle at 31% 25%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.62) 15%, ${b.color} 55%, ${b.color} 100%)`,
                        border: '1px solid rgba(255,255,255,0.65)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 7px',
                        boxShadow: `inset 0 -6px 12px rgba(0,0,0,0.07), 0 6px 14px rgba(70,50,90,0.16)`,
                      }}>
                        {/* Dark text on a pastel balloon — never white-on-light. */}
                        <span style={{
                          fontSize: 12.5, fontWeight: 700, color: '#1f2937', textAlign: 'center', lineHeight: 1.22,
                          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word',
                        }}>{b.worry}</span>
                      </div>
                      <div style={{ width: 2, height: 30, background: 'rgba(120,110,140,0.45)', borderRadius: 1, marginTop: -2 }} />
                    </div>
                  )
                })}

                {/* Confetti + released-worry text live in the SAME scaled layer as
                    the balloons, so a scaled board keeps them registered. */}
                {confettis.map(c => (
                  <div key={c.id} style={{ position: 'absolute', left: c.x, top: c.y, width: 6, height: 6, borderRadius: '50%', background: c.col, pointerEvents: 'none', zIndex: 20, '--cdx': `${c.dx}px`, '--cdy': `${c.dy}px`, animation: 'cb .6s ease forwards' } as React.CSSProperties} />
                ))}

                {floaters.map(f => (
                  <div key={f.id} style={{
                    position: 'absolute', left: f.x, top: f.y, fontSize: 13, fontWeight: 700, color: INK_BODY,
                    background: 'rgba(255,255,255,0.88)', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '3px 9px',
                    pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap', animation: 'fu 1.5s ease forwards',
                  }}>{f.text}</div>
                ))}
              </div>
            )}

            {mode === 'balloon' && !launched && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{
                  padding: '10px 18px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.9)', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW,
                  fontSize: 15, fontWeight: 700, color: INK_BODY, textAlign: 'center',
                }}>
                  {isT ? 'Add worries in the panel, then launch the balloons.' : 'Your therapist is setting up…'}
                </div>
              </div>
            )}

            {/* Pop particles — measured against this canvas, so they stay here. */}
            {particles.map(p => (
              <div key={p.id} style={{ position: 'absolute', left: p.x, top: p.y, width: 5, height: 5, borderRadius: 1.5, background: p.col, pointerEvents: 'none', zIndex: 20, '--dx': p.dx, '--dy': p.dy, animation: 'pb .4s ease forwards' } as React.CSSProperties} />
            ))}
          </div>
        </div>
      </div>

      {/* ---- Therapist strip: the settings the mockup doesn't surface ---- */}
      {isT && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 7, borderTop: `1px solid ${BORDER}` }}>
          {mode === 'wrap' && (
            <>
              <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pop feel</span>
              {['gentle', 'normal', 'satisfying'].map(v => (
                <button key={v} type="button" onClick={() => write({ 'moduleState.bpIntensity': v })} style={smallPill(intensity === v)}>
                  {v}
                </button>
              ))}
            </>
          )}
          {mode === 'balloon' && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTED }}>
              {worries.length} worr{worries.length === 1 ? 'y' : 'ies'} · {cnt} released
            </span>
          )}
          <div style={{ flex: 1 }} />
          {cnt > 0 && (
            <button
              type="button"
              onClick={resetAll}
              style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#f0d9d9' }}
            >
              <RotateCcw size={12} strokeWidth={2.4} /> Reset
            </button>
          )}
        </div>
      )}

      {/* ---- Completion ---- */}
      {allDone && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(6px)', zIndex: 50, padding: 20,
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11,
            padding: '22px 30px', borderRadius: 22, maxWidth: 420,
            background: '#ffffff', border: `1px solid ${BORDER}`, boxShadow: '0 18px 44px rgba(20,30,45,0.16)',
          }}>
            <div style={{ fontSize: 40.5, lineHeight: 1 }}>🎉</div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.4, color: INK, textAlign: 'center' }}>
              {mode === 'wrap' ? 'All bubbles popped!' : 'You released all your worries!'}
            </div>
            {mode === 'balloon' && !endMood && (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: MUTED }}>How do you feel now?</div>
                <div style={{ display: 'flex', gap: 9 }}>
                  {MOOD_EMOJIS.map(e => (
                    <button key={e} type="button"
                      onClick={() => { setEndMood(e); write({ 'moduleState.bpEndMood': e }); logModuleEvent(sessionId, { module: 'virtual-box-popping', type: 'mood_check', detail: `Reported feeling "${e}" after releasing worries` }) }}
                      style={{
                        background: '#ffffff', border: `1px solid ${BORDER}`,
                        borderRadius: 12, padding: '7px 9px', cursor: 'pointer', fontSize: 23,
                        boxShadow: CARD_SHADOW, transition: 'all 0.15s',
                      }}
                    >{e}</button>
                  ))}
                </div>
              </>
            )}
            {mode === 'balloon' && endMood && (
              <div style={{ fontSize: 16, fontWeight: 700, color: INK_BODY }}>You chose {endMood}</div>
            )}
            {(mode === 'wrap' || endMood) && isT && (
              <button type="button" onClick={resetAll}
                style={{
                  marginTop: 2, padding: '9px 22px', borderRadius: 11, border: 'none',
                  background: GREEN, color: '#ffffff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 5px 14px rgba(31,122,68,0.28)',
                }}
              >Start again</button>
            )}
          </div>
        </div>
      )}

      {/* ---- Milestone toast — white text only on a solid dark pill ---- */}
      {toast && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(17,24,39,0.9)', borderRadius: 12,
          padding: '9px 18px', color: '#ffffff', fontSize: 15, fontWeight: 700, zIndex: 100, pointerEvents: 'none',
          boxShadow: '0 10px 26px rgba(20,30,45,0.28)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
