'use client'
import { useEffect, useState } from 'react'
import type { AIInsight } from '@/lib/rag/types'

interface AIInsightBarProps {
  insight: AIInsight | null
  visible: boolean
  onDismiss: () => void
  onLaunchModule: (moduleSlug: string) => void
}

const EMOTION_COLORS: Record<string, string> = {
  anxious:     '#f7c948',
  anxiety:     '#f7c948',
  worried:     '#f7c948',
  overwhelmed: '#c8602a',
  frustrated:  '#c8602a',
  angry:       '#c8602a',
  sad:         '#5b8dd9',
  withdrawn:   '#5b8dd9',
  depressed:   '#5b8dd9',
  hopeful:     '#4a7c6f',
  calm:        '#4a7c6f',
  engaged:     '#4a7c6f',
  scared:      '#9b59b6',
  shame:       '#9b59b6',
  embarrassed: '#9b59b6',
}

function getEmotionColor(emotion: string): string {
  return EMOTION_COLORS[emotion.toLowerCase()] ?? '#6b7876'
}

const MODULE_NAMES: Record<string, string> = {
  'digital-sand-tray':  'Digital Sand Tray',
  'word-building':      'Word Building',
  'whack-a-mole-math':  'Whack-a-Mole Math',
  'pixel-art-coding':   'Pixel Art Coding',
  'bubble-splash':      'Bubble Splash',
  'n-back-challenge':   'N-Back Challenge',
  'virtual-maze':       'Virtual Maze',
  'simon-says':         'Simon Says',
  'grounding-game':     '5-4-3-2-1 Grounding',
  'emotional-charades': 'Emotional Charades',
  'box-popping':        'Box Popping',
  'worry-box':          'Worry Box',
  'drag-drop-sorting':  'Drag & Drop Sorting',
  'social-story':       'Social Story',
  'virtual-shop':       'Virtual Shop',
}

export default function AIInsightBar({
  insight,
  visible,
  onDismiss,
  onLaunchModule,
}: AIInsightBarProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (visible && insight) {
      setTimeout(() => setMounted(true), 50)
    } else {
      setMounted(false)
    }
  }, [visible, insight])

  if (!visible || !insight) return null

  return (
    <>
      <div
        onClick={onDismiss}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          background: 'transparent',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: '48px',
          left: 0,
          right: '420px',
          zIndex: 41,
          padding: '0 20px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(14,22,20,0.82)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: insight.riskFlag
              ? '1px solid rgba(200,96,42,0.5)'
              : '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '14px 18px',
            pointerEvents: 'all',
            transform: mounted ? 'translateY(0)' : 'translateY(-110%)',
            opacity: mounted ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: insight.riskFlag
              ? '0 4px 24px rgba(200,96,42,0.2)'
              : '0 4px 24px rgba(0,0,0,0.3)',
          }}
        >
          {insight.riskFlag && (
            <div style={{
              background: 'rgba(200,96,42,0.15)',
              border: '1px solid rgba(200,96,42,0.3)',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '10px',
              fontSize: '12px',
              color: '#e8936a',
              fontWeight: 500,
            }}>
              Risk indicator detected — review transcript
              and consider crisis protocol if appropriate.
            </div>
          )}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '9px',
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(107,92,231,0.2)',
                color: '#a89ae8',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                AI insight
              </span>

              {insight.emotions.map((emotion, i) => (
                <span key={i} style={{
                  fontSize: '10px',
                  padding: '2px 10px',
                  borderRadius: '10px',
                  background: getEmotionColor(emotion) + '22',
                  border: `1px solid ${getEmotionColor(emotion)}44`,
                  color: getEmotionColor(emotion),
                  fontWeight: 500,
                }}>
                  {emotion}
                </span>
              ))}
            </div>

            <button
              onClick={onDismiss}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '12px',
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          <p style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.6,
            marginBottom: '10px',
            fontStyle: 'italic',
          }}>
            {insight.summary}
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <div style={{ flex: 1 }}>
              {insight.steps.map((step, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  marginBottom: '4px',
                }}>
                  <span style={{
                    fontSize: '10px',
                    color: '#4a7c6f',
                    marginTop: '1px',
                    flexShrink: 0,
                  }}>
                    {i + 1}.
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: 'rgba(255,255,255,0.6)',
                    lineHeight: 1.5,
                  }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            {insight.module && (
              <button
                onClick={() => {
                  onLaunchModule(insight.module)
                  onDismiss()
                }}
                style={{
                  background: 'rgba(74,124,111,0.25)',
                  border: '1px solid rgba(74,124,111,0.4)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                  flexShrink: 0,
                  textAlign: 'center',
                }}
              >
                <div style={{
                  fontSize: '9px',
                  color: 'rgba(184,212,206,0.7)',
                  marginBottom: '2px',
                }}>
                  Suggested
                </div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#b8d4ce',
                }}>
                  {MODULE_NAMES[insight.module] ?? insight.module}
                </div>
                <div style={{
                  fontSize: '9px',
                  color: 'rgba(74,124,111,0.8)',
                  marginTop: '2px',
                }}>
                  Launch →
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
