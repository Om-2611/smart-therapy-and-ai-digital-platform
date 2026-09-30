'use client'
import { useTracks, VideoTrack } from '@livekit/components-react'
import type { TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { MonitorUp } from 'lucide-react'

interface RemoteVideoAreaProps {
  participantName?: string
}

export default function RemoteVideoArea({ participantName = 'Participant' }: RemoteVideoAreaProps) {
  // Screen share is listed first so that when the other side is presenting,
  // their screen takes the main card and their camera drops back to the
  // thumbnail strip — without this the shared track was published but never
  // rendered anywhere, so sharing looked like it did nothing.
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )
  const remoteTracks = tracks.filter(t => !t.participant.isLocal && t.publication?.isSubscribed)
  const remoteShare = remoteTracks.find(
    t => t.source === Track.Source.ScreenShare
  ) as TrackReference | undefined
  const remoteCamera = remoteTracks.find(
    t => t.source === Track.Source.Camera
  ) as TrackReference | undefined

  if (remoteShare) {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <VideoTrack
          trackRef={remoteShare}
          // `contain` for a shared screen: cropping a desktop cuts off
          // whatever is at the edges, which is usually the point of sharing.
          style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#101314' }}
        />
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 15,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 11px',
            borderRadius: 20,
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            fontSize: 12,
            fontWeight: 600,
            color: '#2b2f33',
          }}
        >
          <MonitorUp size={12} />
          {participantName} is presenting
        </div>
      </div>
    )
  }

  if (remoteCamera) {
    return (
      <VideoTrack
        trackRef={remoteCamera}
        // `cover` fills the rounded card edge-to-edge so there are no black
        // letterbox/pillarbox bars on the sides when the camera aspect ratio
        // doesn't match the container.
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
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
          background: 'rgba(63,174,106,0.12)',
          border: '2px solid #3fae6a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 40, fontWeight: 600, color: '#2f9457' }}>
          {participantName?.charAt(0)?.toUpperCase() || '?'}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#f3f5f8',
          border: '1px solid #e7eaef',
          borderRadius: 20,
          boxShadow: '0 4px 14px rgba(20,30,40,0.06)',
          padding: '6px 16px',
          fontSize: 13,
          fontWeight: 500,
          color: '#2b2f33',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#3fae6a',
            display: 'inline-block',
          }}
        />
        {participantName}
      </div>
    </div>
  )
}
