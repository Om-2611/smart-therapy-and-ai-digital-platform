'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { MessageCircle, Lock } from 'lucide-react'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'
import { RC } from '@/components/session/roomTheme'

/* Worry Vault art assets — folder name contains spaces, so encode the URL. */
const WV_ASSET = (file: string) => encodeURI(`/assests/module assest/Asset Worry Vault/${file}`)
const WV_VAULT_ART = WV_ASSET('ChatGPT Image Aug 13, 2026, 09_36_42 PM.png')
const WV_PADLOCK_LOCKED = WV_ASSET('worry_vault_padlock_icon.svg')
const WV_PADLOCK_UNLOCKED = WV_ASSET('worry_vault_UNLOCKED_padlock.svg')
const WV_NOTE_CARD = WV_ASSET('worry_vault_worry_note_card.svg')
const WV_LOCK_LOTTIE = WV_ASSET('worry_vault_lock_interaction.json')
const WV_CLUNK = WV_ASSET('worry_vault_clunk.wav')

/* The illustration PNG is a two-frame sprite sheet: closed vault on the left
   half, open vault on the right. Crop to one frame by doubling the background
   width and sliding it — no second copy of the art is ever painted. */
const WV_ART_FRAME = (open: boolean): React.CSSProperties => ({
  backgroundImage: `url("${WV_VAULT_ART}")`,
  backgroundSize: '200% 100%',
  backgroundPosition: open ? '100% 50%' : '0% 50%',
  backgroundRepeat: 'no-repeat',
})

/* Foliage approximated in CSS — no leaf asset ships in the Worry Vault folder.
   Leaf silhouettes in the room's existing greens, clustered at the edges. */
const WV_LEAF = (x: number, y: number, rot: number, s: number, o: number) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${o}">` +
  `<path d="M32 4C16 12 8 26 8 40c0 12 10 20 24 24 14-4 24-12 24-24C56 26 48 12 32 4z" fill="${RC.green}"/>` +
  `<path d="M32 10v52" stroke="${RC.greenDark}" stroke-width="2" opacity="0.55"/></g>`
const WV_FOLIAGE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 640">` +
  WV_LEAF(-16, 60, -28, 1.6, 0.13) + WV_LEAF(10, 140, 18, 1.2, 0.10) + WV_LEAF(-24, 250, -8, 1.35, 0.08) +
  WV_LEAF(430, 20, 34, 1.45, 0.12) + WV_LEAF(408, 128, -14, 1.15, 0.09) + WV_LEAF(444, 232, 22, 1.3, 0.07) +
  WV_LEAF(-10, 470, -40, 1.5, 0.11) + WV_LEAF(40, 566, 12, 1.25, 0.09) +
  WV_LEAF(424, 452, 46, 1.4, 0.10) + WV_LEAF(376, 570, -20, 1.2, 0.08) +
  `</svg>`
const WV_FOLIAGE = `url("data:image/svg+xml,${encodeURIComponent(WV_FOLIAGE_SVG)}")`

/* One-shot clunk playback, lazily created so nothing touches window during SSR. */
let wvClunk: HTMLAudioElement | null = null
function playClunk() {
  try {
    if (typeof window === 'undefined') return
    if (!wvClunk) wvClunk = new Audio(WV_CLUNK)
    wvClunk.currentTime = 0
    void wvClunk.play()
  } catch {}
}

/* Plays the lock Lottie once while mounted. */
function LockLottie() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let anim: { destroy: () => void } | null = null
    let cancelled = false
    import('lottie-web').then(({ default: lottie }) => {
      if (cancelled || !host.current) return
      anim = lottie.loadAnimation({ container: host.current, renderer: 'svg', loop: false, autoplay: true, path: WV_LOCK_LOTTIE })
    }).catch(() => {})
    return () => { cancelled = true; anim?.destroy() }
  }, [])
  return <div ref={host} aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }} />
}

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
    playClunk()
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
    /* Root fills the stage and never scrolls itself — ModuleStage's body is
       overflow:hidden and expects `height:100%` + an internal flex:1 region.
       The foliage stays full-bleed here; the content column is centred inside. */
    <div style={{
      height: '100%', minHeight: 0, maxWidth: '100%',
      display: 'flex', flexDirection: 'column',
      fontFamily: '"DM Sans", sans-serif', position: 'relative', borderRadius: 18,
      overflow: 'hidden', overflowX: 'clip',
      background: `${WV_FOLIAGE}, linear-gradient(170deg, #f2fbf5 0%, #e6f6ec 55%, #dcf1e5 100%)`,
      backgroundSize: 'cover, auto',
      backgroundPosition: 'center, center',
    }}>
      <style>{`
        @keyframes wv-glow { 0%,100%{box-shadow:0 0 0 1px rgba(63,174,106,0.18), 0 6px 18px rgba(47,148,87,0.10)} 50%{box-shadow:0 0 0 1px rgba(63,174,106,0.32), 0 10px 26px rgba(47,148,87,0.18)} }
        @keyframes wv-settle { 0%{transform:translateY(-30px) scale(1);opacity:1} 100%{transform:translateY(0) scale(0.85);opacity:0.7} }
        @keyframes wv-float { 0%{transform:translateY(20px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        .wv-input::placeholder { color: #9aa8a1; }
        .wv-input:focus { border-color: ${RC.green}; box-shadow: 0 0 0 3px ${RC.greenSoft}; }
        .wv-scroll { scrollbar-width: thin; scrollbar-color: rgba(63,174,106,0.35) transparent; }
        .wv-scroll::-webkit-scrollbar { width: 8px; }
        .wv-scroll::-webkit-scrollbar-thumb { background: rgba(63,174,106,0.35); border-radius: 8px; }
      `}</style>

      {/* The only scrolling region: overflow stays inside the module, never the page. */}
      <div className="wv-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px 14px 18px' }}>
        {/* Contained, centred content column — the mockup's layout width. */}
        <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ---- Centered identity block: vault mark, title, tagline ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {/* Small vault mark — the sprite's closed frame, square-cropped so the
            art keeps its aspect ('200% auto' + left-half offset). */}
        <div role="img" aria-label={vaultOpen ? 'Vault unlocked' : 'Vault locked'} style={{
          width: 46, height: 46, flexShrink: 0, borderRadius: 12, overflow: 'hidden',
          backgroundImage: `url("${WV_VAULT_ART}")`,
          backgroundSize: '200% auto',
          backgroundPosition: '0% 50%',
          backgroundRepeat: 'no-repeat',
        }} />
        <div style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 23, lineHeight: 1.15, color: '#1f3b2c' }}>
          Worry Vault
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, lineHeight: 1.45, color: '#6b8078', maxWidth: 300 }}>
          Not ignoring — just not now. Lock worries away and reopen one when you&apos;re ready.
        </div>
      </div>

      {/* Add worry */}
      {!vaultOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <MessageCircle size={16} color="#8aa79a" style={{ position: 'absolute', left: 14, top: 14, pointerEvents: 'none' }} />
            <textarea className="wv-input" value={text} onChange={e => setText(e.target.value.slice(0, MAX_CHARS))} placeholder="What's on your mind?"
              disabled={!canInteract} maxLength={MAX_CHARS}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 46, background: '#ffffff', border: '1px solid #dbe8e1', borderRadius: 14, padding: '13px 14px 13px 38px', fontSize: 13, color: '#25392f', resize: 'none', outline: 'none', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 1px 3px rgba(31,59,44,0.06)', transition: 'border-color .15s, box-shadow .15s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={addWorry} disabled={!canInteract || !text.trim()}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 26px', borderRadius: 999, border: 'none',
                background: RC.green, color: '#ffffff', fontSize: 13, fontWeight: 600,
                fontFamily: '"DM Sans", sans-serif',
                cursor: canInteract && text.trim() ? 'pointer' : 'default',
                opacity: canInteract && text.trim() ? 1 : 0.45,
                boxShadow: '0 4px 12px rgba(47,148,87,0.28)',
              }}>
              <Lock size={15} color="#ffffff" />
              Lock it in the vault →
            </button>
          </div>
        </div>
      )}

      {/* ---- Locked-away panel: illustration left, count + helper right ---- */}
      <div style={{
        position: 'relative', borderRadius: 16, padding: 14,
        background: '#ffffff', border: '1px solid #e3efe8',
        display: 'flex', alignItems: 'center', gap: 14,
        animation: lockedWorries.length ? 'wv-glow 3s ease-in-out infinite' : 'none',
        boxShadow: '0 2px 10px rgba(31,59,44,0.05)',
      }}>
        {/* Single frame of the vault sprite; the Lottie plays over it while locking */}
        <div aria-hidden style={{
          ...WV_ART_FRAME(vaultOpen),
          position: 'relative', flexShrink: 0, width: 84, aspectRatio: '3 / 4',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {settling && <LockLottie />}
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vaultOpen ? WV_PADLOCK_UNLOCKED : WV_PADLOCK_LOCKED} alt="" aria-hidden width={20} height={20} style={{ display: 'block', flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1f3b2c' }}>
              {lockedWorries.length} worr{lockedWorries.length === 1 ? 'y' : 'ies'} locked away
            </span>
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.45, color: '#8a9c94' }}>
            {lockedWorries.length === 0
              ? <>The vault is empty. When you lock worries, they&apos;ll appear here.</>
              : <>Reopen one when you&apos;re ready to work on it.</>}
          </div>
        </div>
      </div>

      {/* Locked worries as note cards */}
      {(lockedWorries.length > 0 || settling) && (
        <div style={{ width: '100%', borderRadius: 14, background: 'rgba(255,255,255,0.55)', border: '1px solid #e3efe8', padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {lockedWorries.map(w => (
            <div key={w.id} style={{
              position: 'relative', flex: '1 1 132px', maxWidth: 180, aspectRatio: '720 / 430',
              backgroundImage: `url("${WV_NOTE_CARD}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
              userSelect: 'none',
            }}>
              {/* worry text sits in the note card's writing area */}
              <div style={{
                position: 'absolute', left: '12.1%', top: '31.4%', width: '75.8%', height: '43%',
                borderRadius: 4, background: '#FFFFFF', padding: '3px 5px', overflow: 'hidden',
                fontSize: 8, lineHeight: 1.25, color: '#5D7168', filter: 'blur(2.5px)',
              }}>{w.text}</div>
            </div>
          ))}
          {settling && (
            <div style={{ alignSelf: 'center', padding: '6px 12px', borderRadius: 999, background: RC.greenSoft, border: `1px solid ${RC.green}`, fontSize: 11, color: RC.greenDark, animation: 'wv-settle 1.6s ease forwards' }}>
              settling in…
            </div>
          )}
        </div>
      )}

      {/* Therapist reopen controls */}
      {isT && !vaultOpen && lockedWorries.length > 0 && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ ...labelStyle, textAlign: 'center' }}>Reopen one worry</div>
          {lockedWorries.map(w => (
            <button key={w.id} onClick={() => reopenWorry(w.id)}
              style={{ ...btnStyle, width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Reopen: {w.text}
            </button>
          ))}
        </div>
      )}

      {/* Reopened worry floats out */}
      {vaultOpen && selectedWorry && (
        <div style={{ background: '#ffffff', border: `1px solid ${RC.green}`, borderRadius: 16, padding: '14px 16px', animation: 'wv-float 0.6s ease', textAlign: 'center', boxShadow: '0 2px 10px rgba(31,59,44,0.05)' }}>
          <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#8a9c94', marginBottom: 6 }}>Working on this one now</div>
          <div style={{ fontFamily: '"DM Serif Display", serif', fontStyle: 'italic', fontSize: 15, color: '#1f3b2c' }}>{selectedWorry.text}</div>
          {isT && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={closeVault} style={{ ...btnStyle, flex: 1 }}>Put back</button>
              <button onClick={releaseSelected} style={{ ...btnStyle, flex: 1, background: RC.green, borderColor: RC.green, color: '#ffffff' }}>Let it go 🌬️</button>
            </div>
          )}
        </div>
      )}

        </div>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid #dbe8e1', background: '#ffffff', color: '#3d564b', fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }
const labelStyle: React.CSSProperties = { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: '#8a9c94', marginBottom: 4 }
