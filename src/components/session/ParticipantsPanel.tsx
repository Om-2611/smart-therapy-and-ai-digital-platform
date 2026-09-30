'use client'
import { useParticipants, useLocalParticipant } from '@livekit/components-react'
import { Track, ConnectionQuality, type Participant } from 'livekit-client'
import { Mic, MicOff, Camera, CameraOff, MonitorUp, Signal, Crown } from 'lucide-react'
import { GLASS } from './roomTheme'
import PanelShell from './PanelShell'

// Participants sidebar panel.
//
// The Participants button in the bottom bar had no onClick at all — it only
// ever rendered the count badge. This panel is what it now opens. Everything
// here is read from the LiveKit room that already backs the call, so there is
// no new data source and nothing to keep in sync.

const QUALITY_LABEL: Record<string, { text: string; colour: string }> = {
  [ConnectionQuality.Excellent]: { text: 'Excellent', colour: '#4caf86' },
  [ConnectionQuality.Good]: { text: 'Good', colour: '#8bc34a' },
  [ConnectionQuality.Poor]: { text: 'Poor', colour: '#f2994a' },
  [ConnectionQuality.Lost]: { text: 'Reconnecting', colour: '#ff5a5f' },
  [ConnectionQuality.Unknown]: { text: 'Connecting', colour: GLASS.inkFaint },
}

/** LiveKit metadata carries the role we set when minting the token. */
function roleOf(p: Participant): string | null {
  try {
    const meta = p.metadata ? JSON.parse(p.metadata) : null
    const r = meta?.role
    return typeof r === 'string' ? r : null
  } catch {
    return null
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function Row({ p, isLocal }: { p: Participant; isLocal: boolean }) {
  const name = p.name || p.identity || 'Participant'
  const role = roleOf(p)
  const isTherapist = role === 'therapist'
  const micOn = p.isMicrophoneEnabled
  const camOn = p.isCameraEnabled
  const sharing = !!p.getTrackPublication(Track.Source.ScreenShare)
  const quality = QUALITY_LABEL[p.connectionQuality] ?? QUALITY_LABEL[ConnectionQuality.Unknown]

  const chip = (on: boolean) => ({
    width: 26,
    height: 26,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: `1px solid ${on ? GLASS.fillBorder : 'rgba(255,90,95,0.28)'}`,
    background: on ? GLASS.fill : 'rgba(255,90,95,0.12)',
    color: on ? GLASS.inkMuted : '#ff8a8e',
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '10px 14px',
        borderBottom: `1px solid ${GLASS.border}`,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isTherapist ? 'rgba(168,201,190,0.22)' : GLASS.fill,
          border: `1px solid ${isTherapist ? GLASS.accent : GLASS.fillBorder}`,
          color: isTherapist ? GLASS.accent : GLASS.ink,
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {initials(name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              color: GLASS.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
          {isLocal && (
            <span style={{ fontSize: 11, color: GLASS.inkFaint, flexShrink: 0 }}>(you)</span>
          )}
          {isTherapist && <Crown size={11} style={{ color: GLASS.accent, flexShrink: 0 }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Signal size={10} style={{ color: quality.colour }} />
          <span style={{ fontSize: 12, color: GLASS.inkMuted }}>
            {role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Participant'} · {quality.text}
          </span>
        </div>
      </div>

      {sharing && (
        <div style={chip(true)} title="Sharing screen">
          <MonitorUp size={13} />
        </div>
      )}
      <div style={chip(micOn)} title={micOn ? 'Microphone on' : 'Microphone muted'}>
        {micOn ? <Mic size={13} /> : <MicOff size={13} />}
      </div>
      <div style={chip(camOn)} title={camOn ? 'Camera on' : 'Camera off'}>
        {camOn ? <Camera size={13} /> : <CameraOff size={13} />}
      </div>
    </div>
  )
}

export default function ParticipantsPanel({ onClose }: { onClose: () => void }) {
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()

  // Therapist first, then everyone else, so the list ordering is stable rather
  // than following LiveKit's join order.
  const ordered = [...participants].sort((a, b) => {
    const ra = roleOf(a) === 'therapist' ? 0 : 1
    const rb = roleOf(b) === 'therapist' ? 0 : 1
    if (ra !== rb) return ra - rb
    return (a.name || a.identity).localeCompare(b.name || b.identity)
  })

  return (
    <PanelShell
      title="Participants"
      subtitle={`${ordered.length} in this session`}
      onClose={onClose}
    >
      {ordered.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: GLASS.inkMuted, fontSize: 14 }}>
          Waiting for someone to join…
        </div>
      ) : (
        ordered.map((p) => (
          <Row key={p.sid || p.identity} p={p} isLocal={p.sid === localParticipant?.sid} />
        ))
      )}
    </PanelShell>
  )
}
