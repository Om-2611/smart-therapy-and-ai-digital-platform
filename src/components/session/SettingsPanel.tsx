'use client'
import { useState } from 'react'
import { useMediaDeviceSelect, useLocalParticipant } from '@livekit/components-react'
import { Camera, Mic, Volume2, AlertCircle } from 'lucide-react'
import { GLASS } from './roomTheme'
import PanelShell from './PanelShell'

// Settings sidebar panel.
//
// The Settings button in the bottom bar had no onClick, and the mic/camera
// dropdown chevrons were decorative — device switching was never wired up.
// This panel is where both now land. It drives LiveKit's own device selection,
// so changing a device swaps the live published track mid-call; nothing has to
// be restarted.

function DeviceSelect({
  kind,
  label,
  icon,
}: {
  kind: MediaDeviceKind
  label: string
  icon: React.ReactNode
}) {
  const [error, setError] = useState<string | null>(null)
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    onError: (e) => setError(e.message),
  })

  // Labels are blank until the browser has granted permission for that kind of
  // device, so fall back to a positional name rather than showing empty rows.
  const nameFor = (d: MediaDeviceInfo, i: number) =>
    d.label || `${label} ${i + 1}`

  return (
    <div style={{ padding: '12px 14px', borderBottom: `1px solid ${GLASS.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <span style={{ color: GLASS.inkMuted, display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: GLASS.ink }}>{label}</span>
      </div>

      {devices.length === 0 ? (
        <div style={{ fontSize: 12.5, color: GLASS.inkFaint }}>
          No {label.toLowerCase()} detected.
        </div>
      ) : (
        <select
          value={activeDeviceId || devices[0]?.deviceId || ''}
          onChange={async (e) => {
            setError(null)
            try {
              await setActiveMediaDevice(e.target.value)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not switch device')
            }
          }}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 9,
            fontSize: 13,
            color: GLASS.ink,
            background: GLASS.fill,
            border: `1px solid ${GLASS.fillBorder}`,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {devices.map((d, i) => (
            // The dark glass surface does not reach the native option list, so
            // these need their own readable colours.
            <option key={d.deviceId} value={d.deviceId} style={{ background: '#1c1c1c', color: '#fff' }}>
              {nameFor(d, i)}
            </option>
          ))}
        </select>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12, color: '#ff8a8e' }}>
          <AlertCircle size={11} /> {error}
        </div>
      )}
    </div>
  )
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { isMicrophoneEnabled, isCameraEnabled, localParticipant } = useLocalParticipant()

  const toggleRow = (
    label: string,
    on: boolean,
    onToggle: () => void,
    hint: string,
  ) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        borderBottom: `1px solid ${GLASS.border}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: GLASS.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: GLASS.inkMuted, marginTop: 1 }}>{hint}</div>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={label}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          flexShrink: 0,
          position: 'relative',
          cursor: 'pointer',
          border: `1px solid ${on ? GLASS.accent : GLASS.fillBorder}`,
          background: on ? 'rgba(168,201,190,0.3)' : GLASS.fill,
          transition: 'all 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: on ? GLASS.accent : GLASS.inkFaint,
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )

  return (
    <PanelShell title="Settings" subtitle="Camera, microphone and audio output" onClose={onClose}>
      <DeviceSelect kind="videoinput" label="Camera" icon={<Camera size={14} />} />
      <DeviceSelect kind="audioinput" label="Microphone" icon={<Mic size={14} />} />
      <DeviceSelect kind="audiooutput" label="Speaker" icon={<Volume2 size={14} />} />

      {toggleRow(
        'Camera',
        isCameraEnabled,
        () => localParticipant?.setCameraEnabled(!isCameraEnabled),
        isCameraEnabled ? 'Your video is being sent' : 'Your video is off',
      )}
      {toggleRow(
        'Microphone',
        isMicrophoneEnabled,
        () => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled),
        isMicrophoneEnabled ? 'Your audio is being sent' : 'You are muted',
      )}

      <div style={{ padding: '12px 14px', fontSize: 12, color: GLASS.inkFaint, lineHeight: 1.5 }}>
        Device names stay blank until the browser has granted camera and
        microphone permission for this site. Speaker selection is not supported
        in every browser — Safari and Firefox ignore it.
      </div>
    </PanelShell>
  )
}
