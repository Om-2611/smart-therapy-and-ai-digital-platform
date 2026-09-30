'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface FloatingEmoji {
  id: number
  emoji: string
  x: number
}

interface ReactionOverlayProps {
  sessionId: string
  /** Whether the emoji picker bar is showing. Driven by the React button in the
   *  bottom bar / pill controls — the overlay used to keep this in private
   *  state that nothing could ever set, so the bar never appeared. */
  open?: boolean
  /** Called after a reaction is sent, so the opener can close the bar. */
  onClose?: () => void
}

const EMOJIS = ['👏', '⭐', '💪', '😊', '🎉']

export default function ReactionOverlay({ sessionId, open = false, onClose }: ReactionOverlayProps) {
  const barOpen = open
  const [floaters, setFloaters] = useState<FloatingEmoji[]>([])
  const idRef = useRef(0)
  // Ignore the reaction already sitting in the doc when we mount, otherwise
  // every join replays whatever was sent in the last two seconds.
  const seenReactionRef = useRef<string | null>(null)
  const mountedAtRef = useRef(Date.now())

  useEffect(() => {
    if (!sessionId) return
    const unsub = onSnapshot(doc(db, 'liveSessions', sessionId), (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      if (data.lastReaction?.emoji && data.lastReaction?.timestamp) {
        const stamp = String(data.lastReaction.timestamp)
        const sentAt = new Date(stamp).getTime()
        // Any write to the session doc (module launch, lock toggle, whiteboard
        // state) re-fires this snapshot, so key off the reaction's own
        // timestamp rather than replaying it on every unrelated update.
        const alreadyShown = seenReactionRef.current === stamp
        seenReactionRef.current = stamp
        const elapsed = Date.now() - sentAt
        if (!alreadyShown && sentAt >= mountedAtRef.current && elapsed < 5000) {
          const id = ++idRef.current
          const floater: FloatingEmoji = {
            id,
            emoji: data.lastReaction.emoji,
            x: Math.random() * 60 + 20,
          }
          setFloaters((prev) => [...prev, floater])
          setTimeout(() => {
            setFloaters((prev) => prev.filter((f) => f.id !== id))
          }, 1800)
        }
      }
    })
    return () => unsub()
  }, [sessionId])

  const sendReaction = useCallback(
    async (emoji: string) => {
      onClose?.()
      const id = ++idRef.current
      const floater: FloatingEmoji = { id, emoji, x: Math.random() * 60 + 20 }
      setFloaters((prev) => [...prev, floater])
      setTimeout(() => {
        setFloaters((prev) => prev.filter((f) => f.id !== id))
      }, 1800)

      try {
        await updateDoc(doc(db, 'liveSessions', sessionId), {
          lastReaction: { emoji, timestamp: new Date().toISOString() },
          'timestamps.updatedAt': new Date().toISOString(),
        })
      } catch {}
    },
    [sessionId, onClose]
  )

  return (
    <>
      {/* Reaction Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 72,
          left: '50%',
          transform: barOpen ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
          background: 'rgba(255, 255, 255, 0.16)',
          backdropFilter: 'blur(18px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          borderRadius: 30,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          padding: '6px 12px',
          opacity: barOpen ? 1 : 0,
          pointerEvents: barOpen ? 'all' : 'none',
          transition: 'all 0.22s ease',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: 0.8, marginRight: 4 }}>
          Send
        </span>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              padding: 2,
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Floating Reactions */}
      {floaters.map((f) => (
        <div
          key={f.id}
          className="animate-float-up"
          style={{
            position: 'absolute',
            bottom: 64,
            left: `${f.x}%`,
            fontSize: 32,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          {f.emoji}
        </div>
      ))}
    </>
  )
}
