'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface SimonSaysProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface Command { text: string; emoji: string; hasSimonSays: boolean }

const COMMAND_ACTIONS: { text: string; emoji: string }[] = [
  { text: 'Clap your hands', emoji: '👏' },
  { text: 'Touch your nose', emoji: '👃' },
  { text: 'Stand up', emoji: '🧍' },
  { text: 'Wave hello', emoji: '👋' },
  { text: 'Jump once', emoji: '🦘' },
  { text: 'Blink slowly', emoji: '👁️' },
  { text: 'Nod your head', emoji: '🙂' },
  { text: 'Tap your knees', emoji: '🦵' },
  { text: 'Smile big', emoji: '😁' },
  { text: 'Take a deep breath', emoji: '🌬️' },
  { text: 'Point to the sky', emoji: '☝️' },
  { text: 'Shake your hands', emoji: '🤲' },
]

const BUTTONS = ['green', 'red', 'yellow', 'blue']
const BUTTON_STYLES: Record<string, { bg: string; active: string; border: string; emoji: string }> = {
  green:  { bg: 'rgba(46,204,113,0.3)', active: 'rgba(46,204,113,0.85)', border: 'rgba(46,204,113,0.5)', emoji: '🟢' },
  red:    { bg: 'rgba(231,76,60,0.3)',  active: 'rgba(231,76,60,0.85)',  border: 'rgba(231,76,60,0.5)',  emoji: '🔴' },
  yellow: { bg: 'rgba(241,196,15,0.3)', active: 'rgba(241,196,15,0.85)', border: 'rgba(241,196,15,0.5)', emoji: '🟡' },
  blue:   { bg: 'rgba(52,152,219,0.3)', active: 'rgba(52,152,219,0.85)', border: 'rgba(52,152,219,0.5)', emoji: '🔵' },
}

function genSeq(len: number): string[] {
  return Array.from({ length: len }, () => BUTTONS[Math.floor(Math.random() * 4)])
}

function genCmdList(ratio: string): Command[] {
  const trapPct = ratio === 'low' ? 0.3 : ratio === 'high' ? 0.7 : 0.5
  return Array.from({ length: 20 }, () => {
    const a = COMMAND_ACTIONS[Math.floor(Math.random() * COMMAND_ACTIONS.length)]
    return { ...a, hasSimonSays: Math.random() > trapPct }
  })
}

function starRating(n: number): string {
  if (n < 5) return '⭐'
  if (n <= 8) return '⭐⭐'
  return '⭐⭐⭐'
}

export default function SimonSays({ sessionId, role, isLocked }: SimonSaysProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [mode, setMode] = useState<'classic' | 'simon-says'>('classic')
  const [difficulty, setDifficulty] = useState('medium')
  const [speed, setSpeed] = useState(800)
  const [startLen, setStartLen] = useState(2)
  const [cmdSpeed, setCmdSpeed] = useState(2000)
  const [trapRatio, setTrapRatio] = useState('medium')
  const [livesTotal, setLivesTotal] = useState(3)
  const [livesRem, setLivesRem] = useState(3)
  const [isPlaying, setIsPlaying] = useState(false)
  const [score, setScore] = useState(0)
  const [bestRound, setBestRound] = useState(0)
  const [seq, setSeq] = useState<string[]>([])
  const [round, setRound] = useState(1)
  const [childIn, setChildIn] = useState<string[]>([])
  const [isPlaySeq, setIsPlaySeq] = useState(false)
  const [litIdx, setLitIdx] = useState(-1)
  const [cmdIdx, setCmdIdx] = useState(-1)
  const [cmdList, setCmdList] = useState<Command[]>([])
  const [trapsAv, setTrapsAv] = useState(0)
  const [trapsHit, setTrapsHit] = useState(0)
  const [gameOver, setGameOver] = useState(false)

  const [feedback, setFeedback] = useState<{ type: 'correct' | 'wrong' | 'gold'; msg: string } | null>(null)
  const [countPct, setCountPct] = useState(100)
  const [livesAnim, setLivesAnim] = useState<Set<number>>(new Set())
  const [lastCmdIdx, setLastCmdIdx] = useState(-1)
  const [animateKey, setAnimateKey] = useState(0)
  const [toast, setToast] = useState<{ msg: string } | null>(null)

  const tmr = useRef<ReturnType<typeof setInterval>>()
  const toastT = useRef<ReturnType<typeof setTimeout>>()
  const fbT = useRef<ReturnType<typeof setTimeout>>()
  const playedRef = useRef(false)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (s.ssMode === 'classic' || s.ssMode === 'simon-says') setMode(s.ssMode)
      if (typeof s.ssDifficulty === 'string') setDifficulty(s.ssDifficulty)
      if (typeof s.ssSpeed === 'number') setSpeed(s.ssSpeed)
      if (typeof s.ssStartLength === 'number') setStartLen(s.ssStartLength)
      if (typeof s.ssCommandSpeed === 'number') setCmdSpeed(s.ssCommandSpeed)
      if (typeof s.ssTrapRatio === 'string') setTrapRatio(s.ssTrapRatio)
      if (typeof s.ssLivesTotal === 'number') setLivesTotal(s.ssLivesTotal)
      if (typeof s.ssLivesRemaining === 'number') setLivesRem(s.ssLivesRem)
      if (typeof s.ssIsPlaying === 'boolean') setIsPlaying(s.ssIsPlaying)
      if (typeof s.ssScore === 'number') setScore(s.ssScore)
      if (Array.isArray(s.ssSequence)) setSeq(s.ssSequence)
      if (typeof s.ssCurrentRound === 'number') setRound(s.ssCurrentRound)
      if (Array.isArray(s.ssChildInput)) setChildIn(s.ssChildInput)
      if (typeof s.ssIsPlayingSequence === 'boolean') setIsPlaySeq(s.ssIsPlayingSequence)
      if (typeof s.ssLitButtonIndex === 'number') setLitIdx(s.ssLitButtonIndex)
      if (typeof s.ssBestRound === 'number') setBestRound(s.ssBestRound)
      if (typeof s.ssCommandIndex === 'number') setCmdIdx(s.ssCommandIndex)
      if (Array.isArray(s.ssCommandList)) setCmdList(s.ssCommandList as Command[])
      if (typeof s.ssTrapsAvoided === 'number') setTrapsAv(s.ssTrapsAvoided)
      if (typeof s.ssTrapsHit === 'number') setTrapsHit(s.ssTrapsHit)
      if (typeof s.ssGameOver === 'boolean') setGameOver(s.ssGameOver)
    })
    return () => unsub()
  }, [sessionId])

  // Clear all timers on unmount
  useEffect(() => () => {
    if (tmr.current) clearInterval(tmr.current)
    if (toastT.current) clearTimeout(toastT.current)
    if (fbT.current) clearTimeout(fbT.current)
    window.speechSynthesis?.cancel()
  }, [])

  const showFeedback = useCallback((type: 'correct' | 'wrong' | 'gold', msg: string) => {
    setFeedback({ type, msg })
    if (fbT.current) clearTimeout(fbT.current)
    fbT.current = setTimeout(() => setFeedback(null), 1200)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast({ msg })
    if (toastT.current) clearTimeout(toastT.current)
    toastT.current = setTimeout(() => setToast(null), 1500)
  }, [])

  const clearTimer = useCallback(() => {
    if (tmr.current) { clearInterval(tmr.current); tmr.current = undefined }
  }, [])

  // --- Classic Mode ---
  const newRound = useCallback((s: string[], r: number) => {
    clearTimer()
    write({
      'moduleState.ssSequence': s,
      'moduleState.ssCurrentRound': r,
      'moduleState.ssChildInput': [],
      'moduleState.ssIsPlayingSequence': true,
      'moduleState.ssLitButtonIndex': 0,
    })
    setLitIdx(0)
    let i = 0
    tmr.current = setInterval(() => {
      i++
      if (i >= s.length) {
        clearInterval(tmr.current!); tmr.current = undefined
        write({ 'moduleState.ssLitButtonIndex': -1, 'moduleState.ssIsPlayingSequence': false })
        return
      }
      write({ 'moduleState.ssLitButtonIndex': i })
    }, speed)
  }, [speed, write, clearTimer])

  const startClassic = useCallback(() => {
    if (!isT) return
    const s = genSeq(startLen)
    setGameOver(false)
    setScore(0)
    setLivesRem(livesTotal)
    newRound(s, 1)
  }, [isT, startLen, livesTotal, newRound])

  const handleClassicTap = useCallback((color: string) => {
    if (isT || !canInteract || isPlaySeq || gameOver || !isPlaying) return
    const next = [...childIn, color]
    const idx = next.length - 1
    const isCorrect = next[idx] === seq[idx]
    if (!isCorrect) {
      const nl = livesRem - 1
      setLivesAnim(prev => new Set(prev).add(livesRem - 1))
      setTimeout(() => setLivesAnim(prev => { const n = new Set(prev); n.delete(livesRem - 1); return n }), 450)
      showFeedback('wrong', 'Oops! ✗')
      showToast('Wrong!')
      write({ 'moduleState.ssLivesRemaining': nl, 'moduleState.ssChildInput': next })
      if (nl <= 0) {
        clearTimer()
        const b = Math.max(bestRound, round)
        write({ 'moduleState.ssGameOver': true, 'moduleState.ssBestRound': b, 'moduleState.ssIsPlaying': false })
        return
      }
      setTimeout(() => newRound(seq, round), 1000)
      return
    }
    if (next.length === seq.length) {
      const ns = score + 1
      showFeedback('correct', '✓ Amazing!')
      showToast('Correct!')
      const nr = round + 1
      const b = Math.max(bestRound, nr)
      const newSeq = [...seq, BUTTONS[Math.floor(Math.random() * 4)]]
      write({ 'moduleState.ssScore': ns, 'moduleState.ssCurrentRound': nr, 'moduleState.ssChildInput': next, 'moduleState.ssBestRound': b })
      setTimeout(() => newRound(newSeq, nr), 1200)
      return
    }
    write({ 'moduleState.ssChildInput': next })
  }, [canInteract, isPlaySeq, gameOver, isPlaying, childIn, seq, livesRem, score, bestRound, round, speed, write, showFeedback, showToast, clearTimer, newRound])

  // --- Simon Says Mode ---
  const startSimonSays = useCallback(() => {
    if (!isT) return
    const list = genCmdList(trapRatio)
    setGameOver(false)
    setScore(0)
    setLivesRem(livesTotal)
    setTrapsAv(0)
    setTrapsHit(0)
    write({
      'moduleState.ssCommandList': list,
      'moduleState.ssCommandIndex': 0,
      'moduleState.ssScore': 0,
      'moduleState.ssLivesRemaining': livesTotal,
      'moduleState.ssTrapsAvoided': 0,
      'moduleState.ssTrapsHit': 0,
      'moduleState.ssGameOver': false,
    })
    let i = 0
    tmr.current = setInterval(() => {
      i++
      if (i >= list.length) {
        clearInterval(tmr.current!); tmr.current = undefined
        write({ 'moduleState.ssIsPlaying': false })
        return
      }
      write({ 'moduleState.ssCommandIndex': i })
    }, cmdSpeed)
  }, [isT, trapRatio, livesTotal, cmdSpeed, write])

  const currentCmd = cmdIdx >= 0 && cmdIdx < cmdList.length ? cmdList[cmdIdx] : null

  // Countdown bar
  useEffect(() => {
    if (mode !== 'simon-says' || cmdIdx < 0 || !isPlaying || gameOver) return
    if (cmdIdx !== lastCmdIdx) {
      setLastCmdIdx(cmdIdx)
      setAnimateKey(prev => prev + 1)
      setCountPct(100)
      const raf = requestAnimationFrame(() => {
        setCountPct(0)
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [cmdIdx, mode, isPlaying, gameOver, lastCmdIdx])

  const handleSimonRespond = useCallback((doIt: boolean) => {
    if (isT || !canInteract || !currentCmd || gameOver || !isPlaying) return
    const shouldDoIt = currentCmd.hasSimonSays
    if (doIt === shouldDoIt) {
      const ns = score + 1
      let nta = trapsAv
      if (!shouldDoIt) nta = trapsAv + 1
      const type = doIt && shouldDoIt ? 'correct' : 'gold'
      const msg = doIt && shouldDoIt ? '✓ Correct!' : shouldDoIt ? 'You should have done it!' : 'Great self-control! 💪'
      if (type === 'gold') setTrapsAv(nta)
      showFeedback(type, msg)
      showToast(msg)
      write({ 'moduleState.ssScore': ns, 'moduleState.ssTrapsAvoided': nta })
    } else {
      const nl = livesRem - 1
      setLivesAnim(prev => new Set(prev).add(livesRem - 1))
      setTimeout(() => setLivesAnim(prev => { const n = new Set(prev); n.delete(livesRem - 1); return n }), 450)
      let nta = trapsAv
      let nth = trapsHit
      const msg = shouldDoIt ? 'You should have done it!' : 'Simon didn\'t say! 🪤'
      if (!shouldDoIt) nth = trapsHit + 1
      showFeedback('wrong', msg)
      showToast(msg)
      write({ 'moduleState.ssLivesRemaining': nl, 'moduleState.ssScore': score, 'moduleState.ssTrapsHit': nth, 'moduleState.ssTrapsAvoided': nta })
      if (nl <= 0) {
        clearTimer()
        write({ 'moduleState.ssGameOver': true, 'moduleState.ssIsPlaying': false })
      }
    }
  }, [canInteract, currentCmd, gameOver, isPlaying, score, trapsAv, trapsHit, livesRem, write, showFeedback, showToast, clearTimer])

  // Keyboard handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'simon-says' || !isPlaying || gameOver || isT) return
      if (e.code === 'Space') { e.preventDefault(); handleSimonRespond(true) }
      else if (e.code === 'Backspace' || e.code === 'Escape') { e.preventDefault(); handleSimonRespond(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, isPlaying, gameOver, isT, handleSimonRespond])

  // Log the sequencing result once when a game ends (therapist browser only).
  const loggedOverRef = useRef(false)
  useEffect(() => {
    if (gameOver && isT && !loggedOverRef.current) {
      loggedOverRef.current = true
      logModuleEvent(sessionId, {
        module: 'simon-says',
        type: 'game_over',
        detail: `Finished a Simon Says round (best sequence length ${Math.max(bestRound, round)}, score ${score})`,
      })
    }
    if (!gameOver) loggedOverRef.current = false
  }, [gameOver, isT, sessionId, bestRound, round, score])

  const handleStart = useCallback(() => {
    if (!isT) return
    write({ 'moduleState.ssIsPlaying': true })
    if (mode === 'classic') startClassic()
    else startSimonSays()
  }, [isT, mode, startClassic, startSimonSays, write])

  const handlePause = useCallback(() => {
    if (!isT) return
    clearTimer()
    write({ 'moduleState.ssIsPlaying': false })
  }, [isT, clearTimer, write])

  const handleReset = useCallback(() => {
    if (!isT) return
    clearTimer()
    write({
      'moduleState.ssIsPlaying': false,
      'moduleState.ssScore': 0,
      'moduleState.ssLivesRemaining': livesTotal,
      'moduleState.ssSequence': [],
      'moduleState.ssCurrentRound': 1,
      'moduleState.ssChildInput': [],
      'moduleState.ssIsPlayingSequence': false,
      'moduleState.ssLitButtonIndex': -1,
      'moduleState.ssCommandIndex': -1,
      'moduleState.ssCommandList': [],
      'moduleState.ssTrapsAvoided': 0,
      'moduleState.ssTrapsHit': 0,
      'moduleState.ssGameOver': false,
    })
    setGameOver(false)
    setLitIdx(-1)
    setCmdIdx(-1)
  }, [isT, clearTimer, write, livesTotal])

  const handlePlayAgain = useCallback(() => {
    if (!isT) return
    setGameOver(false)
    write({ 'moduleState.ssGameOver': false, 'moduleState.ssScore': 0, 'moduleState.ssLivesRemaining': livesTotal })
    handleStart()
  }, [isT, livesTotal, write, handleStart])

  const cmdBarColor = countPct > 60 ? '#4a7c6f' : countPct > 30 ? '#f7c948' : '#c8602a'

  return (
    <>
      <style>{`
        @keyframes ci{0%{transform:scale(.9)translateY(10px);opacity:0}100%{transform:scale(1)translateY(0);opacity:1}}
        @keyframes hl{0%{transform:scale(1.3);opacity:1}100%{transform:scale(0);opacity:0}}
        @keyframes flashG{0%,100%{box-shadow:0 0 0 rgba(46,204,113,0)}50%{box-shadow:0 0 24px rgba(46,204,113,.6)}}
        @keyframes flashR{0%,100%{box-shadow:0 0 0 rgba(231,76,60,0)}50%{box-shadow:0 0 24px rgba(231,76,60,.6)}}
        .ci-a{animation:ci .3s ease}
      `}</style>

      {/* Therapist controls */}
      {isT && (
        <div style={{ flexShrink: 0, padding: '6px 10px', borderBottom: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => write({ 'moduleState.ssMode': 'classic' })}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                border: mode === 'classic' ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: mode === 'classic' ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.04)',
                color: mode === 'classic' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              }}
            >🎨 Classic Simon</button>
            <button onClick={() => write({ 'moduleState.ssMode': 'simon-says' })}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                border: mode === 'simon-says' ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: mode === 'simon-says' ? 'rgba(74,124,111,0.15)' : 'rgba(255,255,255,0.04)',
                color: mode === 'simon-says' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
              }}
            >🗣️ Simon Says</button>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Difficulty:</span>
            {['easy', 'medium', 'hard'].map(d => (
              <button key={d} onClick={() => {
                const sp = d === 'easy' ? 1200 : d === 'hard' ? 500 : 800
                const cs = d === 'easy' ? 3000 : d === 'hard' ? 1200 : 2000
                const lt = d === 'easy' ? 5 : d === 'hard' ? 3 : 3
                write({ 'moduleState.ssDifficulty': d, 'moduleState.ssSpeed': sp, 'moduleState.ssCommandSpeed': cs, 'moduleState.ssLivesTotal': lt, 'moduleState.ssLivesRemaining': lt })
              }}
                style={{
                  padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 9, textTransform: 'capitalize',
                  border: difficulty === d ? '1px solid rgba(74,124,111,0.6)' : '1px solid rgba(255,255,255,0.08)',
                  background: difficulty === d ? 'rgba(74,124,111,0.15)' : 'transparent',
                  color: difficulty === d ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                }}
              >{d}</button>
            ))}
            {mode === 'classic' && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>Speed:</span>
                {['Slow', 'Normal', 'Fast'].map((l, i) => {
                  const v = [1200, 800, 500][i]
                  return <button key={l} onClick={() => write({ 'moduleState.ssSpeed': v })}
                    style={{ padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, border: speed === v ? '1px solid rgba(74,124,111,0.5)' : '1px solid rgba(255,255,255,0.08)', background: speed === v ? 'rgba(74,124,111,0.15)' : 'transparent', color: speed === v ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}
                  >{l}</button>
                })}
              </>
            )}
            {mode === 'simon-says' && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>Traps:</span>
                {['low', 'medium', 'high'].map(r => (
                  <button key={r} onClick={() => write({ 'moduleState.ssTrapRatio': r })}
                    style={{ padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 9, textTransform: 'capitalize', border: trapRatio === r ? '1px solid rgba(74,124,111,0.5)' : '1px solid rgba(255,255,255,0.08)', background: trapRatio === r ? 'rgba(74,124,111,0.15)' : 'transparent', color: trapRatio === r ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)' }}
                  >{r}</button>
                ))}
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isPlaying ? (
              <button onClick={handleStart}
                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(74,124,111,0.5)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 11 }}
              >▶ Start</button>
            ) : (
              <button onClick={handlePause}
                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 11 }}
              >⏸ Pause</button>
            )}
            <button onClick={handleReset}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(200,60,60,0.3)', background: 'transparent', color: 'rgba(200,80,80,0.7)', cursor: 'pointer', fontSize: 10 }}
            >↺ Reset</button>
          </div>
        </div>
      )}

      {/* Waiting */}
      {!isPlaying && !gameOver && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          {isT ? 'Press Start to begin' : 'Get ready! Your therapist is starting...'}
        </div>
      )}

      {/* Game area */}
      {isPlaying && mode === 'classic' && !gameOver && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
          {/* 2x2 grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, position: 'relative' }}>
            {BUTTONS.map((color, i) => {
              const st = BUTTON_STYLES[color]
              const isLit = litIdx === i
              return (
                <div key={color} onClick={() => handleClassicTap(color)}
                  style={{
                    borderRadius: 18,
                    background: isLit ? st.active : st.bg,
                    border: `2px solid ${st.border}`,
                    cursor: canInteract && !isPlaySeq ? 'pointer' : 'default',
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                    boxShadow: isLit ? `0 0 20px ${st.border}` : 'none',
                    transform: isLit ? 'scale(1.04)' : 'scale(1)',
                    pointerEvents: isPlaySeq ? 'none' : 'auto',
                    userSelect: 'none', WebkitUserSelect: 'none',
                  }}
                >
                  {st.emoji}
                </div>
              )
            })}
            {/* Center score */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 600, color: '#fff', zIndex: 5,
              backdropFilter: 'blur(4px)',
            }}>
              {round}
            </div>
          </div>
          {/* Turn indicator */}
          <div style={{ textAlign: 'center', fontSize: 11, color: isPlaySeq ? 'rgba(255,255,255,0.3)' : '#b8d4ce' }}>
            {isPlaySeq ? 'Watch the sequence...' : 'Your turn! Repeat the pattern'}
          </div>
          {/* Score + Lives */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: livesTotal }, (_, i) => (
                <span key={i} className={livesAnim.has(i) ? '' : ''}
                  style={{
                    fontSize: 14, transition: 'all 0.3s',
                    animation: livesAnim.has(i) ? 'hl 0.4s ease forwards' : 'none',
                  }}
                >{i < livesRem ? '❤️' : '🖤'}</span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              Round {round} · {score} correct
            </div>
          </div>
        </div>
      )}

      {isPlaying && mode === 'simon-says' && !gameOver && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}>
          {/* Command card */}
          {currentCmd && (
            <div key={animateKey} className="ci-a" style={{
              width: '100%', minHeight: 130, borderRadius: 16,
              background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: 16, flex: 1,
            }}>
              {currentCmd.hasSimonSays ? (
                <div style={{ fontSize: 12, fontWeight: 500, color: '#b8d4ce' }}>Simon says...</div>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>&nbsp;</div>
              )}
              <div style={{ fontSize: 22, fontFamily: '"DM Serif Display", serif', color: '#fff', textAlign: 'center', lineHeight: 1.3 }}>
                {currentCmd.text} {currentCmd.emoji}
              </div>
              {/* Countdown bar */}
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', marginTop: 4 }}>
                <div style={{
                  width: `${countPct}%`, height: '100%', borderRadius: 2,
                  background: cmdBarColor,
                  transition: `width ${cmdSpeed}ms linear`,
                }} />
              </div>
            </div>
          )}
          {/* Response buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => handleSimonRespond(true)}
              style={{
                flex: 1, height: 48, borderRadius: 12, cursor: canInteract ? 'pointer' : 'default',
                background: 'rgba(46,204,113,0.2)', border: '1.5px solid rgba(46,204,113,0.4)',
                color: 'rgba(46,204,113,0.9)', fontSize: 14, fontWeight: 600,
              }}
            >✅ DO IT!</button>
            <button onClick={() => handleSimonRespond(false)}
              style={{
                flex: 1, height: 48, borderRadius: 12, cursor: canInteract ? 'pointer' : 'default',
                background: 'rgba(231,76,60,0.15)', border: '1.5px solid rgba(231,76,60,0.35)',
                color: 'rgba(231,76,60,0.8)', fontSize: 14, fontWeight: 600,
              }}
            >❌ SKIP!</button>
          </div>
          {/* Score + Lives */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: livesTotal }, (_, i) => (
                <span key={i}
                  style={{ fontSize: 14, animation: livesAnim.has(i) ? 'hl 0.4s ease forwards' : 'none' }}
                >{i < livesRem ? '❤️' : '🖤'}</span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              ✓ {score} · 🪤 {trapsAv} traps dodged
            </div>
          </div>
        </div>
      )}

      {/* Feedback flash */}
      {feedback && (
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)',
          fontSize: 16, fontWeight: 600, zIndex: 30, pointerEvents: 'none',
          color: feedback.type === 'correct' ? 'rgba(46,204,113,0.9)' : feedback.type === 'gold' ? '#f7c948' : 'rgba(231,76,60,0.9)',
        }}>
          {feedback.msg}
        </div>
      )}

      {/* Game Over overlays */}
      {gameOver && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 50, padding: 20,
        }}>
          <div style={{ fontSize: 28 }}>🎮</div>
          <div style={{ fontSize: 18, fontFamily: '"DM Serif Display", serif', color: '#fff' }}>Game Over!</div>
          {mode === 'classic' ? (
            <>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                You reached round {round}<br />
                Best this session: {Math.max(bestRound, round)}
              </div>
              <div style={{ fontSize: 16 }}>{starRating(Math.max(bestRound, round))}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                {score} correct out of {cmdList.length} commands<br />
                Traps dodged: {trapsAv}<br />
                Fell for traps: {trapsHit}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                {cmdList.length > 0 ? (trapsAv / Math.max(1, trapsAv + trapsHit) > 0.8 ? 'Amazing self-control! ⭐⭐⭐' : trapsAv / Math.max(1, trapsAv + trapsHit) > 0.6 ? 'Great job! ⭐⭐' : 'Keep practising! ⭐') : '⭐'}
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePlayAgain}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(74,124,111,0.4)', background: 'rgba(74,124,111,0.2)', color: '#b8d4ce', cursor: 'pointer', fontSize: 12 }}
            >Play again</button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', borderRadius: 10,
          padding: '6px 14px', color: '#fff', fontSize: 12, zIndex: 100, pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}
