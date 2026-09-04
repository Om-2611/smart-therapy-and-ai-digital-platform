'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'
import { staadPraise, staadCancel } from '@/lib/voice/staadVoice'
import { useVoiceLanguage } from '@/lib/voice/useVoiceLanguage'

interface PixelArtCodingProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type PacMode = 'paint' | 'code'
type GridSize = 6 | 8 | 10

const GRID_SIZES: { key: GridSize; label: string }[] = [
  { key: 6, label: '6×6 Easy' },
  { key: 8, label: '8×8 Normal' },
  { key: 10, label: '10×10 Hard' },
]

const COLORS = [
  '#4a7c6f', '#c8602a', '#f7c948',
  '#5b8dd9', '#e86d8a', '#2b2f33',
]

const COMMANDS = [
  { key: 'up', label: '⬆', name: 'Up' },
  { key: 'down', label: '⬇', name: 'Down' },
  { key: 'left', label: '⬅', name: 'Left' },
  { key: 'right', label: '➡', name: 'Right' },
  { key: 'paint', label: '🎨', name: 'Paint' },
]

const PATTERNS: Record<string, number[][]> = {
  heart: [
    [0,1,1,0,0,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  house: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,0],
  ],
  star: [
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,0,0,0,0,0,1],
    [0,0,0,0,0,0,0,0],
  ],
  smiley: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  arrow: [
    [0,0,0,1,0,0,0,0],
    [0,0,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,0,0,0,0],
    [0,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  tree: [
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  fish: [
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,0,0,0,0],
    [0,0,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,0,0],
    [0,0,0,0,1,0,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  'letter-a': [
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,0,0,1,1,0],
    [1,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1],
  ],
  'letter-b': [
    [1,1,1,1,1,1,0,0],
    [1,0,0,0,0,1,0,0],
    [1,0,0,0,0,1,0,0],
    [1,1,1,1,1,0,0,0],
    [1,0,0,0,0,1,0,0],
    [1,0,0,0,0,1,0,0],
    [1,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  'letter-c': [
    [0,1,1,1,1,1,0,0],
    [1,0,0,0,0,0,1,0],
    [1,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,0,0],
    [1,0,0,0,0,0,1,0],
    [0,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
}

const PATTERN_NAMES: { key: string; label: string }[] = [
  { key: 'heart', label: '❤️ Heart' },
  { key: 'house', label: '🏠 House' },
  { key: 'star', label: '⭐ Star' },
  { key: 'tree', label: '🌲 Tree' },
  { key: 'fish', label: '🐟 Fish' },
  { key: 'smiley', label: '😊 Smiley' },
  { key: 'arrow', label: '➡️ Arrow' },
  { key: 'letter-a', label: 'A' },
  { key: 'letter-b', label: 'B' },
  { key: 'letter-c', label: 'C' },
]

/**
 * Resample a pattern to the selected grid size (nearest neighbour).
 *
 * Every PATTERNS entry is authored 8x8, but the grid can be 6, 8 or 10. Scoring
 * used to iterate the PATTERN's 8x8 bounds while the board only rendered
 * gridSize cells, so on a 6x6 board every pattern cell in rows/cols 6-7 was
 * unreachable and permanently counted as a mismatch — capping the score at
 * 73-95% (91% for the default heart) and making 100% impossible. The target
 * preview, meanwhile, cropped to the top-left 6x6, so the child was shown a
 * different shape from the one being graded.
 *
 * Scaling makes the preview and the scoring agree at all three sizes.
 */
function scalePattern(pattern: number[][], size: number): number[][] {
  const src = pattern.length
  if (src === size) return pattern
  const out: number[][] = []
  for (let r = 0; r < size; r++) {
    const row: number[] = []
    const sr = Math.min(src - 1, Math.floor((r * src) / size))
    for (let c = 0; c < size; c++) {
      const sc = Math.min(src - 1, Math.floor((c * src) / size))
      row.push(pattern[sr][sc] === 1 ? 1 : 0)
    }
    out.push(row)
  }
  return out
}

function calcMatchPercent(cells: Record<string, string>, pattern: number[][], gridSize: number): number {
  // Grade the whole visible board: required cells come from the scaled pattern,
  // and anything painted outside it still counts against the match.
  const target = scalePattern(pattern, gridSize)
  let matched = 0
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const key = `${r}-${c}`
      const isFilled = key in cells
      const shouldBeFilled = target[r][c] === 1
      if (isFilled === shouldBeFilled) matched++
    }
  }
  return Math.round((matched / (gridSize * gridSize)) * 100)
}

export default function PixelArtCoding({ sessionId, role, isLocked }: PixelArtCodingProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const voiceLanguage = useVoiceLanguage(sessionId)
  const voiceLangRef = useRef(voiceLanguage)
  voiceLangRef.current = voiceLanguage

  const [mode, setMode] = useState<PacMode>('paint')
  const [gridSize, setGridSize] = useState<GridSize>(8)
  const [targetPattern, setTargetPattern] = useState('heart')
  const [activeColor, setActiveColor] = useState('#4a7c6f')
  const [cells, setCells] = useState<Record<string, string>>({})
  const [cursorPos, setCursorPos] = useState({ row: 0, col: 0 })
  const [program, setProgram] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [programStatus, setProgramStatus] = useState<'idle' | 'running' | 'complete' | 'out-of-bounds'>('idle')
  const [score, setScore] = useState(0)
  const [matched, setMatched] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  const [celebEmojis, setCelebEmojis] = useState<{ id: number; x: number; emoji: string }[]>([])
  const [perfectCells, setPerfectCells] = useState<Set<string>>(new Set())
  const [showCodeHelp, setShowCodeHelp] = useState(true)

  const isDragging = useRef(false)
  const celebIdRef = useRef(0)
  const executeRef = useRef(false)
  const runTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const cellsRef = useRef(cells)
  cellsRef.current = cells
  const cursorRef = useRef(cursorPos)
  cursorRef.current = cursorPos
  const gridSizeRef = useRef(gridSize)
  gridSizeRef.current = gridSize

  const writeToFirestore = useCallback(async (data: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        ...data,
        'timestamps.updatedAt': new Date().toISOString(),
      })
    } catch (err) {
      console.warn('[PixelArtCoding] Firestore write failed', err)
    }
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const s = data.moduleState || {}
      if (typeof s.pacMode === 'string') setMode(s.pacMode as PacMode)
      if (typeof s.pacGridSize === 'number') setGridSize(s.pacGridSize as GridSize)
      if (typeof s.pacTargetPattern === 'string') setTargetPattern(s.pacTargetPattern)
      if (typeof s.pacActiveColor === 'string') setActiveColor(s.pacActiveColor)
      if (s.pacCells && typeof s.pacCells === 'object') setCells(s.pacCells as Record<string, string>)
      if (Array.isArray(s.pacProgram)) setProgram(s.pacProgram as string[])
      if (s.pacCursorPos && typeof s.pacCursorPos.row === 'number') setCursorPos(s.pacCursorPos)
      if (typeof s.pacIsRunning === 'boolean') setIsRunning(s.pacIsRunning)
      if (typeof s.pacScore === 'number') setScore(s.pacScore)
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    return () => {
      executeRef.current = false
      if (runTimeoutRef.current) clearTimeout(runTimeoutRef.current)
      staadCancel()
    }
  }, [])

  const triggerCelebration = useCallback(() => {
    setCelebrating(true)
    setMatched(true)
    setScore((s) => {
      const next = s + 1
      writeToFirestore({ 'moduleState.pacScore': next })
      return next
    })

    const pattern = PATTERNS[targetPattern]
    if (pattern) {
      const target = scalePattern(pattern, gridSizeRef.current)
      const pCells = new Set<string>()
      for (let r = 0; r < target.length; r++) {
        for (let c = 0; c < target[r].length; c++) {
          if (target[r][c] === 1) pCells.add(`${r}-${c}`)
        }
      }
      setPerfectCells(pCells)
    }

    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const id = celebIdRef.current++
        const x = 10 + Math.random() * 80
        const emojis = ['🎉', '⭐', '✨', '🌟', '🎊', '💫']
        setCelebEmojis((prev) => [...prev, { id, x, emoji: emojis[i % emojis.length] }])
        setTimeout(() => setCelebEmojis((prev) => prev.filter((e) => e.id !== id)), 1800)
      }, i * 150)
    }

    staadCancel()
    staadPraise(voiceLangRef.current, 'Amazing! You matched the pattern!')

    setTimeout(() => {
      setCelebrating(false)
      setMatched(false)
      setPerfectCells(new Set())
      setCells({})
      writeToFirestore({ 'moduleState.pacCells': {} })
    }, 2000)
  }, [targetPattern, writeToFirestore])

  useEffect(() => {
    if (mode !== 'paint' || celebrating) return
    const pattern = PATTERNS[targetPattern]
    if (!pattern) return
    const pct = calcMatchPercent(cells, pattern, gridSizeRef.current)
    if (pct === 100 && !matched) {
      triggerCelebration()
    }
  }, [cells, targetPattern, mode, celebrating, matched, triggerCelebration])

  const paintCell = (row: number, col: number) => {
    const key = `${row}-${col}`
    setCells((prev) => {
      const next = { ...prev }
      if (key in next) {
        delete next[key]
      } else {
        next[key] = activeColor
      }
      return next
    })
  }

  const handleCellMouseDown = (row: number, col: number) => {
    if (!canInteract || mode !== 'paint' || isRunning) return
    isDragging.current = true
    paintCell(row, col)
  }

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isDragging.current || !canInteract || mode !== 'paint' || isRunning) return
    paintCell(row, col)
  }

  const handleMouseUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false
      writeToFirestore({ 'moduleState.pacCells': cellsRef.current })
    }
  }, [writeToFirestore])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleCellTouchStart = (e: React.TouchEvent, row: number, col: number) => {
    if (!canInteract || mode !== 'paint' || isRunning) return
    e.preventDefault()
    isDragging.current = true
    paintCell(row, col)
  }

  const handleGridTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !canInteract || mode !== 'paint' || isRunning) return
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (el && el.getAttribute('data-cell')) {
      const [r, c] = el.getAttribute('data-cell')!.split(',').map(Number)
      paintCell(r, c)
    }
  }

  const handleGridTouchEnd = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false
      writeToFirestore({ 'moduleState.pacCells': cellsRef.current })
    }
  }, [writeToFirestore])

  const handleColorChange = (color: string) => {
    setActiveColor(color)
    writeToFirestore({ 'moduleState.pacActiveColor': color })
  }

  const handleModeChange = (newMode: PacMode) => {
    setMode(newMode)
    setProgramStatus('idle')
    writeToFirestore({ 'moduleState.pacMode': newMode })
  }

  const handleGridSizeChange = (size: GridSize) => {
    setGridSize(size)
    setCells({})
    setCursorPos({ row: 0, col: 0 })
    setProgram([])
    setProgramStatus('idle')
    setMatched(false)
    writeToFirestore({
      'moduleState.pacGridSize': size,
      'moduleState.pacCells': {},
      'moduleState.pacProgram': [],
      'moduleState.pacCursorPos': { row: 0, col: 0 },
    })
  }

  const handlePatternChange = (name: string) => {
    setTargetPattern(name)
    setCells({})
    setMatched(false)
    writeToFirestore({
      'moduleState.pacTargetPattern': name,
      'moduleState.pacCells': {},
    })
  }

  const handleReset = () => {
    setCells({})
    setMatched(false)
    setCursorPos({ row: 0, col: 0 })
    setProgram([])
    setProgramStatus('idle')
    writeToFirestore({
      'moduleState.pacCells': {},
      'moduleState.pacProgram': [],
      'moduleState.pacCursorPos': { row: 0, col: 0 },
    })
  }

  const handleAddCommand = (cmd: string) => {
    if (!canInteract || isRunning || program.length >= 20) return
    setProgram((prev) => {
      const next = [...prev, cmd]
      writeToFirestore({ 'moduleState.pacProgram': next })
      return next
    })
  }

  const handleRemoveCommand = (idx: number) => {
    if (!canInteract || isRunning) return
    setProgram((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      writeToFirestore({ 'moduleState.pacProgram': next })
      return next
    })
  }

  const delay = (ms: number) => new Promise<void>((resolve) => {
    runTimeoutRef.current = setTimeout(resolve, ms)
  })

  const handleRun = async () => {
    if (isRunning || program.length === 0) return
    executeRef.current = true
    setIsRunning(true)
    setProgramStatus('running')
    writeToFirestore({ 'moduleState.pacIsRunning': true })

    let localRow = cursorRef.current.row
    let localCol = cursorRef.current.col

    for (let i = 0; i < program.length && executeRef.current; i++) {
      const cmd = program[i]
      let nextRow = localRow
      let nextCol = localCol

      switch (cmd) {
        case 'up': nextRow--; break
        case 'down': nextRow++; break
        case 'left': nextCol--; break
        case 'right': nextCol++; break
      }

      if (cmd !== 'paint') {
        if (nextRow < 0 || nextRow >= gridSize || nextCol < 0 || nextCol >= gridSize) {
          setProgramStatus('out-of-bounds')
          break
        }
        localRow = nextRow
        localCol = nextCol
      }

      setCursorPos({ row: localRow, col: localCol })

      if (cmd === 'paint') {
        const key = `${localRow}-${localCol}`
        setCells((prev) => {
          if (key in prev) return prev
          const next = { ...prev, [key]: activeColor }
          writeToFirestore({
            'moduleState.pacCells': next,
            'moduleState.pacCursorPos': { row: localRow, col: localCol },
          })
          return next
        })
      } else {
        writeToFirestore({ 'moduleState.pacCursorPos': { row: localRow, col: localCol } })
      }

      await delay(300)
      if (!executeRef.current) break
    }

    executeRef.current = false
    setIsRunning(false)
    writeToFirestore({ 'moduleState.pacIsRunning': false })
    if (programStatus !== 'out-of-bounds') {
      setProgramStatus('complete')
      setTimeout(() => setProgramStatus('idle'), 2000)
      if (isTherapist) {
        logModuleEvent(sessionId, {
          module: 'pixel-art-coding',
          type: 'program_completed',
          detail: 'Completed a coding sequence in Pixel Art Coding (pattern recognition / sequencing)',
        })
      }
    }
  }

  const handleStop = () => {
    executeRef.current = false
    if (runTimeoutRef.current) clearTimeout(runTimeoutRef.current)
    setIsRunning(false)
    setProgramStatus('idle')
    writeToFirestore({ 'moduleState.pacIsRunning': false })
  }

  const handleResetProgram = () => {
    handleStop()
    setCells({})
    setCursorPos({ row: 0, col: 0 })
    setProgram([])
    setProgramStatus('idle')
    writeToFirestore({
      'moduleState.pacCells': {},
      'moduleState.pacProgram': [],
      'moduleState.pacCursorPos': { row: 0, col: 0 },
    })
  }

  const pattern = PATTERNS[targetPattern]
  // Single scaled target shared by the preview and the score, so what the child
  // is shown is exactly what is graded.
  const scaledTarget = pattern ? scalePattern(pattern, gridSize) : null

  // Dry-run the program the child has built so far and report where the robot
  // would travel and which cells it would paint. Rendered as ghost markers on the
  // grid, this turns an abstract block list into visible cause-and-effect BEFORE
  // pressing Run. Mirrors handleRun's stepping rules exactly (including the
  // out-of-bounds stop) but touches no state.
  const projection = useMemo(() => {
    if (mode !== 'code' || isRunning || program.length === 0) {
      return { path: new Set<string>(), paint: new Set<string>(), end: null as null | { row: number; col: number }, blocked: false }
    }
    let row = cursorPos.row
    let col = cursorPos.col
    const path = new Set<string>()
    const paint = new Set<string>()
    let blocked = false
    for (const cmd of program) {
      if (cmd === 'paint') {
        paint.add(`${row}-${col}`)
        continue
      }
      let nr = row
      let nc = col
      if (cmd === 'up') nr--
      else if (cmd === 'down') nr++
      else if (cmd === 'left') nc--
      else if (cmd === 'right') nc++
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) {
        blocked = true
        break
      }
      row = nr
      col = nc
      path.add(`${row}-${col}`)
    }
    return { path, paint, end: { row, col }, blocked }
  }, [mode, isRunning, program, cursorPos.row, cursorPos.col, gridSize])
  const matchPct = pattern && mode === 'paint' && !celebrating
    ? calcMatchPercent(cells, pattern, gridSize)
    : null

  const gridGap = gridSize >= 10 ? 1 : 2
  const previewCellSize = `calc(56px / ${gridSize})`

  return (
    <>
      <style>{`
        @keyframes pacFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1) }
          100% { opacity: 0; transform: translateY(-90px) scale(1.5) }
        }
        @keyframes pacPulseGreen {
          0%, 100% { box-shadow: inset 0 0 0 0 rgba(74,124,111,0) }
          50% { box-shadow: inset 0 0 12px 3px rgba(74,124,111,0.6) }
        }
        @keyframes pacFadeInOut {
          0% { opacity: 0; transform: translateY(6px) }
          15% { opacity: 1; transform: translateY(0) }
          75% { opacity: 1; transform: translateY(0) }
          100% { opacity: 0; transform: translateY(-4px) }
        }
      `}</style>

      {/*
        THREE-BLOCK LAYOUT:
        ┌─────────────────────────────┐
        │  TOP (flexShrink: 0)        │  ← Therapist controls
        ├─────────────────────────────┤
        │  MIDDLE (flex: 1,           │  ← Canvas area (scrollable)
        │    overflow-y: auto)        │     Target preview + Grid + Match %
        ├─────────────────────────────┤
        │  BOTTOM (flexShrink: 0)     │  ← Block code commands + Score
        └─────────────────────────────┘
      */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          userSelect: 'none',
        }}
      >
        {/* ============================================== */}
        {/* TOP SECTION — Therapist Controls              */}
        {/* ============================================== */}
        {isTherapist && (
          <div style={{
            flexShrink: 0,
            paddingBottom: 8,
            marginBottom: 8,
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            width: '100%',
            maxWidth: 1000,
            alignSelf: 'center',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            {/* Mode toggle */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 160px' }}>
              {[{ key: 'paint' as PacMode, label: '🖌️ Paint' }, { key: 'code' as PacMode, label: '💻 Code' }].map((m) => (
                <button
                  key={m.key}
                  onClick={() => handleModeChange(m.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: mode === m.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: mode === m.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Pattern selector (Mode A only) */}
            {mode === 'paint' && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {PATTERN_NAMES.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => handlePatternChange(p.key)}
                      style={{
                        padding: '2px 6px',
                        borderRadius: 8,
                        border: 'none',
                        fontSize: 7,
                        fontWeight: 500,
                        cursor: 'pointer',
                        background: targetPattern === p.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                        color: targetPattern === p.key ? '#2f6d5e' : '#6b7280',
                        transition: 'all 0.15s',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color picker (Mode A only) */}
            {mode === 'paint' && (
              <div className="flex items-center" style={{ gap: 4, marginBottom: 5 }}>
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(c)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: activeColor === c ? '2px solid #fff' : '1px solid rgba(0,0,0,0.16)',
                      background: c,
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Grid size selector */}
            <div className="flex items-center" style={{ gap: 6, flex: '1 1 160px' }}>
              {GRID_SIZES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => handleGridSizeChange(s.key)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    borderRadius: 12,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: gridSize === s.key ? 'rgba(74,124,111,0.18)' : 'rgba(0,0,0,0.05)',
                    color: gridSize === s.key ? '#2f6d5e' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Reset */}
            <button
              onClick={handleReset}
              style={{
                flex: '0 0 auto',
                padding: '6px 14px',
                borderRadius: 8,
                border: '1px solid rgba(200,96,42,0.18)',
                background: 'rgba(200,96,42,0.1)',
                color: '#c8602a',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ↺ Reset Grid
            </button>
          </div>
        )}

        {/* Locked overlay notice */}
        {!canInteract && (
          <div style={{ flexShrink: 0, fontSize: 9, color: '#8b9096', textAlign: 'center', paddingBottom: 4 }}>
            Therapist is controlling
          </div>
        )}

        {/* ============================================== */}
        {/* MIDDLE SECTION — Canvas (scrollable)          */}
        {/* ============================================== */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Target preview - Mode A */}
          {mode === 'paint' && pattern && scaledTarget && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexShrink: 0, paddingBottom: 6 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridSize}, ${previewCellSize})`,
                  gap: 0.5,
                  width: 56,
                  height: 56,
                  flexShrink: 0,
                }}
              >
                {Array.from({ length: gridSize }, (_, r) =>
                  Array.from({ length: gridSize }, (_, c) => {
                    const shouldFill = scaledTarget[r][c] === 1
                    return (
                      <div
                        key={`preview-${r}-${c}`}
                        style={{
                          background: shouldFill ? '#4a7c6f' : 'rgba(0,0,0,0.04)',
                          borderRadius: 1,
                        }}
                      />
                    )
                  })
                )}
              </div>
              <span style={{ fontSize: 9, color: '#8b9096' }}>Match this</span>
            </div>
          )}

          {/* Grid */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: 4,
              flex: 1,
              minHeight: 0,
            }}
          >
            <div
              onTouchMove={handleGridTouchMove}
              onTouchEnd={handleGridTouchEnd}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                gap: gridGap,
                // Square, sized from the height the canvas actually leaves,
                // rather than a fixed 288px sidebar cap.
                height: '100%',
                minHeight: 120,
                aspectRatio: '1',
                maxWidth: '100%',
                touchAction: 'none',
              }}
            >
              {Array.from({ length: gridSize }, (_, r) =>
                Array.from({ length: gridSize }, (_, c) => {
                  const key = `${r}-${c}`
                  const filledColor = cells[key]
                  const isCursor = mode === 'code' && cursorPos.row === r && cursorPos.col === c
                  const isPerfectCell = perfectCells.has(key)
                  // Ghost preview of the program the child is building.
                  const willPaint = projection.paint.has(key)
                  const onPath = projection.path.has(key)
                  const isEnd = !!projection.end && projection.end.row === r && projection.end.col === c

                  return (
                    <div
                      key={key}
                      data-cell={`${r},${c}`}
                      onMouseDown={() => handleCellMouseDown(r, c)}
                      onMouseEnter={() => handleCellMouseEnter(r, c)}
                      onTouchStart={(e) => handleCellTouchStart(e, r, c)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 2,
                        background: isCursor
                          ? 'rgba(74,124,111,0.25)'
                          : filledColor
                            ? filledColor
                            : willPaint
                              ? 'rgba(247,201,72,0.35)'
                              : onPath
                                ? 'rgba(74,124,111,0.14)'
                                : 'rgba(0,0,0,0.04)',
                        border: isCursor
                          ? '2px solid #4a7c6f'
                          : isEnd
                            ? '1.5px dashed rgba(247,201,72,0.8)'
                            : willPaint
                              ? '1px dashed rgba(247,201,72,0.7)'
                              : '0.5px solid rgba(0,0,0,0.06)',
                        cursor: canInteract && mode === 'paint' && !isRunning ? 'pointer' : 'default',
                        transition: isCursor
                          ? 'all 0.25s ease'
                          : 'background 0.1s',
                        animation: isPerfectCell ? 'pacPulseGreen 0.6s ease infinite' : 'none',
                        position: 'relative',
                      }}
                    >
                      {isCursor && mode === 'code' && (
                        <div
                          style={{
                            position: 'absolute',
                            borderRadius: 3,
                            border: '2px solid #4a7c6f',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Match percentage - Mode A */}
          {mode === 'paint' && matchPct !== null && (
            <div style={{ textAlign: 'center', paddingBottom: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: matchPct === 100 ? '#6ba395' : '#6b7280' }}>
                {matchPct}% matched
              </span>
            </div>
          )}
        </div>

        {/* ============================================== */}
        {/* BOTTOM SECTION — Command Tray + Score         */}
        {/* ============================================== */}
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 6, marginTop: 6 }}>
          {/* Block Coding Mode */}
          {mode === 'code' && (
            <>
              {/* How Mode B works — a worked example, since a bare row of arrows
                  gives no clue what "running a program" does. Dismissible, and
                  it stays hidden once the child has started building. */}
              {showCodeHelp && program.length === 0 && (
                <div
                  style={{
                    marginBottom: 5,
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: 'rgba(74,124,111,0.12)',
                    border: '1px solid rgba(74,124,111,0.18)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#2f6d5e' }}>
                      How it works
                    </span>
                    <button
                      onClick={() => setShowCodeHelp(false)}
                      style={{ background: 'none', border: 'none', color: '#8b9096', cursor: 'pointer', fontSize: 9, padding: 0 }}
                    >
                      Got it ✕
                    </button>
                  </div>
                  <div style={{ fontSize: 8, color: '#5b6169', lineHeight: 1.5 }}>
                    The green square is your robot. Tap blocks to tell it where to
                    go, then press Run.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 5 }}>
                    {['➡', '➡', '🎨'].map((g, i) => (
                      <span
                        key={i}
                        style={{ padding: '1px 5px', borderRadius: 8, background: 'rgba(74,124,111,0.25)', fontSize: 10 }}
                      >
                        {g}
                      </span>
                    ))}
                    <span style={{ fontSize: 8, color: '#6b7280', marginLeft: 2 }}>
                      = move right, right, then colour that square
                    </span>
                  </div>
                </div>
              )}

              {/* Plain-English readout of the program being built, plus what the
                  ghost markers on the grid mean. */}
              {program.length > 0 && !isRunning && (
                <div style={{ marginBottom: 4, fontSize: 8, color: '#6b7280', lineHeight: 1.4 }}>
                  {projection.blocked ? (
                    <span style={{ color: '#e8a87c' }}>
                      ⚠ This program walks off the grid — remove a move block.
                    </span>
                  ) : (
                    <>
                      Robot will make {program.filter((c) => c !== 'paint').length} move
                      {program.filter((c) => c !== 'paint').length === 1 ? '' : 's'} and colour{' '}
                      {projection.paint.size} square{projection.paint.size === 1 ? '' : 's'}
                      {projection.paint.size > 0 ? ' (shown in yellow)' : ''}.
                    </>
                  )}
                </div>
              )}

              {/* Program sequence */}
              <div
                style={{
                  display: 'flex',
                  gap: 3,
                  padding: '4px 6px',
                  background: 'rgba(0,0,0,0.04)',
                  borderRadius: 8,
                  marginBottom: 4,
                  overflowX: 'auto',
                  minHeight: 28,
                  alignItems: 'center',
                  flexWrap: 'nowrap',
                }}
              >
                {program.map((cmd, i) => {
                  const c = COMMANDS.find((x) => x.key === cmd)
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        padding: '2px 6px',
                        borderRadius: 10,
                        background: 'rgba(74,124,111,0.2)',
                        color: '#2f6d5e',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span>{c?.label || cmd}</span>
                      <span style={{ fontSize: 8, opacity: 0.75 }}>{c?.name}</span>
                      {canInteract && !isRunning && (
                        <button
                          onClick={() => handleRemoveCommand(i)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#8b9096',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 9,
                            lineHeight: 1,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
                {program.length === 0 && programStatus === 'idle' && (
                  <span style={{ fontSize: 8, color: 'rgba(0,0,0,0.22)' }}>
                    Click blocks below to build your program
                  </span>
                )}
              </div>

              {/* Command blocks tray */}
              <div className="flex items-center" style={{ gap: 3, marginBottom: 4 }}>
                {COMMANDS.map((cmd) => (
                  <button
                    key={cmd.key}
                    onClick={() => handleAddCommand(cmd.key)}
                    disabled={!canInteract || isRunning}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 10,
                      border: 'none',
                      fontSize: 12,
                      cursor: canInteract && !isRunning ? 'pointer' : 'default',
                      opacity: canInteract && !isRunning ? 1 : 0.4,
                      background: 'rgba(0,0,0,0.05)',
                      color: '#2f6d5e',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13, lineHeight: 1.1 }}>{cmd.label}</span>
                    <span style={{ display: 'block', fontSize: 7, opacity: 0.7, lineHeight: 1.3 }}>{cmd.name}</span>
                  </button>
                ))}
              </div>

              {/* Program controls */}
              <div className="flex items-center" style={{ gap: 3, marginBottom: 4 }}>
                {!isRunning ? (
                  <button
                    onClick={handleRun}
                    disabled={program.length === 0}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 9,
                      fontWeight: 600,
                      cursor: program.length > 0 ? 'pointer' : 'default',
                      opacity: program.length > 0 ? 1 : 0.4,
                      background: 'rgba(74,124,111,0.18)',
                      color: '#2f6d5e',
                    }}
                  >
                    ▶ Run
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 9,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(200,96,42,0.16)',
                      color: '#c8602a',
                    }}
                  >
                    ⏹ Stop
                  </button>
                )}
                <button
                  onClick={handleResetProgram}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 9,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: 'rgba(0,0,0,0.05)',
                    color: '#6b7280',
                  }}
                >
                  🔄 Reset
                </button>
              </div>

              {/* Program status */}
              {programStatus === 'out-of-bounds' && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 9,
                    color: '#c8602a',
                    animation: 'pacFadeInOut 2s ease forwards',
                  }}
                >
                  Out of bounds!
                </div>
              )}
              {programStatus === 'complete' && (
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: 9,
                    color: '#6ba395',
                    animation: 'pacFadeInOut 2s ease forwards',
                  }}
                >
                  Program complete!
                </div>
              )}
            </>
          )}

          {/* Score bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 10, color: '#6b7280' }}>
              {mode === 'paint' ? '🎨 Free Paint' : '💻 Block Code'}
            </span>
            <span style={{ fontSize: 10, color: '#6b7280' }}>
              ✓ {score} completed
            </span>

            {/* Celebration emojis */}
            {celebEmojis.map((e) => (
              <div
                key={e.id}
                style={{
                  position: 'absolute',
                  left: `${e.x}%`,
                  bottom: 0,
                  fontSize: 18,
                  zIndex: 10,
                  pointerEvents: 'none',
                  animation: 'pacFloatUp 1.6s ease forwards',
                }}
              >
                {e.emoji}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
