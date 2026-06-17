'use client'
import { useState } from 'react'

interface AIConsentBannerProps {
  userRole: 'therapist' | 'client'
  onConsent: (given: boolean) => void
  otherPartyConsented: boolean
}

export default function AIConsentBanner({
  userRole,
  onConsent,
  otherPartyConsented,
}: AIConsentBannerProps) {
  const [decided, setDecided] = useState(false)
  const [choice, setChoice] = useState<boolean | null>(null)

  function handleChoice(given: boolean) {
    setChoice(given)
    setDecided(true)
    onConsent(given)
  }

  return (
    <div style={{
      position: 'absolute',
      top: '48px',
      left: 0,
      right: 0,
      zIndex: 50,
      padding: '0 20px',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(28, 28, 28, 0.55)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: '0 0 20px 20px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        pointerEvents: 'all',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#fff',
            marginBottom: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              fontSize: '9px',
              padding: '1px 7px',
              borderRadius: '8px',
              background: 'rgba(107,92,231,0.2)',
              color: '#a89ae8',
              fontWeight: 500,
            }}>
              ✦ AI Assist
            </span>
            AI session support
          </div>
          <div style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.5,
          }}>
            {userRole === 'therapist'
              ? 'Enables live transcription and AI insights visible only to you. Audio is deleted within 24 hours.'
              : 'Your therapist uses AI to improve session quality. Audio is transcribed and automatically deleted within 24 hours.'
            }
          </div>

          {decided && choice === true && (
            <div style={{
              fontSize: '10px',
              color: otherPartyConsented
                ? '#4caf86'
                : 'rgba(255,255,255,0.35)',
              marginTop: '4px',
            }}>
              {otherPartyConsented
                ? 'Both parties consented — AI features active'
                : `Waiting for ${
                    userRole === 'therapist' ? 'client' : 'therapist'
                  } to consent...`}
            </div>
          )}
        </div>

        {!decided ? (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={() => handleChoice(false)}
              style={{
                fontSize: '11px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Decline
            </button>
            <button
              onClick={() => handleChoice(true)}
              style={{
                fontSize: '11px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(30,53,48,0.25)',
                background: '#A8C9BE',
                color: '#1E3530',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 500,
              }}
            >
              I consent
            </button>
          </div>
        ) : (
          <div style={{
            fontSize: '11px',
            color: choice
              ? '#4caf86'
              : 'rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}>
            {choice ? 'Consented' : 'Declined'}
          </div>
        )}
      </div>
    </div>
  )
}
