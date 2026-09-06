'use client';

/* =============================================================================
   CLIENT SESSION ROOM — the patient-facing video window.

   Two layouts, one component:
     Plain call  — STAAD header with the therapist's identity, one large video
                   stage with a self-view PiP, and a labelled control dock.
     On activity — the therapist launches a module or shares the whiteboard: the
                   header compacts to encryption + timer + session info, the
                   activity takes the canvas, the video becomes a side column
                   with the self-view tucked into it, and the dock becomes a
                   full-width bar of compact buttons.

   Every control is wired to real behaviour:
     Mic / Camera  -> LiveKit local track publication
     Share         -> screen share publication
     Raise Hand    -> Firestore liveSessions/{id}.raisedHands + a ✋ reaction
     React         -> emoji broadcast on the shared reaction channel
     Settings      -> device pickers, mirror/hide self view, fullscreen
     End Session   -> hands back to the page's confirm dialog
   ========================================================================== */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useConnectionQualityIndicator,
  useLocalParticipant,
  useMediaDeviceSelect,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import { ConnectionQuality, RoomEvent, Track } from 'livekit-client';
import type { Participant } from 'livekit-client';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  BadgeCheck, Camera, Check, ChevronDown, Copy, Hand, Heart, Info, LifeBuoy, Lock,
  Maximize2, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, Settings,
  ShieldCheck, Smile, Timer, Video, VideoOff, Volume2, X,
} from 'lucide-react';
import ReactionOverlay from '@/components/ReactionOverlay';
import { ModuleContent } from '@/components/GlassModulePanel';
import StaadWhiteboard from '@/components/session/StaadWhiteboard';
import { moduleName } from '@/lib/modules';
import { useSessionRoom } from '@/components/StaadVideo';

/* ===== Palette — warm, clinical-calm light theme (scoped to this screen) ===== */
const CR = {
  page: '#f7f4ee',
  card: '#ffffff',
  stage: '#0f1a15',
  ink: '#1c2a23',
  inkSoft: '#5d6b64',
  inkFaint: '#98a49e',
  line: '#eae6dd',
  neutral: '#f3f3f0',
  green: '#1f9d63',
  greenDeep: '#15784a',
  greenSoft: '#e3f2ea',
  red: '#e8443c',
  redSoft: '#fdeceb',
  amber: '#dd8f2e',
  amberSoft: '#fdf2e3',
};

const REACTIONS = ['👏', '❤️', '😊', '💪', '🎉', '👍'];

const formatClock = (totalSeconds: number) => {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
};

const initialsOf = (name: string) =>
  name
    .replace(/^dr\.?\s+/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

interface ClientSessionRoomProps {
  sessionId: string;
  /** Therapist name from the live Firestore participant list (fallback). */
  therapistName: string;
  therapistOnline: boolean;
  clientName: string;
  /** Seconds since the room was joined — drives the header clock. */
  elapsed: number;
  /** Opens the page-level "End this session?" confirm dialog. */
  onEndSession: () => void;
  /** Module the therapist has launched, synced through Firestore. */
  activeModule: string | null;
  /** True while the therapist holds control of the module or board. */
  isLocked: boolean;
  /** Therapist has the whiteboard open AND chose to share it. */
  whiteboardActive: boolean;
  /** Raise-hand state is written under this uid. */
  uid: string | null;
}

export default function ClientSessionRoom({
  sessionId,
  therapistName,
  therapistOnline,
  clientName,
  elapsed,
  onEndSession,
  activeModule,
  isLocked,
  whiteboardActive,
  uid,
}: ClientSessionRoomProps) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, cameraTrack } =
    useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const { room } = useSessionRoom();

  const [handRaised, setHandRaised] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [selfHidden, setSelfHidden] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [therapistMeta, setTherapistMeta] = useState<{ name: string; title: string } | null>(null);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [startedAt] = useState(() => new Date(Date.now() - elapsed * 1000));

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const lastModule = useRef<string | null>(activeModule);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ---- Therapist identity: the DB holds the authoritative name + credential ---- */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = d?.session?.therapist;
        if (cancelled || !t) return;
        const raw = `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
        if (!raw) return;
        const name = /^dr\.?\s/i.test(raw) ? raw : `Dr. ${raw}`;
        const specialties: string[] = Array.isArray(t.specialty) ? t.specialty : [];
        const title =
          t.qualification ||
          (specialties.length ? `${specialties.slice(0, 2).join(' · ')} Specialist` : 'Licensed Therapist');
        setTherapistMeta({ name, title });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  /* ---- Active-speaker ring on the therapist name pill ---- */
  useEffect(() => {
    if (!room) return;
    const onSpeakers = (speakers: Participant[]) => setRemoteSpeaking(speakers.some((s) => !s.isLocal));
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    return () => { room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers); };
  }, [room]);

  /* ---- Fullscreen state mirrors the document ---- */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* ---- Esc closes any open popover ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMoreOpen(false);
      setReactionsOpen(false);
      setInfoOpen(false);
      setSafetyOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---- Tell the client when the therapist opens or closes an activity ---- */
  useEffect(() => {
    if (activeModule === lastModule.current) return;
    const opened = activeModule !== null;
    lastModule.current = activeModule;
    showToast(opened ? `Your therapist opened ${moduleName(activeModule!)}` : 'Activity closed');
  }, [activeModule, showToast]);


  /* ===== Control handlers ===== */
  const toggleMic = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      showToast(isMicrophoneEnabled ? 'Microphone muted' : 'Microphone on');
    } catch {
      showToast('Could not access your microphone');
    }
  }, [localParticipant, isMicrophoneEnabled, showToast]);

  const toggleCamera = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
      showToast(isCameraEnabled ? 'Camera turned off' : 'Camera on');
    } catch {
      showToast('Could not access your camera');
    }
  }, [localParticipant, isCameraEnabled, showToast]);

  const toggleShare = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
      showToast(isScreenShareEnabled ? 'Stopped sharing' : 'You are sharing your screen');
    } catch {
      showToast('Screen sharing was cancelled');
    }
  }, [localParticipant, isScreenShareEnabled, showToast]);

  const toggleHand = useCallback(async () => {
    const next = !handRaised;
    setHandRaised(next);
    showToast(next ? 'Hand raised — your therapist can see it' : 'Hand lowered');
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        [`raisedHands.${uid ?? 'client'}`]: next,
        // Also fires the shared reaction channel so the therapist sees it
        // float over their video without needing a new listener.
        ...(next ? { lastReaction: { emoji: '✋', timestamp: new Date().toISOString() } } : {}),
        'timestamps.updatedAt': new Date().toISOString(),
      });
    } catch {
      /* the raised hand still shows locally if the write fails */
    }
  }, [handRaised, sessionId, uid, showToast]);

  const sendReaction = useCallback(
    async (emoji: string) => {
      setReactionsOpen(false);
      try {
        await updateDoc(doc(db, 'liveSessions', sessionId), {
          lastReaction: { emoji, timestamp: new Date().toISOString() },
          'timestamps.updatedAt': new Date().toISOString(),
        });
      } catch {
        showToast('Could not send that reaction');
      }
    },
    [sessionId, showToast]
  );

  const toggleFullscreen = useCallback(() => {
    setMoreOpen(false);
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const therapistDisplay = therapistMeta?.name ?? therapistName;
  const therapistTitle = therapistMeta?.title ?? 'Clinical Psychologist';
  const therapistPresent = therapistOnline || remoteParticipants.length > 0;
  // The stage splits whenever the therapist puts something on it — a module or
  // the shared whiteboard. With nothing open the video keeps the whole stage.
  const moduleActive = activeModule !== null;
  const stageShared = moduleActive || whiteboardActive;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: CR.page,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        padding: 16,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: CR.ink,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1440,
          height: '100%',
          background: CR.card,
          borderRadius: 28,
          border: `1px solid ${CR.line}`,
          boxShadow: '0 24px 60px rgba(35,45,40,0.08)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* ================= HEADER =================
            With an activity on the stage the header compacts to encryption +
            timer + session info, giving the canvas the room it needs. */}
        {stageShared ? (
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 22px',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <img
              src="/assests/staad-logo-horizontal.svg"
              alt="STAAD"
              style={{ height: 34, width: 'auto', display: 'block', flexShrink: 0 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginLeft: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: `1px solid ${CR.greenSoft}`,
                  background: CR.greenSoft,
                  color: CR.greenDeep,
                  fontSize: 13,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <ShieldCheck size={15} strokeWidth={2.2} /> End-to-End Encrypted
              </span>
              <span style={{ fontSize: 12, color: CR.inkFaint, paddingLeft: 4 }}>Your session is secure</span>
            </div>

            <div style={{ flex: 1 }} />

            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: CR.inkFaint }}>
                Session Timer
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, color: CR.ink, fontVariantNumeric: 'tabular-nums' }}>
                {formatClock(elapsed)}
              </div>
            </div>

            <span style={{ width: 1, height: 38, background: CR.line, flexShrink: 0 }} />

            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.9, textTransform: 'uppercase', color: CR.inkFaint }}>
                Session Info
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: CR.ink }}>
                {startedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                {' • '}
                {startedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 12, color: CR.inkFaint }}>Individual Therapy</div>
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                className="staad-cr-ghost"
                onClick={() => { setInfoOpen((o) => !o); setSafetyOpen(false); }}
                aria-label="Session details"
                aria-expanded={infoOpen}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  border: `1px solid ${CR.line}`,
                  background: infoOpen ? CR.neutral : CR.card,
                  color: CR.inkSoft,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <ChevronDown size={17} />
              </button>
              {infoOpen && (
                <SessionInfoPanel
                  sessionId={sessionId}
                  startedAt={startedAt}
                  elapsed={elapsed}
                  clientName={clientName}
                  therapistName={therapistDisplay}
                  therapistPresent={therapistPresent}
                  onClose={() => setInfoOpen(false)}
                />
              )}
            </div>
          </header>
        ) : (
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '14px 22px',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <img
            src="/assests/staad-logo-horizontal.svg"
            alt="STAAD"
            style={{ height: 42, width: 'auto', display: 'block', flexShrink: 0 }}
          />

          {/* Therapist identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginLeft: 8, minWidth: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                flexShrink: 0,
                background: CR.greenSoft,
                border: `2px solid ${CR.card}`,
                boxShadow: `0 0 0 2px ${CR.greenSoft}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: CR.greenDeep,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              {initialsOf(therapistDisplay)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: CR.ink, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                {therapistDisplay}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12.5,
                  color: CR.inkFaint,
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                }}
              >
                {therapistTitle}
                <BadgeCheck size={14} color={CR.green} strokeWidth={2.4} />
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Encryption + call clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color={CR.green} strokeWidth={2.2} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: CR.greenDeep }}>End-to-End Encrypted</span>
            </div>
            <span style={{ width: 1, height: 22, background: CR.line }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={17} color={CR.inkSoft} strokeWidth={2} />
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: CR.ink,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: 0.3,
                }}
              >
                {formatClock(elapsed)}
              </span>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Session info + safety */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, position: 'relative' }}>
            <button
              className="staad-cr-ghost"
              onClick={() => { setInfoOpen((o) => !o); setSafetyOpen(false); }}
              aria-expanded={infoOpen}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                height: 46,
                padding: '0 18px',
                borderRadius: 14,
                border: `1px solid ${CR.line}`,
                background: infoOpen ? CR.neutral : CR.card,
                color: CR.ink,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Info size={17} strokeWidth={2} color={CR.inkSoft} />
              Session info
            </button>
            <button
              className="staad-cr-ghost"
              title="Safety & privacy"
              aria-label="Safety and privacy"
              aria-expanded={safetyOpen}
              onClick={() => { setSafetyOpen((o) => !o); setInfoOpen(false); }}
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                border: `1px solid ${safetyOpen ? CR.green : CR.greenSoft}`,
                background: CR.greenSoft,
                color: CR.greenDeep,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <ShieldCheck size={20} strokeWidth={2.1} />
            </button>

            {infoOpen && (
              <SessionInfoPanel
                sessionId={sessionId}
                startedAt={startedAt}
                elapsed={elapsed}
                clientName={clientName}
                therapistName={therapistDisplay}
                therapistPresent={therapistPresent}
                onClose={() => setInfoOpen(false)}
              />
            )}
            {safetyOpen && <SafetyPanel onClose={() => setSafetyOpen(false)} onEndSession={onEndSession} />}
          </div>
        </header>
        )}

        {/* ================= STAGE — activity (when open) + video ================= */}
        <div style={{ flex: 1, minHeight: 0, margin: '0 22px', display: 'flex', gap: 14 }}>
          {/* Whatever the therapist has put on the stage. Same synced component
              they see; read-only for the client while they hold control. */}
          {stageShared && (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
              {whiteboardActive ? (
                <StaadWhiteboard
                  sessionId={sessionId}
                  role="client"
                  isShared
                  isLocked={isLocked}
                  selfName={clientName}
                  otherName={therapistName}
                  onClose={() => {}}
                />
              ) : (
                <ActivityStage
                  sessionId={sessionId}
                  activeModule={activeModule}
                  isLocked={isLocked}
                />
              )}
            </div>
          )}

          {/* Video — full stage on its own, a side column once an activity opens */}
          <div
            style={{
              flex: stageShared ? '0 0 clamp(260px, 30%, 420px)' : 1,
              minWidth: 0,
              minHeight: 0,
              position: 'relative',
              borderRadius: 20,
              overflow: 'hidden',
              background: CR.stage,
              border: `1px solid ${CR.line}`,
            }}
          >
            <RemoteStage therapistName={therapistDisplay} present={therapistPresent} />

            {/* Safe-space badge — only on the full-width stage, no room beside a module */}
            {!stageShared && (
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: 18,
                  zIndex: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 17px',
                  borderRadius: 999,
                  background: 'rgba(24,34,29,0.55)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  color: '#ffffff',
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                <Heart size={16} color="#4ade80" fill="#4ade80" />
                You&rsquo;re in a safe space
              </div>
            )}

            {/* Self view */}
            {!selfHidden && (
              <SelfViewPip
                name={clientName}
                mirror={mirror}
                compact={stageShared}
                cameraOn={!!isCameraEnabled}
                micOn={!!isMicrophoneEnabled}
                trackRef={
                  localParticipant && cameraTrack
                    ? ({
                        participant: localParticipant,
                        source: Track.Source.Camera,
                        publication: cameraTrack,
                      } as TrackReference)
                    : undefined
                }
                participant={localParticipant}
              />
            )}

            {/* Therapist name pill — top of the column when an activity is open */}
            <div
              style={{
                position: 'absolute',
                ...(stageShared ? { top: 14, left: 14 } : { bottom: 18, left: 18 }),
                zIndex: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: stageShared ? '7px 13px' : '9px 17px',
                borderRadius: 999,
                background: 'rgba(24,34,29,0.55)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                color: '#ffffff',
                fontSize: stageShared ? 12.5 : 13.5,
                fontWeight: 600,
                maxWidth: 'calc(100% - 28px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: therapistPresent ? '#4ade80' : 'rgba(255,255,255,0.45)',
                  boxShadow: remoteSpeaking ? '0 0 0 4px rgba(74,222,128,0.35)' : 'none',
                  transition: 'box-shadow 0.2s',
                }}
              />
              {therapistDisplay}
            </div>

            {/* Raised-hand acknowledgement */}
            {handRaised && !stageShared && (
              <div
                style={{
                  position: 'absolute',
                  top: 18,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 999,
                  background: CR.amberSoft,
                  border: `1px solid ${CR.amber}`,
                  color: '#8a5a13',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <Hand size={16} /> Your hand is raised
              </div>
            )}

            {/* Incoming emoji reactions (shared with the therapist view) */}
            <ReactionOverlay sessionId={sessionId} />
          </div>
        </div>

        {/* Toast — sits above the dock so it reads the same in both layouts */}
        {toast && (
          <div
            key={toast}
            style={{
              position: 'absolute',
              bottom: 128,
              left: '50%',
              zIndex: 40,
              maxWidth: '80%',
              padding: '9px 18px',
              borderRadius: 12,
              background: 'rgba(24,34,29,0.86)',
              backdropFilter: 'blur(10px)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textAlign: 'center',
              pointerEvents: 'none',
              animation: 'staadCrToast 2.4s ease forwards',
            }}
          >
            {toast}
          </div>
        )}

        {/* ================= CONTROL DOCK =================
            Centred pill with labelled buttons on the plain call; a full-width
            bar with compact buttons once an activity takes the stage. */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            justifyContent: stageShared ? 'flex-start' : 'center',
            padding: stageShared ? '12px 22px 14px' : '16px 22px 18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: stageShared ? 10 : 6,
              flex: stageShared ? 1 : undefined,
              padding: stageShared ? '10px 18px' : '10px 14px',
              borderRadius: stageShared ? 20 : 26,
              background: CR.card,
              border: `1px solid ${CR.line}`,
              boxShadow: stageShared ? '0 6px 20px rgba(30,40,35,0.06)' : '0 12px 34px rgba(30,40,35,0.10)',
              position: 'relative',
            }}
          >
            <DockButton
              label="Mic"
              compact={stageShared}
              tone={isMicrophoneEnabled ? 'active' : 'danger'}
              onClick={toggleMic}
              title={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              icon={isMicrophoneEnabled ? <Mic size={21} /> : <MicOff size={21} />}
            />
            <DockButton
              label="Camera"
              compact={stageShared}
              tone={isCameraEnabled ? 'active' : 'danger'}
              onClick={toggleCamera}
              title={isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              icon={isCameraEnabled ? <Video size={21} /> : <VideoOff size={21} />}
            />
            <DockButton
              label="Share"
              compact={stageShared}
              tone={isScreenShareEnabled ? 'active' : 'neutral'}
              onClick={toggleShare}
              title={isScreenShareEnabled ? 'Stop sharing your screen' : 'Share your screen'}
              icon={<MonitorUp size={21} />}
            />
            <DockButton
              label="Raise Hand"
              compact={stageShared}
              tone={handRaised ? 'warn' : 'neutral'}
              onClick={toggleHand}
              title={handRaised ? 'Lower your hand' : 'Raise your hand'}
              icon={<Hand size={21} />}
            />
            <div style={{ position: 'relative' }}>
              <DockButton
                label="React"
                compact={stageShared}
                tone={reactionsOpen ? 'active' : 'neutral'}
                onClick={() => { setReactionsOpen((o) => !o); setMoreOpen(false); }}
                title="Send a reaction"
                icon={<Smile size={21} />}
              />
              {reactionsOpen && <ReactionBar onClose={() => setReactionsOpen(false)} onReaction={sendReaction} />}
            </div>
            <div style={{ position: 'relative' }}>
              <DockButton
                label="Settings"
                compact={stageShared}
                tone={moreOpen ? 'active' : 'neutral'}
                onClick={() => { setMoreOpen((o) => !o); setReactionsOpen(false); }}
                title="Settings"
                icon={<Settings size={21} />}
              />
              {moreOpen && (
                <SettingsMenu
                  onClose={() => setMoreOpen(false)}
                  mirror={mirror}
                  onToggleMirror={() => setMirror((m) => !m)}
                  selfHidden={selfHidden}
                  onToggleSelfHidden={() => setSelfHidden((h) => !h)}
                  isFullscreen={isFullscreen}
                  onToggleFullscreen={toggleFullscreen}
                />
              )}
            </div>

            {stageShared && <div style={{ flex: 1 }} />}

            <button
              onClick={onEndSession}
              className="staad-cr-end"
              style={{
                marginLeft: stageShared ? 0 : 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height: stageShared ? 48 : 58,
                padding: stageShared ? '0 22px' : '0 26px',
                borderRadius: stageShared ? 999 : 16,
                border: 'none',
                background: CR.red,
                color: '#ffffff',
                fontSize: 15.5,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(232,68,60,0.32)',
                fontFamily: 'inherit',
              }}
            >
              <PhoneOff size={20} />
              End Session
            </button>
          </div>
        </div>

      </div>

      <style>{`
        .staad-cr-ghost:hover { background: ${CR.neutral} !important; }
        .staad-cr-dock:hover { transform: translateY(-1px); }
        .staad-cr-end:hover { filter: brightness(0.95); }
        .staad-cr-menu-item:hover { background: ${CR.neutral}; }
        @keyframes staadCrToast {
          0% { opacity: 0; transform: translate(-50%, 8px); }
          12%, 82% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -6px); }
        }
        @keyframes staadCrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.06); }
        }
      `}</style>
    </div>
  );
}

/* ===== DOCK BUTTON — circular control with a label underneath ===== */
function DockButton({
  icon,
  label,
  onClick,
  tone,
  title,
  badge = 0,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: 'neutral' | 'active' | 'danger' | 'warn';
  title: string;
  badge?: number;
  /** Drops the caption and shrinks the circle for the activity-mode bar. */
  compact?: boolean;
}) {
  const palette = {
    neutral: { bg: CR.neutral, fg: CR.ink },
    active: { bg: CR.greenSoft, fg: CR.greenDeep },
    danger: { bg: CR.redSoft, fg: CR.red },
    warn: { bg: CR.amberSoft, fg: CR.amber },
  }[tone];

  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="staad-cr-dock"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 7,
        width: compact ? 48 : 84,
        padding: compact ? 0 : '4px 0 2px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        transition: 'transform 0.15s',
        fontFamily: 'inherit',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: compact ? 46 : 56,
          height: compact ? 46 : 56,
          borderRadius: '50%',
          background: palette.bg,
          color: palette.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {icon}
        {badge > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 20,
              height: 20,
              padding: '0 5px',
              borderRadius: 10,
              background: CR.red,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #fff',
            }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {!compact && (
        <span style={{ fontSize: 12, fontWeight: 600, color: CR.inkSoft, whiteSpace: 'nowrap' }}>{label}</span>
      )}
    </button>
  );
}

/* ===== REMOTE STAGE — therapist's camera, or their screen share if active ===== */
function RemoteStage({ therapistName, present }: { therapistName: string; present: boolean }) {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true }
  );

  const remote = tracks.filter((t) => !t.participant.isLocal) as TrackReference[];
  const screenShare = remote.find((t) => t.source === Track.Source.ScreenShare);
  const camera = remote.find((t) => t.source === Track.Source.Camera);
  const main = screenShare ?? camera;

  if (main) {
    return (
      <VideoTrack
        trackRef={main}
        style={{
          width: '100%',
          height: '100%',
          objectFit: screenShare ? 'contain' : 'cover',
          background: CR.stage,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: 'radial-gradient(circle at 50% 35%, #1c2f27 0%, #0f1a15 70%)',
      }}
    >
      <div
        style={{
          width: 116,
          height: 116,
          borderRadius: '50%',
          background: 'rgba(74,222,128,0.12)',
          border: '2px solid rgba(74,222,128,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8ef0b6',
          fontSize: 36,
          fontWeight: 700,
          animation: present ? 'none' : 'staadCrPulse 2.4s ease-in-out infinite',
        }}
      >
        {initialsOf(therapistName)}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: 600 }}>{therapistName}</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5 }}>
        {present ? 'Camera is off' : 'Waiting for your therapist to join…'}
      </div>
    </div>
  );
}

/* ===== SELF VIEW — picture-in-picture with connection strength ===== */
function SelfViewPip({
  trackRef,
  participant,
  name,
  cameraOn,
  micOn,
  mirror,
  compact = false,
}: {
  trackRef?: TrackReference;
  participant?: Participant;
  name: string;
  cameraOn: boolean;
  micOn: boolean;
  mirror: boolean;
  /** Sits bottom-right and smaller when the video is a side column. */
  compact?: boolean;
}) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const bars =
    quality === ConnectionQuality.Excellent ? 3 : quality === ConnectionQuality.Good ? 2 : quality === ConnectionQuality.Poor ? 1 : 0;
  const barColor = bars >= 3 ? '#4ade80' : bars === 2 ? '#a3e635' : bars === 1 ? '#fbbf24' : '#f87171';

  return (
    <div
      style={{
        position: 'absolute',
        ...(compact ? { bottom: 14, right: 14 } : { top: 18, right: 18 }),
        zIndex: 13,
        width: compact ? 'clamp(96px, 46%, 170px)' : 'clamp(160px, 19%, 260px)',
        aspectRatio: '16 / 10',
        borderRadius: compact ? 11 : 14,
        overflow: 'hidden',
        background: '#1a2620',
        border: '2px solid rgba(255,255,255,0.35)',
        boxShadow: '0 10px 28px rgba(0,0,0,0.32)',
      }}
    >
      {cameraOn && trackRef ? (
        <VideoTrack
          trackRef={trackRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: mirror ? 'scaleX(-1)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'rgba(255,255,255,0.7)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {initialsOf(name)}
          </div>
          <span style={{ fontSize: 11.5 }}>Camera off</span>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 600,
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
        }}
      >
        {!micOn && <MicOff size={13} color="#f87171" />}
        You
      </div>

      <div style={{ position: 'absolute', bottom: 9, right: 10, display: 'flex', alignItems: 'flex-end', gap: 2.5 }}>
        {[6, 9, 12].map((h, i) => (
          <span
            key={h}
            style={{
              width: 3.5,
              height: h,
              borderRadius: 2,
              background: i < bars ? barColor : 'rgba(255,255,255,0.28)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ===== REACTION BAR — its own dock button, not buried in a menu ===== */
function ReactionBar({ onClose, onReaction }: { onClose: () => void; onReaction: (emoji: string) => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 14px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 46,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '8px 10px',
          borderRadius: 999,
          background: CR.card,
          border: `1px solid ${CR.line}`,
          boxShadow: '0 14px 34px rgba(30,40,35,0.16)',
        }}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onReaction(emoji)}
            title={`Send ${emoji}`}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              fontSize: 21,
              cursor: 'pointer',
              transition: 'transform 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.25)';
              e.currentTarget.style.background = CR.neutral;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

/* ===== SETTINGS MENU — devices and view options ===== */
function SettingsMenu({
  onClose,
  mirror,
  onToggleMirror,
  selfHidden,
  onToggleSelfHidden,
  isFullscreen,
  onToggleFullscreen,
}: {
  onClose: () => void;
  mirror: boolean;
  onToggleMirror: () => void;
  selfHidden: boolean;
  onToggleSelfHidden: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
      <div
        role="menu"
        style={{
          position: 'absolute',
          bottom: 'calc(100% + 14px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 46,
          width: 286,
          background: CR.card,
          border: `1px solid ${CR.line}`,
          borderRadius: 18,
          boxShadow: '0 18px 44px rgba(30,40,35,0.18)',
          padding: 10,
          maxHeight: '58vh',
          overflowY: 'auto',
        }}
      >
        <DeviceSection kind="videoinput" label="Camera" icon={<Camera size={15} />} />
        <DeviceSection kind="audioinput" label="Microphone" icon={<Mic size={15} />} />
        <DeviceSection kind="audiooutput" label="Speaker" icon={<Volume2 size={15} />} />

        <Divider />
        <MenuLabel>View</MenuLabel>
        <MenuItem
          icon={<Smile size={16} />}
          label="Mirror my video"
          trailing={mirror ? 'On' : 'Off'}
          onClick={onToggleMirror}
        />
        <MenuItem
          icon={<VideoOff size={16} />}
          label={selfHidden ? 'Show self view' : 'Hide self view'}
          onClick={onToggleSelfHidden}
        />
        <MenuItem
          icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          label={isFullscreen ? 'Exit full screen' : 'Full screen'}
          onClick={onToggleFullscreen}
        />
      </div>
    </>
  );
}

function DeviceSection({ kind, label, icon }: { kind: MediaDeviceKind; label: string; icon: React.ReactNode }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  if (devices.length === 0) return null;

  return (
    <div style={{ padding: '2px 0 6px' }}>
      <MenuLabel>{label}</MenuLabel>
      {devices.map((d, i) => {
        const selected = d.deviceId === activeDeviceId;
        return (
          <button
            key={d.deviceId || `${kind}-${i}`}
            className="staad-cr-menu-item"
            onClick={() => {
              setActiveMediaDevice(d.deviceId).catch(() => {});
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 10,
              border: 'none',
              background: selected ? CR.greenSoft : 'transparent',
              color: selected ? CR.greenDeep : CR.ink,
              fontSize: 12.5,
              fontWeight: selected ? 600 : 500,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ flexShrink: 0, color: selected ? CR.green : CR.inkFaint, display: 'flex' }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label || `${label} ${i + 1}`}
            </span>
            {selected && <Check size={14} />}
          </button>
        );
      })}
    </div>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '6px 10px 4px',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: CR.inkFaint,
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: string;
}) {
  return (
    <button
      className="staad-cr-menu-item"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '9px 10px',
        borderRadius: 10,
        border: 'none',
        background: 'transparent',
        color: CR.ink,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <span style={{ color: CR.inkSoft, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {trailing && <span style={{ fontSize: 11.5, fontWeight: 600, color: CR.inkFaint }}>{trailing}</span>}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: CR.line, margin: '6px 4px' }} />;
}

/* ===== SESSION INFO POPOVER ===== */
function SessionInfoPanel({
  sessionId,
  startedAt,
  elapsed,
  clientName,
  therapistName,
  therapistPresent,
  onClose,
}: {
  sessionId: string;
  startedAt: Date;
  elapsed: number;
  clientName: string;
  therapistName: string;
  therapistPresent: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the id stays visible for manual copying */
    }
  };

  return (
    <Popover onClose={onClose} width={340}>
      <PopoverTitle icon={<Info size={16} color={CR.green} />} title="Session info" onClose={onClose} />
      <InfoRow label="Session ID">
        <button
          onClick={copyId}
          title="Copy session ID"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            color: CR.ink,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sessionId}
          </span>
          {copied ? <Check size={14} color={CR.green} /> : <Copy size={14} color={CR.inkFaint} />}
        </button>
      </InfoRow>
      <InfoRow label="Joined at">{startedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</InfoRow>
      <InfoRow label="Duration">{formatClock(elapsed)}</InfoRow>
      <InfoRow label="Therapist">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: therapistPresent ? CR.green : CR.inkFaint,
            }}
          />
          {therapistName}
        </span>
      </InfoRow>
      <InfoRow label="You">{clientName}</InfoRow>
      <div
        style={{
          display: 'flex',
          gap: 9,
          marginTop: 10,
          padding: 11,
          borderRadius: 12,
          background: CR.greenSoft,
          color: CR.greenDeep,
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Audio and video are encrypted in transit. Nothing is recorded without your consent.</span>
      </div>
    </Popover>
  );
}

/* ===== SAFETY / PRIVACY POPOVER ===== */
function SafetyPanel({ onClose, onEndSession }: { onClose: () => void; onEndSession: () => void }) {
  return (
    <Popover onClose={onClose} width={330}>
      <PopoverTitle icon={<ShieldCheck size={16} color={CR.green} />} title="Your safety" onClose={onClose} />
      <ul style={{ listStyle: 'none', padding: 0, margin: '2px 0 12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {[
          'This session is private between you and your therapist.',
          'You can turn your camera or microphone off at any time.',
          'You may leave the session whenever you need to.',
        ].map((line) => (
          <li key={line} style={{ display: 'flex', gap: 9, fontSize: 12.5, color: CR.inkSoft, lineHeight: 1.55 }}>
            <Check size={15} color={CR.green} style={{ flexShrink: 0, marginTop: 1 }} />
            {line}
          </li>
        ))}
      </ul>
      <div style={{ padding: 12, borderRadius: 12, background: CR.neutral, fontSize: 12, color: CR.inkSoft, lineHeight: 1.6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: CR.ink, marginBottom: 5 }}>
          <LifeBuoy size={15} color={CR.amber} /> Need urgent help?
        </div>
        Tele-MANAS: <strong>14416</strong>
        <br />
        KIRAN helpline: <strong>1800-599-0019</strong>
      </div>
      <button
        onClick={() => {
          onClose();
          onEndSession();
        }}
        style={{
          marginTop: 12,
          width: '100%',
          height: 40,
          borderRadius: 12,
          border: `1px solid ${CR.red}`,
          background: CR.redSoft,
          color: CR.red,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Leave session now
      </button>
    </Popover>
  );
}

function Popover({ children, onClose, width }: { children: React.ReactNode; onClose: () => void; width: number }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 45 }} />
      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 12px)',
          right: 0,
          zIndex: 46,
          width,
          padding: 14,
          borderRadius: 18,
          background: CR.card,
          border: `1px solid ${CR.line}`,
          boxShadow: '0 18px 44px rgba(30,40,35,0.18)',
        }}
      >
        {children}
      </div>
    </>
  );
}

function PopoverTitle({ icon, title, onClose }: { icon: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      {icon}
      <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: CR.ink }}>{title}</span>
      <button
        onClick={onClose}
        aria-label={`Close ${title}`}
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          color: CR.inkFaint,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: `1px solid ${CR.line}`,
        fontSize: 12.5,
      }}
    >
      <span style={{ color: CR.inkFaint, fontWeight: 500 }}>{label}</span>
      <span style={{ color: CR.ink, fontWeight: 600, minWidth: 0 }}>{children}</span>
    </div>
  );
}

/* ===== ACTIVITY STAGE — the therapist's launched module, mirrored =====
   Same synced module component the therapist drives. While they hold control
   the client sees it but cannot interact, with a clear notice saying so. */
function ActivityStage({
  sessionId,
  activeModule,
  isLocked,
}: {
  sessionId: string;
  activeModule: string | null;
  isLocked: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 20,
        overflow: 'hidden',
        background: CR.card,
        border: `1px solid ${CR.line}`,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          height: 50,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: `1px solid ${CR.line}`,
          color: CR.ink,
          fontSize: 14.5,
          fontWeight: 700,
        }}
      >
        {activeModule ? moduleName(activeModule) : 'Activity'}
        {isLocked && (
          <span
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 11px',
              borderRadius: 999,
              background: CR.amberSoft,
              border: `1px solid ${CR.amber}`,
              color: '#8a5a13',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <Lock size={12} /> Therapist is guiding
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 12 }}>
          <ModuleContent
            activeModule={activeModule}
            sessionId={sessionId}
            role="client"
            isLocked={isLocked}
            isTherapist={false}
          />
        </div>
        {/* While the therapist holds control the client watches but can't drive. */}
        {isLocked && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              background: 'rgba(255,255,255,0.35)',
              cursor: 'not-allowed',
            }}
          />
        )}
      </div>
    </div>
  );
}
