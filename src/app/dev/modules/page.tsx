'use client'

// DEV-ONLY module bench. Mounts the modules under repair at a realistic panel
// size with role / lock switches, so each bug can be reproduced and the fix
// verified without a full two-window video session. 404s in production.

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import WhackAMoleMath from '@/components/modules/sld/WhackAMoleMath'
import SimonSays from '@/components/modules/adhd/SimonSays'
import PixelArtCoding from '@/components/modules/sld/PixelArtCoding'
import BoxPopping from '@/components/modules/anxiety/BoxPopping'
import NBackChallenge from '@/components/modules/adhd/NBackChallenge'
import BubbleSplash from '@/components/modules/sld/BubbleSplash'
import EmotionalCharades from '@/components/modules/anxiety/EmotionalCharades'
import GroundingGame from '@/components/modules/anxiety/GroundingGame'
import DefusionRiver from '@/components/modules/general/DefusionRiver'
import ThoughtChallenger from '@/components/modules/general/ThoughtChallenger'
import MicroQuestBoard from '@/components/modules/general/MicroQuestBoard'
import ValuesCardSort from '@/components/modules/general/ValuesCardSort'
import WorryVault from '@/components/modules/general/WorryVault'
import FactsVsFeelings from '@/components/modules/general/FactsVsFeelings'

const MODULES = [
  { id: 'wam', name: 'Whack-a-Mole Math', Comp: WhackAMoleMath },
  { id: 'simon', name: 'Simon Says', Comp: SimonSays },
  { id: 'pac', name: 'Pixel Art Coding', Comp: PixelArtCoding },
  { id: 'balloon', name: 'Box Popping / Worry Balloons', Comp: BoxPopping },
  { id: 'nback', name: 'N-Back Challenge', Comp: NBackChallenge },
  { id: 'bsplash', name: 'Bubble Splash (SLD)', Comp: BubbleSplash },
  { id: 'charades', name: 'Emotional Charades', Comp: EmotionalCharades },
  /* The dictation ("speak instead of type") modules. These run on the WIDE
     canvas in the real room, not the 420px sidebar, so they default to it. */
  { id: 'ground', name: '5-4-3-2-1 Grounding', Comp: GroundingGame, wide: true },
  { id: 'defusion', name: 'Defusion River', Comp: DefusionRiver, wide: true },
  { id: 'thought', name: 'Thought Challenger', Comp: ThoughtChallenger, wide: true },
  { id: 'quest', name: 'Micro Quest Board', Comp: MicroQuestBoard, wide: true },
  { id: 'values', name: 'Values Card Sort', Comp: ValuesCardSort, wide: true },
  { id: 'worry', name: 'Worry Vault', Comp: WorryVault, wide: true },
  { id: 'facts', name: 'Facts vs Feelings', Comp: FactsVsFeelings, wide: true },
] as const

export default function ModuleBench() {
  if (process.env.NODE_ENV === 'production') notFound()

  const [active, setActive] = useState<string>('wam')
  // The sidebar modules and the canvas modules live at very different widths;
  // showing either at the wrong one hides real layout problems.
  const [wide, setWide] = useState(false)
  const [role, setRole] = useState<'therapist' | 'client'>('therapist')
  const [isLocked, setIsLocked] = useState(false)
  const [ready, setReady] = useState(false)

  // Modules drive their state with updateDoc, which fails on a missing document.
  // The real room guarantees liveSessions/{id} exists (ensureSessionExists), so
  // the bench has to create it too or nothing responds.
  useEffect(() => {
    // Create ONLY if absent. A `{ moduleState: {} }` merge write REPLACES the map
    // rather than deep-merging it, which silently wiped module state on every
    // reload of this bench.
    ;(async () => {
      const ref = doc(db, 'liveSessions', 'dev-modules')
      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, {
            sessionId: 'dev-modules',
            moduleState: {},
            timestamps: { updatedAt: new Date().toISOString() },
          })
        }
      } catch (err) {
        console.warn('[dev/modules] bootstrap failed', err)
      }
      setReady(true)
    })()
  }, [])

  const entry = MODULES.find((m) => m.id === active)!
  const { Comp } = entry

  const btn = (on: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    borderRadius: 8,
    border: `1px solid ${on ? '#4a7c6f' : '#d8dce2'}`,
    background: on ? 'rgba(74,124,111,0.15)' : '#fff',
    color: on ? '#2f6d5e' : '#5b6169',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif', background: '#eef1f4', minHeight: '100vh' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {MODULES.map((m) => (
          <button
            key={m.id}
            onClick={() => { setActive(m.id); setWide('wide' in m && !!m.wide) }}
            style={btn(active === m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        <button onClick={() => setRole(role === 'therapist' ? 'client' : 'therapist')} style={btn(false)}>
          role: <strong>{role}</strong>
        </button>
        <button onClick={() => setIsLocked((l) => !l)} style={btn(isLocked)}>
          isLocked: <strong>{String(isLocked)}</strong>
        </button>
        <button onClick={() => setWide((w) => !w)} style={btn(wide)}>
          width: <strong>{wide ? 'canvas' : 'sidebar 420'}</strong>
        </button>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          session: <code>dev-modules</code>
        </span>
      </div>

      {/* Approximates the real 420px dark-glass sidebar panel. */}
      <div
        style={{
          width: wide ? 'min(1180px, 100%)' : 420,
          height: wide ? 760 : 620,
          // The wide canvas in the real room is a WHITE stage, not dark glass.
          background: wide ? '#ffffff' : 'rgba(28,28,28,0.92)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 20,
          padding: 12,
          // Deliberately mirrors GlassModulePanel's .gm-canvas: a BLOCK box with
          // overflowY auto, NOT a flex column. Modules that rely on `flex: 1` for
          // height get none here, which is what production actually does.
          overflowY: 'auto',
          color: wide ? '#1f3b2c' : '#fff',
        }}
      >
        {ready
          ? <Comp key={`${entry.id}-${role}`} sessionId="dev-modules" role={role} isLocked={isLocked} />
          : <span style={{ fontSize: 12, opacity: 0.6 }}>preparing session doc…</span>}
      </div>
    </div>
  )
}
