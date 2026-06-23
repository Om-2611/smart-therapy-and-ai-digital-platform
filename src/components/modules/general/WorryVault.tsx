'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

interface WorryVaultProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface Worry { id: string; text: string; locked: boolean }

const MAX_CHARS = 120

export default function WorryVault({ sessionId, role, isLocked }: WorryVaultProps) {
  const isT = role === 'therapist'
  const canInteract = isT || !isLocked

  const [worries, setWorries] = useState<Worry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [vaultOpen, setVaultOpen] = useState(false)

  const [text, setText] = useState('')
  const [settling, setSettling] = useState<string | null>(null)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (Array.isArray(s.wvWorries)) setWorries(s.wvWorries)
      setSelected(typeof s.wvSelectedWorry === 'string' ? s.wvSelectedWorry : null)
      if (typeof s.wvVaultOpen === 'boolean') setVaultOpen(s.wvVaultOpen)
    })
    return () => unsub()
  }, [sessionId])

  const addWorry = useCallback(() => {
    const t = text.trim()
    if (!t || !canInteract) return
    const w: Worry = { id: `wv${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, locked: false }
    write({ 'moduleState.wvWorries': [...worries, w] })
    logModuleEvent(sessionId, {
      module: 'worry-vault',
      type: 'worry_locked',
      detail: `Locked a worry in the vault for later: "${t}"`,
    })
    setText('')
    // timed delay — worry "settles in" then locks
    setSettling(w.id)
    setTimeout(() => {
      setSettling(null)
      const updated = [...worries, w].map(x => x.id === w.id ? { ...x, locked: true } : x)
      write({ 'moduleState.wvWorries': updated })
    }, 1600)
  }, [text, canInteract, worries, write, sessionId])

  const reopenWorry = useCallback((id: string) => {
    if (!isT) return
    write({ 'moduleState.wvSelectedWorry': id, 'moduleState.wvVaultOpen': true })
  }, [isT, write])

  const closeVault = useCallback(() => {
    if (!isT) return
    write({ 'moduleState.wvSelectedWorry': null, 'moduleState.wvVaultOpen': false })
  }, [isT, write])

  const releaseSelected = useCallback(() => {
    if (!isT || !selected) return
    const releasedText = worries.find(w => w.id === selected)?.text
    write({ 'moduleState.wvWorries': worries.filter(w => w.id !== selected), 'moduleState.wvSelectedWorry': null, 'moduleState.wvVaultOpen': false })
    if (releasedText) {
      logModuleEvent(sessionId, {
        module: 'worry-vault',
        type: 'worry_released',
        detail: `Let go of a vaulted worry: "${releasedText}"`,
      })
    }
  }, [isT, selected, worries, write, sessionId])

  const selectedWorry = worries.find(w => w.id === selected)
  const lockedWorries = worries.filter(w => w.locked && w.id !== selected)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 4px 12px', fontFamily: '"DM Sans", sans-serif' }}>
      <style>{`
        @keyframes wv-glow { 0%,100%{box-shadow:0 0 8px rgba(107,92,231,0.35)} 50%{box-shadow:0 0 16px rgba(107,92,231,0.6)} }
        @keyframes wv-settle { 0%{transform:translateY(-30px) scale(1);opacity:1} 100%{transform:translateY(0) scale(0.85);opacity:0.7} }
        @keyframes wv-float { 0%{transform:translateY(20px);opacity:0} 100%{transform:translateY(0);opacity:1} }
      `}</style>

      <div style={{ textAlign: 'center', fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
        🔐 Worry Vault
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        Not ignoring — just not now. Lock worries away and reopen one when you&apos;re ready.
      </div>

      {/* Add worry */}
      {!vaultOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, MAX_CHARS))} placeholder="What's on your mind?"
            disabled={!canInteract} maxLength={MAX_CHARS}
            style={{ minHeight: 56, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'rgba(255,255,255,0.9)', resize: 'none', outline: 'none', fontFamily: '"DM Sans", sans-serif' }} />
          <button onClick={addWorry} disabled={!canInteract || !text.trim()}
            style={{ ...btnStyle, opacity: canInteract && text.trim() ? 1 : 0.4, background: 'rgba(107,92,231,0.22)', borderColor: 'rgba(107,92,231,0.4)', color: '#c5bdf5' }}>
            Lock it in the vault →
          </button>
        </div>
      )}

      {/* Vault visual */}
      <div style={{
        position: 'relative', borderRadius: 14, padding: 16,
        background: 'linear-gradient(135deg, rgba(40,36,70,0.6), rgba(25,22,45,0.7))',
        border: '2px solid rgba(107,92,231,0.35)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        animation: lockedWorries.length ? 'wv-glow 3s ease-in-out infinite' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          <span style={{ fontSize: 18 }}>{vaultOpen ? '🔓' : '🔒'}</span>
          {lockedWorries.length} worr{lockedWorries.length === 1 ? 'y' : 'ies'} locked away
        </div>

        {/* Glass window showing blurred locked cards */}
        <div style={{ width: '100%', minHeight: 64, borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(107,92,231,0.25)', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {lockedWorries.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', alignSelf: 'center' }}>The vault is empty</span>}
          {lockedWorries.map(w => (
            <div key={w.id} style={{
              padding: '5px 10px', borderRadius: 6, background: 'rgba(107,92,231,0.18)', border: '1px solid rgba(107,92,231,0.3)',
              fontSize: 11, color: 'rgba(255,255,255,0.55)', filter: 'blur(2.5px)', userSelect: 'none',
            }}>{w.text}</div>
          ))}
          {settling && (
            <div style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(107,92,231,0.25)', border: '1px solid rgba(107,92,231,0.4)', fontSize: 11, color: 'rgba(255,255,255,0.7)', animation: 'wv-settle 1.6s ease forwards' }}>
              settling in…
            </div>
          )}
        </div>

        {/* Therapist reopen controls */}
        {isT && !vaultOpen && lockedWorries.length > 0 && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ ...labelStyle, textAlign: 'center' }}>Reopen one worry</div>
            {lockedWorries.map(w => (
              <button key={w.id} onClick={() => reopenWorry(w.id)}
                style={{ ...btnStyle, width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Reopen: {w.text}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reopened worry floats out */}
      {vaultOpen && selectedWorry && (
        <div style={{ background: 'rgba(74,124,111,0.15)', border: '1px solid rgba(74,124,111,0.35)', borderRadius: 12, padding: '14px 16px', animation: 'wv-float 0.6s ease', textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>Working on this one now</div>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: 'rgba(255,255,255,0.9)' }}>{selectedWorry.text}</div>
          {isT && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <button onClick={closeVault} style={{ ...btnStyle, flex: 1 }}>Put back</button>
              <button onClick={releaseSelected} style={{ ...btnStyle, flex: 1, background: 'rgba(74,124,111,0.25)', borderColor: 'rgba(74,124,111,0.4)', color: '#b8d4ce' }}>Let it go 🌬️</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '8px 12px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)', fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }
