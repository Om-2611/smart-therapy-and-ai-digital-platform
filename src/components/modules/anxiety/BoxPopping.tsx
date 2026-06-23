'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface BoxPoppingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

const GRID_MAP: Record<string, { cols: number; rows: number; total: number }> = {
  small: { cols: 6, rows: 8, total: 48 },
  medium: { cols: 8, rows: 10, total: 80 },
  large: { cols: 10, rows: 12, total: 120 },
}

const WORRY_COLORS = ['#e86d8a', '#5b8dd9', '#f7c948', '#4a7c6f', '#c8602a', '#9b59b6']
const CONFETTI_COLORS = ['#e86d8a', '#5b8dd9', '#f7c948', '#4a7c6f', '#c8602a', '#9b59b6', '#ff6b6b', '#48dbfb']
const MOOD_EMOJIS = ['😌', '😊', '😐', '😢', '😰']
const MODE_LABELS: Record<string, string> = { wrap: 'Bubble Wrap', balloon: 'Worry Balloons' }

function rowColor(row: number, a: number): string {
  const s = [[74, 124, 111], [60, 100, 140], [80, 70, 140]]
  const [r, g, b] = s[row % 3]
  return `rgba(${r},${g},${b},${a})`
}

function balloonLayout(worries: string[], w: number, h: number) {
  if (w < 60 || h < 60 || worries.length === 0) return []
  const n = worries.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.4)))
  const gap = Math.max(90, Math.floor(w / (cols + 1)))
  return worries.map((worry, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      id: `b${i}`,
      worry,
      x: Math.max(4, Math.min(w - 80, gap * (col + 1) - 35 + (row % 2) * 12)),
      y: Math.max(4, Math.min(h - 100, 20 + row * 100 + (i % 3) * 8)),
      color: WORRY_COLORS[i % WORRY_COLORS.length],
      size: 70 + (i % 4) * 4,
      dur: 3.5 + (i % 5) * 0.3,
      del: (i % 6) * 0.5,
    }
  })
}

export default function BoxPopping({ sessionId, role, isLocked }: BoxPoppingProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [mode, setMode] = useState<'wrap' | 'balloon'>('wrap')
  const [gridSize, setGridSize] = useState('medium')
  const [intensity, setIntensity] = useState('normal')
  const [worries, setWorries] = useState<string[]>([])
  const [launched, setLaunched] = useState(false)
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
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
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

  useEffect(() => {
    const el = cRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
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

    setTimeout(() => setAnimating(prev => { const n = new Set(prev); n.delete(id); return n }), 450)
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

  const balloons = useMemo(() => {
    if (mode !== 'balloon' || !launched) return []
    const w = cRef.current?.clientWidth || 380
    const h = cRef.current?.clientHeight || 400
    return balloonLayout(worries, w, h)
  }, [worries, launched, mode])

  return (
    <>
      <style>{`
        .cp {animation:cp .3s ease forwards}
        @keyframes cp {0%{transform:scale(1)}30%{transform:scale(.75)}55%{transform:scale(.88)}75%{transform:scale(.82)}100%{transform:scale(1)}}
        @keyframes pb {0%{opacity:1;transform:translate(0,0)scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy))scale(0)}}
        @keyframes bb {0%,100%{transform:translateY(0)rotate(-2deg)}50%{transform:translateY(-10px)rotate(2deg)}}
        @keyframes bp {0%{transform:scale(1);opacity:1}20%{transform:scale(1.3);opacity:1}40%{transform:scale(.1);opacity:.5}100%{transform:scale(0);opacity:0}}
        @keyframes cb {0%{transform:translate(0,0)scale(1);opacity:1}100%{transform:translate(var(--cdx),var(--cdy))scale(0);opacity:0}}
        @keyframes fu {0%{transform:translateY(0);opacity:1}100%{transform:translateY(-40px);opacity:0}}
        .bb-a {animation:bb ease-in-out infinite}
        .bp-a {animation:bp .4s ease forwards !important}
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => write({ 'moduleState.bpMode': 'wrap' })}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                border: mode === 'wrap' ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: mode === 'wrap' ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.04)',
                color: mode === 'wrap' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              }}
            >🫧 Bubble Wrap</button>
            <button onClick={() => write({ 'moduleState.bpMode': 'balloon' })}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                border: mode === 'balloon' ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: mode === 'balloon' ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.04)',
                color: mode === 'balloon' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              }}
            >🎈 Worry Balloons</button>
          </div>

          {mode === 'wrap' && (
            <>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 52 }}>Grid:</span>
                {['small', 'medium', 'large'].map(sz => (
                  <button key={sz} onClick={() => write({ 'moduleState.bpGridSize': sz })}
                    style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, cursor: 'pointer', fontSize: 10, textTransform: 'capitalize',
                      border: gridSize === sz ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                      background: gridSize === sz ? 'rgba(74,124,111,0.15)' : 'transparent',
                      color: gridSize === sz ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                    }}
                  >{sz}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: 52 }}>Pop:</span>
                {['gentle', 'normal', 'satisfying'].map(v => (
                  <button key={v} onClick={() => write({ 'moduleState.bpIntensity': v })}
                    style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, cursor: 'pointer', fontSize: 10, textTransform: 'capitalize',
                      border: intensity === v ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                      background: intensity === v ? 'rgba(74,124,111,0.15)' : 'transparent',
                      color: intensity === v ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                    }}
                  >{v}</button>
                ))}
              </div>
            </>
          )}

          {mode === 'balloon' && !launched && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input value={inputVal} onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && inputVal.trim() && worries.length < 12) {
                      const nw = [...worries, inputVal.trim()]; setWorries(nw); setInputVal(''); write({ 'moduleState.bpWorries': nw })
                    }
                  }}
                  placeholder="Type a worry to put on a balloon"
                  disabled={worries.length >= 12}
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 11, outline: 'none',
                  }}
                />
                <button onClick={() => {
                  if (inputVal.trim() && worries.length < 12) {
                    const nw = [...worries, inputVal.trim()]; setWorries(nw); setInputVal(''); write({ 'moduleState.bpWorries': nw })
                  }
                }}
                  disabled={!inputVal.trim() || worries.length >= 12}
                  style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(74,124,111,0.5)',
                    background: 'rgba(74,124,111,0.2)', cursor: (!inputVal.trim() || worries.length >= 12) ? 'default' : 'pointer',
                    color: (!inputVal.trim() || worries.length >= 12) ? 'rgba(255,255,255,0.3)' : '#fff', fontSize: 11,
                    opacity: (!inputVal.trim() || worries.length >= 12) ? 0.5 : 1,
                  }}
                >+ Add</button>
              </div>
              {worries.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {worries.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>
                      <span>{w}</span>
                      <button onClick={() => { const n = worries.filter((_, j) => j !== i); setWorries(n); write({ 'moduleState.bpWorries': n, 'moduleState.bpPopped': [], 'moduleState.bpEndMood': '' }) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              {worries.length > 0 && (
                <button onClick={() => write({ 'moduleState.bpLaunched': true })}
                  style={{
                    padding: '5px 0', borderRadius: 6, border: '1px solid rgba(74,124,111,0.6)',
                    background: 'rgba(74,124,111,0.2)', color: '#fff', cursor: 'pointer', fontSize: 11,
                  }}
                >🚀 Launch balloons ({worries.length})</button>
              )}
            </div>
          )}

          {mode === 'balloon' && launched && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{worries.length} balloons · {cnt} popped</span>
              <button onClick={() => write({ 'moduleState.bpLaunched': false })}
                style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 10 }}
              >Re-land</button>
            </div>
          )}

          {cnt > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={resetAll}
                style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(200,60,60,0.3)', background: 'transparent', color: 'rgba(200,80,80,0.7)', cursor: 'pointer', fontSize: 10 }}
              >↺ Reset</button>
            </div>
          )}
        </div>
      )}

      {/* Canvas */}
      <div ref={cRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, touchAction: mode === 'wrap' ? 'none' : 'auto' }}
        onPointerDown={pd} onPointerMove={pm} onPointerUp={pu} onPointerLeave={pu}>

        {mode === 'wrap' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gc.cols},1fr)`, gap: 3, padding: 4 }}>
            {Array.from({ length: gc.rows * gc.cols }, (_, i) => {
              const r = Math.floor(i / gc.cols)
              const c = i % gc.cols
              const id = `r${r}-c${c}`
              const isP = poppedSet.has(id)
              const isA = animating.has(id)
              const col = rowColor(r, iA)
              const colL = rowColor(r, iA - 0.15)
              if (isP && !isA) {
                return <div key={id} data-cell={id} style={{ aspectRatio: 1, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)', cursor: 'default', transition: 'all 0.15s' }} />
              }
              return <div key={id} data-cell={id} className={isA ? 'cp' : ''}
                style={{
                  aspectRatio: 1, borderRadius: 8, cursor: canInteract ? 'pointer' : 'default', transition: 'all 0.15s',
                  background: `linear-gradient(135deg,${col} 0%, ${colL} 100%)`,
                  border: `1px solid ${rowColor(r, iA + 0.1)}`,
                  boxShadow: '0 3px 6px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.15)',
                }}
              />
            })}
          </div>
        )}

        {mode === 'balloon' && launched && (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {balloons.map(b => {
              const isP = poppedSet.has(b.id)
              const isA = animating.has(b.id)
              if (isP && !isA) return null
              return (
                <div key={b.id} data-balloon={b.id}
                  className={isA ? 'bp-a' : 'bb-a'}
                  style={{
                    position: 'absolute', left: b.x, top: b.y, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    cursor: canInteract && !isP ? 'pointer' : 'default', animationDuration: isA ? '.4s' : `${b.dur}s`,
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
                    background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3), ${b.color} 60%, ${b.color}dd)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 500, color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 1.2,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word',
                    }}>{b.worry}</span>
                  </div>
                  <div style={{ width: 2, height: 30, background: 'rgba(255,255,255,0.25)', borderRadius: 1, marginTop: -2 }} />
                </div>
              )
            })}
          </div>
        )}

        {mode === 'balloon' && !launched && !isT && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            Your therapist is setting up...
          </div>
        )}

        {/* Particles */}
        {particles.map(p => (
          <div key={p.id} style={{ position: 'absolute', left: p.x, top: p.y, width: 4, height: 4, borderRadius: 1, background: p.col, pointerEvents: 'none', zIndex: 20, '--dx': p.dx, '--dy': p.dy, animation: 'pb .4s ease forwards' } as React.CSSProperties} />
        ))}

        {/* Confetti */}
        {confettis.map(c => (
          <div key={c.id} style={{ position: 'absolute', left: c.x, top: c.y, width: 5, height: 5, borderRadius: '50%', background: c.col, pointerEvents: 'none', zIndex: 20, '--cdx': `${c.dx}px`, '--cdy': `${c.dy}px`, animation: 'cb .6s ease forwards' } as React.CSSProperties} />
        ))}

        {/* Floating text */}
        {floaters.map(f => (
          <div key={f.id} style={{ position: 'absolute', left: f.x, top: f.y, fontSize: 11, color: 'rgba(255,255,255,0.7)', pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap', animation: 'fu 1.5s ease forwards' }}>{f.text}</div>
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ flexShrink: 0, padding: '8px 12px 10px', borderTop: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
          <span>{mode === 'wrap' ? `${cnt} / ${total} bubbles popped` : `${cnt} / ${total} worries released`}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#4a7c6f', borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Completion overlay */}
      {allDone && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(74,124,111,0.25)', backdropFilter: 'blur(6px)', zIndex: 50, gap: 12, padding: 20,
        }}>
          <div style={{ fontSize: 36 }}>🎉</div>
          <div style={{ fontSize: 16, fontFamily: '"DM Serif Display", serif', color: '#fff', textAlign: 'center' }}>
            {mode === 'wrap' ? 'All bubbles popped!' : 'You released all your worries!'}
          </div>
          {mode === 'balloon' && !endMood && (
            <>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>How do you feel now?</div>
              <div style={{ display: 'flex', gap: 10, fontSize: 24 }}>
                {MOOD_EMOJIS.map(e => (
                  <button key={e} onClick={() => { setEndMood(e); write({ 'moduleState.bpEndMood': e }); logModuleEvent(sessionId, { module: 'virtual-box-popping', type: 'mood_check', detail: `Reported feeling "${e}" after releasing worries` }) }}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '6px 8px', cursor: 'pointer', fontSize: 20, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.15)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
                  >{e}</button>
                ))}
              </div>
            </>
          )}
          {mode === 'balloon' && endMood && (
            <div style={{ fontSize: 14, color: '#fff', fontFamily: '"DM Serif Display", serif' }}>You chose {endMood}</div>
          )}
          {(mode === 'wrap' || endMood) && (
            <button onClick={resetAll} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12, padding: '6px 16px', cursor: 'pointer', marginTop: 4 }}>Start again</button>
          )}
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
