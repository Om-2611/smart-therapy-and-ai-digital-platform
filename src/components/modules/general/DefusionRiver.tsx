'use client'

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import {
  Leaf as LeafIcon, MessageCircle, Eye, Sparkles, Waves, Cloud, Heart,
  Lightbulb, HelpCircle, Pause, Play, ArrowRight, Wind, RotateCcw,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { logModuleEvent } from '@/lib/sessionEvents'

/* ---------------------------------------------------------------------------
   Art assets. The Background folder name is clean but the file name carries a
   space and a trailing underscore, so the segment is encoded individually —
   encodeURI() would have left the (legal but fragile) raw space in place.
   Same helper shape as WorryVault, the first module redesigned this way.
--------------------------------------------------------------------------- */
const DR_SCENE = `/assets/modules/Background/${encodeURIComponent('Defusion river_.png')}`

/* ---------------------------------------------------------------------------
   Palette — nature greens on white cards, dark ink on every pale surface.
   The stage canvas is WHITE and the river artwork is bright, so nothing here
   is ever light-on-light: white text appears only on the saturated green
   fills (the CTA pill and the leaf bodies).
--------------------------------------------------------------------------- */
const GREEN = '#1F7A44'       // solid fills — the only place white text appears
const HEAD = '#15803D'        // card headings
const INK = '#1f3b2c'         // body copy on pale surfaces
const INK_SOFT = '#33413a'    // inactive instruction rows
const MUTED = '#6b7a72'       // helper copy
const BORDER = '#e7eaef'
const MINT = '#EFF8F1'
const MINT_LINE = 'rgba(31,122,68,0.22)'
const AMBER_BG = '#FDF7E7'
const AMBER_LINE = '#F0E0B4'
const AMBER_INK = '#7A5F16'
const CARD_SHADOW = '0 6px 20px rgba(20,45,32,0.16)'

const MAX_CHARS = 120

interface DefusionRiverProps {
  sessionId: string
  role: 'therapist' | 'client'
  isLocked: boolean
}

interface Leaf { id: string; text: string; posX: number; posY: number }

const STEPS = [
  'Read the thought on the leaf',
  'Say: "I am having the thought that…"',
  'Now just watch it float away',
]

/* Short labels for the bottom switcher — the same three `drStep` values, named
   the way the mockup names them. */
const STEP_TABS = [
  { label: '1. Write & Place', Icon: LeafIcon },
  { label: '2. Watch it Float', Icon: Waves },
  { label: '3. Let it Go', Icon: Cloud },
]

/* Icon + tint per instruction row, matching the mockup's leaf / speech bubble
   / eye trio. */
const STEP_ICONS = [
  { Icon: LeafIcon, tint: '#2F8F4E' },
  { Icon: MessageCircle, tint: '#7C5CD6' },
  { Icon: Eye, tint: '#E8871E' },
]

/* `posY` is stored as a raw pixel offset from the old 200px-tall river box.
   The scene artwork puts the water in its lower half, so the same 20..70
   range is mapped into the 50%..76% band where the water actually is. The
   stored value is untouched — this is purely how it is painted. */
function leafTop(posY: number) {
  const clamped = Math.min(Math.max(posY, 20), 70)
  return `${50 + ((clamped - 20) / 50) * 26}%`
}

export default function DefusionRiver({ sessionId, role, isLocked }: DefusionRiverProps) {
  const isT = role === 'therapist'

  const [thought, setThought] = useState('')
  const [leaves, setLeaves] = useState<Leaf[]>([])
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')

  /* Local-only, never synced: the mockup's "Help & Tips" popover. */
  const [showTips, setShowTips] = useState(false)

  const write = useCallback(async (d: Record<string, unknown>) => {
    try { await updateDoc(doc(db, 'liveSessions', sessionId), { ...d, 'timestamps.updatedAt': new Date().toISOString() }) } catch {}
  }, [sessionId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const s = snap.data().moduleState || {}
      if (typeof s.drThought === 'string') setThought(s.drThought)
      if (Array.isArray(s.drLeaves)) setLeaves(s.drLeaves)
      if (typeof s.drPaused === 'boolean') setPaused(s.drPaused)
      if (typeof s.drStep === 'number') setStep(s.drStep)
    })
    return () => unsub()
  }, [sessionId])

  const placeLeaf = useCallback((txt?: string) => {
    if (!isT) return
    const t = (txt ?? input).trim()
    if (!t) return
    const leaf: Leaf = { id: `dr${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: t, posX: 0, posY: 20 + Math.random() * 50 }
    write({ 'moduleState.drThought': t, 'moduleState.drLeaves': [...leaves, leaf] })
    logModuleEvent(sessionId, {
      module: 'defusion-river',
      type: 'thought_defused',
      detail: `Practiced defusing the thought: "${t}"`,
    })
    if (!txt) setInput('')
  }, [isT, input, leaves, write, sessionId])

  const releaseAll = useCallback(() => { if (isT) write({ 'moduleState.drLeaves': [] }) }, [isT, write])
  const togglePause = useCallback(() => { if (isT) write({ 'moduleState.drPaused': !paused }) }, [isT, paused, write])
  const advance = useCallback(() => { if (isT) write({ 'moduleState.drStep': (step + 1) % STEPS.length }) }, [isT, step, write])

  const canSubmit = isT && !!input.trim()
  const nextStep = (step + 1) % STEPS.length

  return (
    /* Root fills the stage and never scrolls itself — ModuleStage's body is
       overflow:hidden and expects `height:100%` plus an internal flex:1 region. */
    <div style={{
      height: '100%', minHeight: 0, maxWidth: '100%',
      display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: '"DM Sans", sans-serif',
    }}>
      <style>{`
        @keyframes dr-drift { from{left:-20%} to{left:110%} }
        @keyframes dr-bob { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-6px) rotate(2deg)} }
        @keyframes dr-ripple { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
        @keyframes dr-breathe { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.25);opacity:0.9} }
        @keyframes dr-twinkle { 0%,100%{opacity:0.25;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.15)} }
        .dr-input::placeholder { color: #93a29a; }
        .dr-input:focus { border-color: ${GREEN}; box-shadow: 0 0 0 3px rgba(31,122,68,0.14); }
        .dr-cta:not(:disabled):hover { background: #1a6b3b; }
        .dr-ghost:hover { border-color: ${GREEN}; color: ${GREEN}; }
        .dr-link:hover { color: ${GREEN}; text-decoration: underline; }
      `}</style>

      {/* ---- Three-step instruction list ----
          No hero title: ModuleStage already prints "Defusion River" and the
          category line directly above this body. */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {STEPS.map((s, i) => {
          const active = step === i
          const { Icon, tint } = STEP_ICONS[i]
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              padding: '7px 13px', borderRadius: 12,
              background: active ? MINT : 'transparent',
              border: `1px solid ${active ? MINT_LINE : 'transparent'}`,
              transition: 'background .2s, border-color .2s',
            }}>
              <Icon size={17} color={tint} strokeWidth={2.1} style={{ flexShrink: 0 }} />
              <span style={{
                fontSize: 16.5, lineHeight: 1.35,
                fontWeight: active ? 700 : 500,
                color: active ? HEAD : INK_SOFT,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {i + 1}. {s}{step === 1 && i === 1 && thought ? ` “${thought}”` : ''}
              </span>
            </div>
          )
        })}
      </div>

      {/* ---- The river scene: full-bleed artwork with cards composed over it ---- */}
      <div style={{
        flex: 1, minHeight: 0, position: 'relative',
        borderRadius: 20, overflow: 'hidden',
        border: `1px solid ${BORDER}`,
        /* Gradient underneath is the fallback if the scene PNG is slow or
           missing — the copy stays dark-on-pale either way. */
        backgroundColor: '#cfeaf7',
        backgroundImage: `url("${DR_SCENE}"), linear-gradient(180deg, #d8f0fb 0%, #a9dcf2 48%, #6fc0e6 100%)`,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center center, center center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }}>

        {/* ===== Water layer: ripples, drifting leaves, sparkles. Sits behind
            every card so a leaf can float the full width of the scene. ===== */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* ripple lines across the water band */}
          {[58, 68, 78, 88].map((top, i) => (
            <svg key={i} width="100%" height="20" style={{ position: 'absolute', top: `${top}%`, left: 0, animation: `dr-ripple ${3 + i}s ease-in-out infinite` }}>
              <path d="M0,10 Q40,3 80,10 T160,10 T240,10 T320,10 T400,10 T480,10 T560,10 T640,10 T720,10 T800,10" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
            </svg>
          ))}

          {leaves.map((leaf, idx) => {
            const focus = idx === leaves.length - 1
            const w = focus ? 170 : 92
            const h = focus ? 104 : 56
            return (
              <div key={leaf.id} style={{
                position: 'absolute', top: leafTop(leaf.posY), left: '-20%',
                animation: paused ? 'none' : `dr-drift ${10 + (idx % 3) * 2}s linear infinite`,
                animationDelay: `${idx * 1.5}s`,
              }}>
                <div style={{ animation: 'dr-bob 3s ease-in-out infinite', position: 'relative', width: w, height: h }}>
                  {/* ripple rings the leaf sits inside */}
                  <svg width={w * 1.9} height={h * 1.1} viewBox="0 0 190 62" style={{ position: 'absolute', left: w * -0.45, top: h * 0.52, opacity: 0.75 }}>
                    <ellipse cx="95" cy="31" rx="88" ry="24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
                    <ellipse cx="95" cy="31" rx="66" ry="17" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" />
                    <ellipse cx="95" cy="31" rx="44" ry="11" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" />
                  </svg>

                  <svg width={w} height={h} viewBox="0 0 92 56" style={{ position: 'absolute', inset: 0, filter: 'drop-shadow(0 4px 8px rgba(20,60,40,0.28))' }}>
                    <defs>
                      <linearGradient id={`dr-lg-${leaf.id}`} x1="0" y1="0" x2="0.6" y2="1">
                        <stop offset="0%" stopColor="#7BC24E" />
                        <stop offset="100%" stopColor="#3E8B3C" />
                      </linearGradient>
                    </defs>
                    <path d="M46,4 C70,8 86,24 88,46 C66,52 28,52 6,46 C8,24 24,8 46,4 Z" fill={`url(#dr-lg-${leaf.id})`} stroke="#2F6E31" strokeWidth="1.5" />
                    <path d="M46,8 L46,48" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" />
                    <path d="M46,20 L30,30 M46,20 L62,30 M46,32 L33,40 M46,32 L59,40" stroke="rgba(255,255,255,0.32)" strokeWidth="1" fill="none" />
                  </svg>

                  {/* White text is safe here: the leaf is a solid saturated
                      green fill, not translucent artwork. */}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: focus ? 15 : 9, fontWeight: 700, color: '#ffffff', textAlign: 'center',
                    padding: focus ? '0 24px' : '0 12px', lineHeight: 1.15,
                    textShadow: '0 1px 3px rgba(20,60,35,0.55)',
                  }}>
                    {leaf.text.length > 28 ? leaf.text.slice(0, 28) + '…' : leaf.text}
                  </div>

                  {/* sparkles around the focused leaf */}
                  {focus && [
                    { left: -14, top: 6, s: 9, d: '0s' },
                    { left: -6, top: h - 18, s: 7, d: '0.7s' },
                    { left: w + 4, top: 12, s: 8, d: '1.1s' },
                    { left: w - 16, top: -10, s: 7, d: '1.6s' },
                  ].map((sp, k) => (
                    <div key={k} style={{
                      position: 'absolute', left: sp.left, top: sp.top, width: sp.s, height: sp.s,
                      background: '#FFD766', borderRadius: 2,
                      transform: 'rotate(45deg)', animation: `dr-twinkle 2.4s ease-in-out infinite`,
                      animationDelay: sp.d, boxShadow: '0 0 6px rgba(255,215,102,0.9)',
                    }} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* breathing marker on the water, kept from the original scene */}
          <div style={{
            position: 'absolute', bottom: 14, right: '32%', width: 34, height: 34, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.75)', animation: 'dr-breathe 4s ease-in-out infinite',
          }} />
        </div>

        {/* ===== Card layer ===== */}
        <div style={{
          position: 'relative', zIndex: 1, height: '100%', minHeight: 0,
          display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
        }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>

            {/* ---- LEFT: compose a thought ---- */}
            <div style={{
              flex: '0 1 272px', minWidth: 0, maxHeight: '100%', overflowY: 'auto',
              position: 'relative', marginTop: 16,
              background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 18,
              padding: '22px 16px 14px', boxShadow: CARD_SHADOW,
            }}>
              {/* leaf badge straddling the card's top edge */}
              <div aria-hidden style={{
                position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
                width: 42, height: 42, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `radial-gradient(circle at 50% 40%, #ffffff 0%, ${MINT} 100%)`,
                border: `1px solid ${MINT_LINE}`, boxShadow: '0 3px 10px rgba(20,45,32,0.14)',
              }}>
                <LeafIcon size={21} color={GREEN} strokeWidth={2.1} />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 19, fontWeight: 800, color: HEAD, letterSpacing: -0.2, marginBottom: 10,
              }}>
                Enter your thought
                <Sparkles size={15} color="#E8B23C" strokeWidth={2.2} />
              </div>

              {isT ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <textarea
                      className="dr-input"
                      value={input}
                      onChange={e => setInput(e.target.value.slice(0, MAX_CHARS))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); placeLeaf() } }}
                      placeholder="Type your thought here…"
                      maxLength={MAX_CHARS}
                      style={{
                        width: '100%', boxSizing: 'border-box', minHeight: 76,
                        background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 14,
                        padding: '11px 12px 24px', fontSize: 15.5, lineHeight: 1.35, color: INK,
                        resize: 'none', outline: 'none', fontFamily: '"DM Sans", sans-serif',
                        transition: 'border-color .15s, box-shadow .15s',
                      }}
                    />
                    <span style={{
                      position: 'absolute', right: 11, bottom: 9, fontSize: 13, fontWeight: 600,
                      color: input.length >= MAX_CHARS ? '#B4632A' : MUTED, pointerEvents: 'none',
                    }}>
                      {input.length} / {MAX_CHARS}
                    </span>
                  </div>

                  <button
                    className="dr-cta"
                    onClick={() => placeLeaf()}
                    disabled={!canSubmit}
                    style={{
                      width: '100%', marginTop: 10,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                      padding: '12px 18px', borderRadius: 14, border: 'none',
                      background: GREEN, color: '#ffffff', fontSize: 17, fontWeight: 700,
                      fontFamily: '"DM Sans", sans-serif',
                      cursor: canSubmit ? 'pointer' : 'default',
                      opacity: canSubmit ? 1 : 0.5,
                      boxShadow: '0 6px 16px rgba(31,122,68,0.28)',
                      transition: 'background .15s, opacity .15s',
                    }}
                  >
                    <LeafIcon size={17} color="#ffffff" strokeWidth={2.2} />
                    Place on Leaf
                  </button>

                  {/* Keeps the original "duplicate thought" action reachable. */}
                  {!!thought && (
                    <button
                      className="dr-link"
                      onClick={() => placeLeaf(thought)}
                      style={{
                        width: '100%', marginTop: 7, padding: 0, border: 'none', background: 'none',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 14, fontWeight: 600, color: MUTED, cursor: 'pointer',
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      <RotateCcw size={12} strokeWidth={2.2} />
                      Place the last thought again
                    </button>
                  )}
                </>
              ) : (
                /* Client view — writing is the therapist's; `isLocked` decides
                   how the invitation reads. */
                <div style={{
                  background: '#F7FAF8', border: `1px solid ${BORDER}`, borderRadius: 14,
                  padding: '12px 13px', fontSize: 15, lineHeight: 1.45, color: INK, minHeight: 76,
                }}>
                  {thought
                    ? <>Your thought: <strong style={{ color: HEAD }}>“{thought}”</strong></>
                    : <span style={{ color: MUTED }}>Your therapist will place your thought on a leaf.</span>}
                  <div style={{ marginTop: 8, fontSize: 14, color: MUTED }}>
                    {isLocked ? 'Your therapist is guiding this exercise.' : 'Follow along with your therapist.'}
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
                background: AMBER_BG, border: `1px solid ${AMBER_LINE}`, borderRadius: 12,
                padding: '9px 11px',
              }}>
                <Lightbulb size={15} color="#D89B1E" strokeWidth={2.2} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: AMBER_INK }}>
                  It&apos;s okay to have thoughts. You are doing great!
                </span>
              </div>
            </div>

            {/* ---- What happens next ---- */}
            <div style={{
              flex: '0 1 208px', minWidth: 0, maxHeight: '100%', overflowY: 'auto', marginTop: 34,
              background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 16,
              padding: '13px 14px', boxShadow: CARD_SHADOW,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: HEAD, marginBottom: 9 }}>
                Your thought will
              </div>
              {[
                { Icon: LeafIcon, tint: '#2F8F4E', text: 'Be placed on a leaf' },
                { Icon: Waves, tint: '#2F8F4E', text: 'Float down the river' },
                { Icon: Cloud, tint: '#6b7a72', text: 'Drift away and fade' },
              ].map(({ Icon, tint, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
                  <Icon size={15} color={tint} strokeWidth={2.1} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 15, lineHeight: 1.3, color: INK }}>{text}</span>
                </div>
              ))}
              <div style={{ height: 1, background: BORDER, margin: '11px 0 9px' }} />
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: HEAD }}>
                You can let it go.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 600, color: HEAD }}>
                You are in control.
                <Heart size={13} color="#E8646E" fill="#E8646E" strokeWidth={0} />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 8 }} />

            {/* ---- RIGHT: watch it float ---- */}
            <div style={{
              flex: '0 1 172px', minWidth: 0, alignSelf: 'center', maxHeight: '100%', overflowY: 'auto',
              background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 16,
              padding: '14px 14px 15px', boxShadow: CARD_SHADOW, textAlign: 'center',
            }}>
              <LeafIcon size={18} color={GREEN} strokeWidth={2.1} />
              <div style={{ fontSize: 15.5, fontWeight: 800, color: HEAD, margin: '4px 0 8px', lineHeight: 1.25 }}>
                Watch it float…
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.5, color: INK }}>
                Let your thought float down the river. You don&apos;t have to hold on to it.
              </div>
            </div>
          </div>

          {/* ---- Bottom bar: helpers · step switcher · progression ---- */}
          <div style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>

            {/* Tips popover — local state only, never synced. */}
            {showTips && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 292, zIndex: 3,
                background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 16,
                padding: '13px 15px', boxShadow: CARD_SHADOW,
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: HEAD, marginBottom: 7 }}>Help &amp; Tips</div>
                {[
                  'Say the thought out loud, slowly: “I am having the thought that…”',
                  'Notice the thought as an object on the water, not as a fact.',
                  'Pause the river any time you want to sit with one leaf.',
                  'Release when you are ready — nothing is lost by letting go.',
                ].map(t => (
                  <div key={t} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN, flexShrink: 0, marginTop: 6 }} />
                    <span style={{ fontSize: 14.5, lineHeight: 1.4, color: INK }}>{t}</span>
                  </div>
                ))}
              </div>
            )}

            {/* LEFT group */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8 }}>
              <button className="dr-ghost" onClick={() => setShowTips(v => !v)} style={{ ...btnStyle, background: showTips ? MINT : '#ffffff' }}>
                <HelpCircle size={15} strokeWidth={2.1} />
                Help &amp; Tips
              </button>
              {isT && (
                <button className="dr-ghost" onClick={togglePause} style={btnStyle}>
                  {paused ? <Play size={15} strokeWidth={2.2} /> : <Pause size={15} strokeWidth={2.2} />}
                  {paused ? 'Resume River' : 'Pause River'}
                </button>
              )}
            </div>

            {/* CENTRE: the three drStep values. Only the *next* segment is
                actionable, and it fires the same `advance()` the arrow does —
                no new progression path. */}
            <div style={{
              flexShrink: 0, display: 'flex', gap: 4, padding: 4,
              background: 'rgba(255,255,255,0.92)', border: `1px solid ${BORDER}`,
              borderRadius: 16, boxShadow: CARD_SHADOW,
            }}>
              {STEP_TABS.map(({ label, Icon }, i) => {
                const active = step === i
                const actionable = isT && i === nextStep
                return (
                  <button
                    key={label}
                    onClick={actionable ? advance : undefined}
                    aria-current={active ? 'step' : undefined}
                    aria-disabled={!actionable}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      padding: '6px 14px', borderRadius: 12,
                      border: `1.5px solid ${active ? GREEN : 'transparent'}`,
                      background: active ? MINT : 'transparent',
                      color: active ? HEAD : MUTED,
                      fontSize: 14, fontWeight: active ? 700 : 600,
                      fontFamily: '"DM Sans", sans-serif',
                      cursor: actionable ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Icon size={15} color={active ? GREEN : MUTED} strokeWidth={2.1} />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* RIGHT group */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {isT && (
                <>
                  <button className="dr-ghost" onClick={releaseAll} style={btnStyle}>
                    <Wind size={15} strokeWidth={2.1} />
                    Release
                  </button>
                  <button
                    className="dr-cta"
                    onClick={advance}
                    style={{
                      ...btnStyle, border: 'none', background: GREEN, color: '#ffffff',
                      fontWeight: 700, boxShadow: '0 6px 16px rgba(31,122,68,0.28)',
                    }}
                  >
                    Next step
                    <ArrowRight size={15} color="#ffffff" strokeWidth={2.3} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Empty state — dark copy inside a near-opaque pill, never bare text
            over the artwork. */}
        {leaves.length === 0 && (
          <div style={{
            position: 'absolute', left: '50%', top: '62%', transform: 'translate(-50%,-50%)', zIndex: 0,
            padding: '9px 18px', borderRadius: 999,
            background: 'rgba(255,255,255,0.92)', border: `1px solid ${BORDER}`,
            boxShadow: CARD_SHADOW, fontSize: 15, fontWeight: 600, color: MUTED, whiteSpace: 'nowrap',
          }}>
            {isT ? 'Place a thought on a leaf' : 'Watching the river…'}
          </div>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '10px 15px', borderRadius: 14, border: `1px solid ${BORDER}`,
  background: '#ffffff', color: '#244a35', fontSize: 15, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: '"DM Sans", sans-serif',
  boxShadow: CARD_SHADOW, transition: 'border-color .15s, color .15s, background .15s',
}
