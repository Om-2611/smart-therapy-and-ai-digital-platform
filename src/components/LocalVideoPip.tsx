'use client'
import { useLocalParticipant, VideoTrack } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'

export default function LocalVideoPip() {
  const { localParticipant, cameraTrack } = useLocalParticipant()
  const { profile } = useAuthStore()
  const [pipHover, setPipHover] = useState(false)
  const userName = profile ? `${profile.firstName} ${profile.lastName}` : 'You'
  const hasVideo = localParticipant && (cameraTrack?.isSubscribed || localParticipant.isCameraEnabled)

  return (
    <div
      onMouseEnter={() => setPipHover(true)}
      onMouseLeave={() => setPipHover(false)}
      style={{
        position: 'absolute',
        bottom: 80,
        left: 20,
        width: 120,
        height: 90,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #1a2e28, #142420)',
        border: pipHover ? '1.5px solid var(--sage)' : '1.5px solid rgba(255,255,255,0.14)',
        zIndex: 20,
        transition: 'border-color 0.2s, transform 0.2s',
        transform: pipHover ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={{ participant: localParticipant!, source: Track.Source.Camera, publication: cameraTrack! }}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <div className="flex items-center justify-center h-full">
          <span style={{ fontSize: 22, color: 'var(--ink-muted)' }}>
            {userName?.charAt(0)?.toUpperCase() || 'Y'}
          </span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 6,
          fontSize: 8,
          color: 'rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.5)',
          padding: '1px 6px',
          borderRadius: 6,
        }}
      >
        You
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          left: 6,
          fontSize: 9,
          color: 'var(--ink-muted)',
        }}
      >
        {userName}
      </div>
    </div>
  )
}
