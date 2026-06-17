'use client'
import { useTracks, VideoTrack } from '@livekit/components-react'
import type { TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'

interface RemoteVideoAreaProps {
  participantName?: string
}

export default function RemoteVideoArea({ participantName = 'Participant' }: RemoteVideoAreaProps) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  )
  const remoteTracks = tracks.filter(t => !t.participant.isLocal)
  const subscribedRemote = remoteTracks.find(t => t.publication?.isSubscribed) as TrackReference | undefined

  if (subscribedRemote) {
    return (
      <VideoTrack
        trackRef={subscribedRemote}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--sage-light), transparent)',
          border: '2px solid var(--sage-mid)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 40, color: 'var(--sage-mid)' }}>
          {participantName?.charAt(0)?.toUpperCase() || '?'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255, 255, 255, 0.16)',
          backdropFilter: 'blur(18px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
          border: '1px solid rgba(255, 255, 255, 0.22)',
          borderRadius: 20,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          padding: '6px 16px',
          fontSize: 13,
          color: '#1A1A1A',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#4ade80',
            display: 'inline-block',
          }}
        />
        {participantName}
      </div>
    </div>
  )
}
