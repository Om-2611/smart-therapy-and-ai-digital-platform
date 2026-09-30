'use client'
import { useEffect, useState } from 'react'
import { useLocalParticipant } from '@livekit/components-react'
import {
  Mic, MicOff, Camera, CameraOff, PhoneOff, ChevronUp,
  MonitorUp, MonitorX, NotebookPen, PenTool, Blocks, Users, Settings,
  Smile, Lock, LockOpen, Sparkles,
} from 'lucide-react'
import { RC } from './roomTheme'
import type { SidebarPanel } from './sessionPanels'

// Therapist bottom bar.
//   [End Call] [Mic ▾] [Camera ▾]   ···   [Screen Share] [AI Assistant] [AI Notes]
//   [Whiteboard] [Therapy Modules] [Participants 2] [Reactions] [Control] [Settings]
//
// Mic/camera/screen-share all drive the same LiveKit local participant. The
// mic/camera dropdown chevrons point at the Settings panel, which is where
// device switching lives. Participants and Settings open sidebar panels the
// same way AI Assistant/Notes/Whiteboard/Modules do. Reactions and Control
// (therapist lock) are carried over from the previous toolbar.
export default function SessionBottomBar({
  activePanel,
  onSelectPanel,
  onEndCall,
  participantCount,
  reactionBarOpen,
  onToggleReactions,
  isLocked,
  onToggleLock,
  onScreenShareChange,
}: {
  activePanel: SidebarPanel
  onSelectPanel: (panel: Exclude<SidebarPanel, null>) => void
  onEndCall: () => void
  participantCount: number
  reactionBarOpen: boolean
  onToggleReactions: () => void
  isLocked: boolean
  onToggleLock: () => void
  /** Told whenever the real LiveKit screen-share state changes. */
  onScreenShareChange?: (sharing: boolean) => void
}) {
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant()

  // Screen share is owned by LiveKit, not by a local boolean — the browser's
  // own "Stop sharing" bar ends the track without going through this button,
  // so the button has to read back from the participant to stay truthful.
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  useEffect(() => {
    onScreenShareChange?.(isScreenShareEnabled)
  }, [isScreenShareEnabled, onScreenShareChange])

  const toggleScreenShare = async () => {
    if (!localParticipant || shareBusy) return
    setShareBusy(true)
    setShareError(null)
    try {
      // audio: true shares tab audio where the browser offers it; LiveKit
      // silently drops it when the picked surface has no audio.
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true })
    } catch (err) {
      // Dismissing the OS/browser picker rejects with NotAllowedError — that is
      // a cancel, not a failure, so it should not surface as an error.
      const name = err instanceof DOMException ? err.name : ''
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setShareError(err instanceof Error ? err.message : 'Screen share failed')
        setTimeout(() => setShareError(null), 4000)
      }
    } finally {
      setShareBusy(false)
    }
  }

  const circle = (opts?: { danger?: boolean; off?: boolean }): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: opts?.danger ? RC.red : opts?.off ? RC.redSoft : RC.tile,
    color: opts?.danger ? '#fff' : opts?.off ? RC.red : RC.ink,
    transition: 'all 0.15s',
  })

  // Active = the panel this button controls is the one currently open.
  const item = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    minWidth: 62,
    padding: '7px 8px',
    borderRadius: 14,
    border: `1px solid ${active ? RC.green : RC.border}`,
    background: active ? RC.tileActive : RC.tile,
    color: active ? RC.greenDark : RC.ink,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    position: 'relative',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  // The chevron now does what it always looked like it did: opens the Settings
  // panel, where the camera/mic/speaker pickers live.
  const chevron = (
    <button
      type="button"
      title="Device settings"
      onClick={() => onSelectPanel('settings')}
      style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 16,
        height: 16,
        padding: 0,
        borderRadius: '50%',
        border: `1px solid ${RC.border}`,
        background: RC.panel,
        color: RC.inkMuted,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ChevronUp size={10} />
    </button>
  )

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 18,
        background: RC.panel,
        border: `1px solid ${RC.border}`,
        boxShadow: '0 6px 18px rgba(20,30,40,0.05)',
        overflowX: 'auto',
      }}
    >
      {/* ---- LEFT: end call / mic / camera ---- */}
      <button title="End call" onClick={onEndCall} style={circle({ danger: true })}>
        <PhoneOff size={19} />
      </button>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
          onClick={() => localParticipant?.setMicrophoneEnabled(!isMicrophoneEnabled)}
          style={circle({ off: !isMicrophoneEnabled })}
        >
          {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        {chevron}
      </div>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          title={isCameraEnabled ? 'Stop camera' : 'Start camera'}
          onClick={() => localParticipant?.setCameraEnabled(!isCameraEnabled)}
          style={circle({ off: !isCameraEnabled })}
        >
          {isCameraEnabled ? <Camera size={18} /> : <CameraOff size={18} />}
        </button>
        {chevron}
      </div>

      <div style={{ width: 1, height: 30, background: RC.border, flexShrink: 0 }} />

      {/* ---- CENTRE/RIGHT: panel toggles + utilities ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
        <button
          onClick={toggleScreenShare}
          disabled={shareBusy}
          title={
            shareError
              ? shareError
              : isScreenShareEnabled
                ? 'Stop sharing your screen'
                : 'Share your screen'
          }
          style={{
            ...item(isScreenShareEnabled),
            opacity: shareBusy ? 0.6 : 1,
            cursor: shareBusy ? 'progress' : 'pointer',
            ...(shareError ? { borderColor: RC.red, color: RC.red } : null),
          }}
        >
          {isScreenShareEnabled ? <MonitorX size={17} /> : <MonitorUp size={17} />}
          {isScreenShareEnabled ? 'Stop' : 'Share'}
        </button>

        <button onClick={() => onSelectPanel('assistant')} style={item(activePanel === 'assistant')}>
          <Sparkles size={17} /> AI Assistant
        </button>

        <button onClick={() => onSelectPanel('notes')} style={item(activePanel === 'notes')}>
          <NotebookPen size={17} /> AI Notes
        </button>

        <button onClick={() => onSelectPanel('whiteboard')} style={item(activePanel === 'whiteboard')}>
          <PenTool size={17} /> Whiteboard
        </button>

        <button onClick={() => onSelectPanel('modules')} style={item(activePanel === 'modules')}>
          <Blocks size={17} /> Modules
        </button>

        <button
          onClick={() => onSelectPanel('participants')}
          title="Participants"
          style={item(activePanel === 'participants')}
        >
          <Users size={17} /> Participants
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 5,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              borderRadius: 9,
              background: activePanel === 'participants' ? RC.greenDark : RC.green,
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {participantCount}
          </span>
        </button>

        <button onClick={onToggleReactions} title="Reactions" style={item(reactionBarOpen)}>
          <Smile size={17} /> React
        </button>

        <button onClick={onToggleLock} title="Therapist control" style={item(isLocked)}>
          {isLocked ? <Lock size={17} /> : <LockOpen size={17} />} Control
        </button>

        <button
          onClick={() => onSelectPanel('settings')}
          title="Settings"
          style={item(activePanel === 'settings')}
        >
          <Settings size={17} /> Settings
        </button>
      </div>
    </div>
  )
}
