'use client'

// "Speak instead of typing" button for the module text fields.
//
// Sits next to a text input and writes what it hears straight into it, so the
// therapist can keep talking to the client instead of looking down at a
// keyboard. Recognition follows the session's EN/हिं/తె voice language, the
// same switch that already drives module speech output.
//
// The button hides itself where the Web Speech API does not exist (Safari,
// Firefox) rather than showing a control that cannot work.

import { useEffect, useRef } from 'react'
import { Mic, MicOff, AlertCircle } from 'lucide-react'
import { useDictation } from '@/lib/voice/useDictation'
import { useVoiceLanguage } from '@/lib/voice/useVoiceLanguage'

export default function MicDictateButton({
  sessionId,
  value,
  onText,
  disabled = false,
  onStop,
  size = 38,
  title = 'Dictate',
  /** Where the error caption is placed relative to the button. */
  captionAlign = 'right',
  showCaption = true,
}: {
  sessionId: string
  /** Current field text — dictation is appended to it, never replaces it. */
  value: string
  /** Called with the field's full new text. */
  onText: (next: string) => void
  disabled?: boolean
  /** Fires when dictation ends, for fields that only persist on blur. */
  onStop?: () => void
  size?: number
  title?: string
  captionAlign?: 'left' | 'right'
  /** Off in dense lists, where the caption would cover the next row. The
   *  pulsing red button is signal enough there. */
  showCaption?: boolean
}) {
  const language = useVoiceLanguage(sessionId)
  const { listening, error, supported, toggle, clearError } = useDictation({
    language,
    onText,
    getBaseText: () => value,
  })

  // Dictating never blurs the field, so fields that save on blur need an
  // explicit signal when the microphone goes quiet.
  const wasListening = useRef(false)
  const onStopRef = useRef(onStop)
  useEffect(() => { onStopRef.current = onStop }, [onStop])
  useEffect(() => {
    if (wasListening.current && !listening) onStopRef.current?.()
    wasListening.current = listening
  }, [listening])

  if (!supported) return null

  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => { clearError(); toggle() }}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? 'Stop dictation' : title}
        title={
          disabled
            ? 'Unavailable while the client has control'
            : listening
              ? 'Stop dictating'
              : `${title} — speak and the text appears in the box`
        }
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          border: listening ? '1px solid #d9534f' : '1px solid rgba(31,122,68,0.28)',
          background: listening ? '#d9534f' : 'rgba(31,122,68,0.10)',
          color: listening ? '#ffffff' : '#2F7D5F',
          boxShadow: listening ? '0 0 0 5px rgba(217,83,79,0.18)' : 'none',
          transition: 'background .15s, box-shadow .15s, border-color .15s',
          animation: listening ? 'mic-pulse 1.5s ease-in-out infinite' : 'none',
        }}
      >
        {listening ? <MicOff size={Math.round(size * 0.46)} /> : <Mic size={Math.round(size * 0.46)} />}
      </button>

      {showCaption && (listening || error) && (
        <span
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: 6,
            [captionAlign]: 0,
            whiteSpace: 'nowrap',
            fontSize: 11.5,
            fontWeight: 600,
            lineHeight: 1.2,
            padding: '3px 8px',
            borderRadius: 999,
            pointerEvents: 'none',
            zIndex: 5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: error ? 'rgba(217,83,79,0.12)' : 'rgba(31,122,68,0.12)',
            color: error ? '#b23b37' : '#2F7D5F',
          }}
        >
          {error ? <AlertCircle size={11} /> : null}
          {error ?? 'Listening…'}
        </span>
      )}

      <style>{`
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(217,83,79,0.16); }
          50%      { box-shadow: 0 0 0 8px rgba(217,83,79,0.06); }
        }
      `}</style>
    </div>
  )
}
