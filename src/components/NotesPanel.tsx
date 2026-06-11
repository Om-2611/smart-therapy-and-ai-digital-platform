'use client'
import { useState } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { X } from 'lucide-react'

interface NotesPanelProps {
  open: boolean
  onClose: () => void
  sessionId: string
}

export default function NotesPanel({ open, onClose, sessionId }: NotesPanelProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        lastNote: { content: text.trim(), timestamp: new Date().toISOString() },
        'timestamps.updatedAt': new Date().toISOString(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      setText('')
    } catch {}
    setSaving(false)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 0,
        bottom: 64,
        width: 260,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRight: '1px solid var(--glass-border)',
        zIndex: 25,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Session notes</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type clinical observations..."
        style={{
          flex: 1,
          background: 'transparent',
          border: '1px solid var(--glass-border)',
          borderRadius: 8,
          padding: 10,
          color: 'var(--ink)',
          fontSize: 12,
          fontFamily: "'DM Sans', sans-serif",
          resize: 'none',
          outline: 'none',
        }}
      />
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || !text.trim()}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 8,
            border: 'none',
            background: 'var(--sage-light)',
            color: 'var(--sage-mid)',
            fontSize: 12,
            fontWeight: 500,
            cursor: saving || !text.trim() ? 'default' : 'pointer',
            opacity: saving || !text.trim() ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save note'}
        </button>
        {saved && (
          <span style={{ fontSize: 11, color: 'var(--sage-mid)' }}>✓ Note saved</span>
        )}
      </div>
    </div>
  )
}
