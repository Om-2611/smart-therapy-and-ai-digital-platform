'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface VirtualMazeProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

type Difficulty = 'easy' | 'medium' | 'hard'
type ThemeName = 'calm' | 'ocean' | 'night'
type Direction = 'up' | 'down' | 'left' | 'right'

interface Pos {
  row: number
  col: number
}

const DIFFICULTY_MAP: Record<Difficulty, number> = {
  easy: 7,
  medium: 11,
  hard: 15,
}

const DIFFICULTY_LABELS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Easy (7×7)' },
  { key: 'medium', label: 'Medium (11×11)' },
  { key: 'hard', label: 'Hard (15×15)' },
]

const THEME_LIST: { key: ThemeName; label: string }[] = [
  { key: 'calm', label: '🌿 Calm' },
  { key: 'ocean', label: '🌊 Ocean' },
  { key: 'night', label: '🌙 Night' },
]

const THEME_COLORS: Record<ThemeName, {
  wall: string
  path: string
  player: string
  playerBorder: string
  goal: string
  goalBorder: string
  visited: string
  playerEmoji: string
  goalEmoji: string
}> = {
  calm: {
    wall: '#2d4a42',
    path: 'rgba(255,255,255,0.04)',
    player: '#4a7c6f',
    playerBorder: '#b8d4ce',
    goal: 'rgba(200,96,42,0.3)',
    goalBorder: 'rgba(200,96,42,0.6)',
    visited: 'rgba(74,124,111,0.12)',
    playerEmoji: '🧩',
    goalEmoji: '⭐',
  },
  ocean: {
    wall: '#1a3045',
    path: 'rgba(30,80,120,0.15)',
    player: '#2a7ab5',
    playerBorder: '#7ec8e3',
    goal: 'rgba(255,200,50,0.3)',
    goalBorder: 'rgba(255,200,50,0.6)',
    visited: 'rgba(42,122,181,0.15)',
    playerEmoji: '🐠',
    goalEmoji: '🐚',
  },
  night: {
    wall: '#1a1a2e',
    path: 'rgba(100,80,180,0.1)',
    player: '#4a3f8a',
    playerBorder: '#9d8fe0',
    goal: 'rgba(255,220,100,0.25)',
    goalBorder: 'rgba(255,220,100,0.6)',
    visited: 'rgba(74,63,138,0.15)',
    playerEmoji: '🌟',
    goalEmoji: '🌙',
  },
}

const TIME_LIMITS = [60, 90, 120]

function generateMaze(gridSize: number): { maze: number[]; startPos: Pos; goalPos: Pos } {
  const cells = gridSize * gridSize
  const maze = new Array(cells).fill(1)
  const visited = new Set<string>()

  const getIdx = (r: number, c: number) => r * gridSize + c
  const inBounds = (r: number, c: number) => r >= 0 && r < gridSize && c >= 0 && c < gridSize
  const isRoom = (r: number, c: number) => r % 2 === 0 && c % 2 === 0

  const stack: Pos[] = [{ row: 0, col: 0 }]
  maze[getIdx(0, 0)] = 0
  visited.add('0-0')

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    const neighbors: { dr: number; dc: number }[] = []

    for (const [dr, dc] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const nr = current.row + dr
      const nc = current.col + dc
      const key = `${nr}-${nc}`
      if (inBounds(nr, nc) && isRoom(nr, nc) && !visited.has(key)) {
        neighbors.push({ dr, dc })
      }
    }

    if (neighbors.length > 0) {
      const { dr, dc } = neighbors[Math.floor(Math.random() * neighbors.length)]
      const nr = current.row + dr
      const nc = current.col + dc

      const wallR = current.row + dr / 2
      const wallC = current.col + dc / 2
      maze[getIdx(wallR, wallC)] = 0
      maze[getIdx(nr, nc)] = 0
      visited.add(`${nr}-${nc}`)
      stack.push({ row: nr, col: nc })
    } else {
      stack.pop()
    }
  }

  return {
    maze,
    startPos: { row: 0, col: 0 },
    goalPos: { row: gridSize - 1, col: gridSize - 1 },
  }
}

function getRating(wrongMoves: number): { stars: string; text: string } {
  if (wrongMoves <= 2) return { stars: '⭐⭐⭐', text: 'Perfect!' }
  if (wrongMoves <= 5) return { stars: '⭐⭐', text: 'Great job!' }
  return { stars: '⭐', text: 'Keep practising!' }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function VirtualMaze({ sessionId, role, isLocked }: VirtualMazeProps) {
  const isTherapist = role === 'therapist'
  const canInteract = isTherapist || !isLocked

  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [themeName, setThemeName] = useState<ThemeName>('calm')
  const [gridSize, setGridSize] = useState(7)
  const [maze, setMaze] = useState<number[]>([])
  const [playerPos, setPlayerPos] = useState<Pos>({ row: 0, col: 0 })
  const [goalPos, setGoalPos] = useState<Pos>({ row: 0, col: 0 })
  const [visited, setVisited] = useState<string[]>([])
  const [wrongMoves, setWrongMoves] = useState(0)
  const [completed, setCompleted] = useState(false)
  const [completionTime, setCompletionTime] = useState(0)
  const [timerMode, setTimerMode] = useState(false)
  const [timeLimit, setTimeLimit] = useState(60)
  const [timeRemaining, setTimeRemaining] = useState(60)
  const [timeUp, setTimeUp] = useState(false)
  const [mazeReady, setMazeReady] = useState(false)
  const [bumpCell, setBumpCell] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval>>()
  const elapsedRef = useRef<ReturnType<typeof setInterval>>()
  const timeRemainingRef = useRef(timeRemaining)
  timeRemainingRef.current = timeRemaining

  const theme = THEME_COLORS[themeName]

  const writeToFirestore = useCallback(async (data: Record<string, unknown>) => {
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        ...data,
        'timestamps.updatedAt': new Date().toISOString(),
      })
    } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      const s = data.moduleState || {}

      if (Array.isArray(s.vmMaze)) setMaze(s.vmMaze)
      if (typeof s.vmGridSize === 'number') setGridSize(s.vmGridSize)
      if (typeof s.vmDifficulty === 'string') setDifficulty(s.vmDifficulty as Difficulty)
      if (typeof s.vmTheme === 'string') setThemeName(s.vmTheme as ThemeName)
      if (typeof s.vmTimerMode === 'boolean') setTimerMode(s.vmTimerMode)
      if (typeof s.vmTimeLimit === 'number') setTimeLimit(s.vmTimeLimit)
      if (typeof s.vmTimeRemaining === 'number') setTimeRemaining(s.vmTimeRemaining)
      if (typeof s.vmWrongMoves === 'number') setWrongMoves(s.vmWrongMoves)
      if (typeof s.vmCompleted === 'boolean') setCompleted(s.vmCompleted)
      if (typeof s.vmCompletionTime === 'number') setCompletionTime(s.vmCompletionTime)
      if (typeof s.vmTimeUp === 'boolean') setTimeUp(s.vmTimeUp)
      if (Array.isArray(s.vmVisited)) setVisited(s.vmVisited)
      if (typeof s.vmStartPos?.row === 'number') {
        // startPos doesn't change after generation, only set initially
      }
      if (typeof s.vmGoalPos?.row === 'number') {
        setGoalPos(s.vmGoalPos as Pos)
      }
      if (typeof s.vmPlayerPos?.row === 'number') {
        setPlayerPos(s.vmPlayerPos as Pos)
      }
      if (s.vmMaze && s.vmMaze.length > 0) setMazeReady(true)
    })
    return () => unsub()
  }, [sessionId])

  const handleGenerateMaze = useCallback((diff?: Difficulty, newTheme?: ThemeName) => {
    const d = diff || difficulty
    const t = newTheme || themeName
    const size = DIFFICULTY_MAP[d]
    const { maze: newMaze, startPos, goalPos: gp } = generateMaze(size)

    const data: Record<string, unknown> = {
      'moduleState.vmMaze': newMaze,
      'moduleState.vmGridSize': size,
      'moduleState.vmDifficulty': d,
      'moduleState.vmTheme': t,
      'moduleState.vmStartPos': startPos,
      'moduleState.vmGoalPos': gp,
      'moduleState.vmPlayerPos': startPos,
      'moduleState.vmVisited': [],
      'moduleState.vmWrongMoves': 0,
      'moduleState.vmCompleted': false,
      'moduleState.vmCompletionTime': 0,
      'moduleState.vmTimeUp': false,
      'moduleState.vmTimeRemaining': timerMode ? timeLimit : 0,
    }

    writeToFirestore(data)
    setMaze(newMaze)
    setGridSize(size)
    setPlayerPos(startPos)
    setGoalPos(gp)
    setVisited([])
    setWrongMoves(0)
    setCompleted(false)
    setCompletionTime(0)
    setTimeUp(false)
    setStartTime(null)
    setElapsed(0)
    setBumpCell('')
    if (timerMode) setTimeRemaining(timeLimit)
  }, [difficulty, themeName, timerMode, timeLimit, writeToFirestore])

  const handleDifficultyChange = (d: Difficulty) => {
    if (!isTherapist) return
    writeToFirestore({ 'moduleState.vmDifficulty': d })
    setDifficulty(d)
    handleGenerateMaze(d)
  }

  const handleThemeChange = (t: ThemeName) => {
    if (!isTherapist) return
    writeToFirestore({ 'moduleState.vmTheme': t })
    setThemeName(t)
  }

  const handleNewMaze = () => handleGenerateMaze()

  const handleHarder = () => {
    const order: Difficulty[] = ['easy', 'medium', 'hard']
    const idx = order.indexOf(difficulty)
    if (idx < order.length - 1) {
      handleGenerateMaze(order[idx + 1])
    }
  }

  const movePlayer = useCallback((dir: Direction) => {
    if (!canInteract || completed || !mazeReady || timeUp) return

    const delta: Record<Direction, Pos> = {
      up: { row: -1, col: 0 },
      down: { row: 1, col: 0 },
      left: { row: 0, col: -1 },
      right: { row: 0, col: 1 },
    }

    const d = delta[dir]
    const target: Pos = { row: playerPos.row + d.row, col: playerPos.col + d.col }

    if (target.row < 0 || target.row >= gridSize || target.col < 0 || target.col >= gridSize) return

    const targetIdx = target.row * gridSize + target.col

    if (maze[targetIdx] === 1) {
      const newWrong = wrongMoves + 1
      setWrongMoves(newWrong)
      setBumpCell(`${playerPos.row}-${playerPos.col}`)
      setTimeout(() => setBumpCell(''), 250)
      writeToFirestore({ 'moduleState.vmWrongMoves': newWrong })
      return
    }

    const posKey = `${playerPos.row}-${playerPos.col}`
    const newVisited = [...visited, posKey].slice(-100)
    const newPos: Pos = { row: target.row, col: target.col }

    if (!startTime) {
      const now = Date.now()
      setStartTime(now)
    }

    setVisited(newVisited)
    setPlayerPos(newPos)

    const isGoal = newPos.row === goalPos.row && newPos.col === goalPos.col

    if (isGoal) {
      const elapsedSeconds = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0
      setCompleted(true)
      setCompletionTime(elapsedSeconds)
      setBumpCell('')

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance('Amazing! You found the way out!')
        utterance.rate = 1.1
        window.speechSynthesis.speak(utterance)
      }

      writeToFirestore({
        'moduleState.vmPlayerPos': newPos,
        'moduleState.vmVisited': newVisited,
        'moduleState.vmCompleted': true,
        'moduleState.vmCompletionTime': elapsedSeconds,
        'moduleState.vmWrongMoves': wrongMoves,
        'moduleState.vmTimeUp': false,
      })
      logModuleEvent(sessionId, {
        module: 'maze',
        type: 'maze_solved',
        detail: `Solved the maze in ${elapsedSeconds}s with ${wrongMoves} wrong move${wrongMoves === 1 ? '' : 's'}`,
      })
    } else {
      writeToFirestore({
        'moduleState.vmPlayerPos': newPos,
        'moduleState.vmVisited': newVisited,
      })
    }
  }, [canInteract, completed, mazeReady, timeUp, playerPos, gridSize, maze, wrongMoves, visited, goalPos, startTime, writeToFirestore, sessionId])

  const movePlayerRef = useRef(movePlayer)
  movePlayerRef.current = movePlayer

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const dirMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const dir = dirMap[e.key]
      if (dir) {
        e.preventDefault()
        movePlayerRef.current(dir)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current
    if (!start) return
    swipeStartRef.current = null

    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    const minSwipe = 30

    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return

    if (Math.abs(dx) > Math.abs(dy)) {
      movePlayerRef.current(dx > 0 ? 'right' : 'left')
    } else {
      movePlayerRef.current(dy > 0 ? 'down' : 'up')
    }
  }

  // Therapist timer countdown
  useEffect(() => {
    if (!isTherapist || !timerMode || !mazeReady || completed || timeUp) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
      return
    }

    timerRef.current = setInterval(() => {
      const next = timeRemainingRef.current - 1
      if (next <= 0) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
        writeToFirestore({
          'moduleState.vmTimeRemaining': 0,
          'moduleState.vmTimeUp': true,
        })
      } else {
        writeToFirestore({ 'moduleState.vmTimeRemaining': next })
      }
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = undefined
      }
    }
  }, [isTherapist, timerMode, mazeReady, completed, timeUp, writeToFirestore])

  // Elapsed time counter for stats bar
  useEffect(() => {
    if (!startTime || completed) {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current)
        elapsedRef.current = undefined
      }
      return
    }
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [startTime, completed])

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [])

  const pillStyle = (active: boolean) => ({
    padding: '5px 10px',
    borderRadius: 20,
    border: `1px solid ${active ? 'var(--sage)' : 'var(--glass-border)'}`,
    background: active ? 'var(--sage-light)' : 'transparent',
    color: active ? 'var(--sage-mid)' : 'var(--ink-muted)',
    fontSize: 10,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  const statsRow = (
    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 16, justifyContent: 'center', padding: '6px 0' }}>
      <span>⏱️ {formatTime(elapsed)}</span>
      <span>🚫 {wrongMoves} wrong</span>
      <span>📍 {visited.length} cells</span>
    </div>
  )

  const renderCell = (idx: number) => {
    const row = Math.floor(idx / gridSize)
    const col = idx % gridSize
    const isPlayerCell = playerPos.row === row && playerPos.col === col
    const isGoalCell = goalPos.row === row && goalPos.col === col && !isPlayerCell
    const isWall = maze[idx] === 1
    const isVisited = visited.includes(`${row}-${col}`) && !isPlayerCell
    const isBumping = bumpCell === `${row}-${col}`

    let bg = theme.path
    let border = 'none'
    let emoji = ''
    let extraStyle: React.CSSProperties = {}

    if (isWall) {
      bg = theme.wall
      border = '0.5px solid rgba(0,0,0,0.2)'
    } else if (isPlayerCell) {
      bg = theme.player
      border = `2px solid ${theme.playerBorder}`
      emoji = theme.playerEmoji
      extraStyle.borderRadius = 6
      extraStyle.transition = 'all 0.15s ease'
    } else if (isGoalCell) {
      bg = theme.goal
      border = `2px solid ${theme.goalBorder}`
      emoji = theme.goalEmoji
    } else if (isVisited) {
      bg = theme.visited
    }

    if (isBumping) {
      extraStyle.animation = 'vmWallBump 0.25s ease'
    }

    const cellSize = Math.min(360 / gridSize, 42)

    return (
      <div
        key={idx}
        style={{
          width: '100%',
          aspectRatio: '1',
          background: bg,
          border,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(cellSize * 0.35, 10),
          boxSizing: 'border-box',
          ...extraStyle,
        }}
      >
        {emoji}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`
        @keyframes vmWallBump {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(0.85); }
          70% { transform: scale(1.05); }
        }
        @keyframes vmFloatUp {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-60px) scale(1.5); }
        }
        @keyframes vmTimerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* Therapist controls */}
      {isTherapist && (
        <div style={{ flexShrink: 0, padding: '0 0 6px 0' }}>
          {/* Difficulty */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {DIFFICULTY_LABELS.map((d) => (
              <button key={d.key} onClick={() => handleDifficultyChange(d.key)} style={pillStyle(difficulty === d.key)}>
                {d.label}
              </button>
            ))}
          </div>

          {/* Theme */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {THEME_LIST.map((t) => (
              <button key={t.key} onClick={() => handleThemeChange(t.key)} style={pillStyle(themeName === t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Timer */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => {
              const next = !timerMode
              setTimerMode(next)
              writeToFirestore({ 'moduleState.vmTimerMode': next })
            }} style={pillStyle(timerMode)}>
              ⏱ Timer {timerMode ? 'On' : 'Off'}
            </button>
            {timerMode && TIME_LIMITS.map((t) => (
              <button key={t} onClick={() => {
                setTimeLimit(t)
                writeToFirestore({ 'moduleState.vmTimeLimit': t })
                setTimeRemaining(t)
              }} style={pillStyle(timeLimit === t)}>
                {t}s
              </button>
            ))}
          </div>

          {/* New Maze */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button onClick={handleNewMaze} style={{
              ...pillStyle(false),
              background: 'var(--sage-light)',
              color: 'var(--sage-mid)',
              fontWeight: 600,
            }}>
              🗺️ New Maze
            </button>
          </div>

          {/* Stats bar */}
          {mazeReady && !completed && statsRow}
        </div>
      )}

      {/* No maze yet */}
      {!mazeReady && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isTherapist ? (
            <button onClick={() => handleGenerateMaze()} style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: '1px solid var(--sage)',
              background: 'var(--sage-light)',
              color: 'var(--sage-mid)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}>
              🗺️ Generate Maze
            </button>
          ) : (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-muted)' }}>
              Waiting for therapist to set up the maze...
            </div>
          )}
        </div>
      )}

      {/* Maze content */}
      {mazeReady && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Timer countdown */}
          {timerMode && !completed && (
            <div style={{
              textAlign: 'center',
              padding: '4px 0',
              fontFamily: "'DM Serif Display', serif",
              fontSize: 20,
              color: timeRemaining <= 10 ? '#c8602a' : 'rgba(255,255,255,0.8)',
              animation: timeRemaining <= 10 ? 'vmTimerPulse 1s ease infinite' : 'none',
              flexShrink: 0,
            }}>
              {formatTime(timeRemaining)}
            </div>
          )}

          {/* Maze grid area */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            padding: '0 4px',
          }}>
            {completed && !timeUp ? (
              /* Completion overlay */
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                padding: 20,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#fff', marginBottom: 12 }}>
                    🎉 Maze Complete!
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                    Time: {formatTime(completionTime)}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                    Wrong moves: {wrongMoves}
                  </div>
                  <div style={{ fontSize: 14, color: '#fff', marginBottom: 16 }}>
                    {getRating(wrongMoves).stars} {getRating(wrongMoves).text}
                  </div>
                  {isTherapist && (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={() => { handleGenerateMaze() }} style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: '1px solid var(--sage)',
                        background: 'var(--sage-light)',
                        color: 'var(--sage-mid)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}>
                        New Maze
                      </button>
                      {difficulty !== 'hard' && (
                        <button onClick={handleHarder} style={{
                          padding: '8px 16px',
                          borderRadius: 8,
                          border: '1px solid var(--glass-border)',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}>
                          Harder
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {timeUp ? (
              /* Time's up overlay */
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                padding: 20,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#c8602a', marginBottom: 12 }}>
                    ⏰ Time&apos;s Up!
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                    Wrong moves: {wrongMoves}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
                    Cells visited: {visited.length}
                  </div>
                  <button onClick={() => {
                    handleGenerateMaze()
                  }} style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: '1px solid var(--sage)',
                    background: 'var(--sage-light)',
                    color: 'var(--sage-mid)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}>
                    Try Again
                  </button>
                </div>
              </div>
            ) : null}

            <div
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                width: '100%',
                maxWidth: 380,
                gap: 0,
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {maze.map((_, idx) => renderCell(idx))}
            </div>
          </div>

          {/* Direction buttons + lock overlay */}
          <div style={{ flexShrink: 0, padding: '6px 0 0 0', position: 'relative' }}>
            {!canInteract && mazeReady && !completed && !timeUp && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
                fontSize: 11,
                color: 'var(--ink-muted)',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 10,
              }}>
                Therapist is controlling
              </div>
            )}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 44px)',
              gridTemplateRows: 'repeat(3, 44px)',
              gap: 4,
              justifyContent: 'center',
              padding: '4px 0',
            }}>
              {['', 'up', '', 'left', '', 'right', '', 'down', ''].map((dir, i) => {
                const d = dir as Direction | ''
                if (!d) return <div key={i} style={{ width: 44, height: 44 }} />
                return (
                  <button
                    key={i}
                    onMouseDown={() => movePlayer(d)}
                    onTouchStart={(e) => { e.preventDefault(); movePlayer(d) }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 18,
                      cursor: canInteract ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s',
                      opacity: canInteract ? 1 : 0.3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                    }}
                  >
                    {d === 'up' && '↑'}
                    {d === 'down' && '↓'}
                    {d === 'left' && '←'}
                    {d === 'right' && '→'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
