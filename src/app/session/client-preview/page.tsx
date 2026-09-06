'use client';

// DEV-ONLY layout preview for the CLIENT (patient) session window.
//
// The real client window at /session/[sessionId] needs a logged-in client, a
// LiveKit token and a therapist on the other end, so it can't be inspected
// locally without two browsers. This route mounts the SAME component
// (ClientSessionRoom) inside an unconnected LiveKit RoomContext with stub data,
// purely so both of its layouts can be reviewed and screenshotted.
//
// It renders nothing in production.

import { useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { RoomContext } from '@livekit/components-react';
import { Room } from 'livekit-client';
import ClientSessionRoom from '@/components/session/ClientSessionRoom';

const PREVIEW_MODULES = [
  { id: null, label: 'No activity' },
  { id: 'emotion-wheel', label: 'Emotion Wheel' },
  { id: 'grounding-game', label: 'Grounding Game' },
  { id: 'memory_match', label: 'Memory Match' },
];

export default function ClientRoomPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  const room = useMemo(() => new Room(), []);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);
  const [isLocked, setIsLocked] = useState(true);

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    borderRadius: 999,
    border: `1px solid ${on ? '#1f9d63' : '#e0ddd5'}`,
    background: on ? '#1f9d63' : '#ffffff',
    color: on ? '#ffffff' : '#4a574f',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

  return (
    <RoomContext.Provider value={room}>
      {/* Preview-only harness bar. Not part of the client window itself. */}
      <div
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.97)',
          border: '1px solid #e0ddd5',
          boxShadow: '0 10px 30px rgba(30,40,35,0.18)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#98a49e' }}>
          Preview
        </span>
        {PREVIEW_MODULES.map((m) => (
          <button
            key={m.label}
            onClick={() => { setActiveModule(m.id); setWhiteboardActive(false); }}
            style={chip(!whiteboardActive && activeModule === m.id)}
          >
            {m.label}
          </button>
        ))}
        <button
          onClick={() => { setWhiteboardActive((w) => !w); setActiveModule(null); }}
          style={chip(whiteboardActive)}
        >
          Whiteboard
        </button>
        <span style={{ width: 1, height: 20, background: '#e0ddd5' }} />
        <button onClick={() => setIsLocked((l) => !l)} style={chip(isLocked)}>
          {isLocked ? 'Therapist guiding' : 'Client can interact'}
        </button>
      </div>

      <ClientSessionRoom
        sessionId="preview-session"
        uid="preview-client"
        therapistName="Dr. Ananya Sharma"
        therapistOnline
        clientName="Sagar Sharma"
        elapsed={1458}
        onEndSession={() => {}}
        activeModule={activeModule}
        isLocked={isLocked}
        whiteboardActive={whiteboardActive}
      />
    </RoomContext.Provider>
  );
}
