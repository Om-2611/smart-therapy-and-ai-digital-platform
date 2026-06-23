'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Mic, MicOff, Camera, CameraOff, PhoneOff, Lock, LockOpen,
  StickyNote, Settings, Smile, BookOpen, Sparkles, Maximize2, Minimize2,
  Blocks, NotebookPen, Lightbulb,
} from 'lucide-react';
import AIInsightBar from '@/components/session/AIInsightBar';
import AIConsentBanner from '@/components/session/AIConsentBanner';
import { AIErrorBoundary } from '@/components/session/AIErrorBoundary';
import { useSessionTranscription } from '@/hooks/useSessionTranscription';
import { useLocalParticipant } from '@livekit/components-react';
import StaadVideo, { useSessionRoom } from '@/components/StaadVideo';
import RemoteVideoArea from '@/components/RemoteVideoArea';
import LocalVideoPip from '@/components/LocalVideoPip';
import GlassModulePanel from '@/components/GlassModulePanel';
import NotesPanel from '@/components/NotesPanel';
import ReactionOverlay from '@/components/ReactionOverlay';
import ModuleSelectorPanel from '@/components/ModuleSelectorPanel';
import { resolveAllowedModuleIds } from '@/lib/modules';

interface SessionState {
  sessionId: string;
  activeModuleId: string | null;
  participants: Record<string, { uid: string; name: string; role: string; isOnline: boolean }>;
  timestamps: { createdAt: string; updatedAt: string };
}

/* ===== Room colour palette (demo re-skin) — scoped to the session room only ===== */
const RC = {
  pageBg: '#eef1f4',
  panel: '#ffffff',
  green: '#3fae6a',
  greenDark: '#2f9457',
  greenSoft: 'rgba(63,174,106,0.12)',
  greenGlow: 'rgba(63,174,106,0.30)',
  border: '#e7eaef',
  ink: '#2b2f33',
  inkMuted: '#9aa0a6',
  tile: '#f3f5f8',
  tileActive: 'rgba(63,174,106,0.14)',
  red: '#ff5a5f',
  redSoft: 'rgba(255,90,95,0.12)',
  videoBg: '#ffffff',
};

// Thin wrapper so the transcription hook runs INSIDE <StaadVideo>'s room
// context (it reads the LiveKit room via useSessionRoom). Renders nothing;
// it just relays the recording state up to the page for the status chip.
function TranscriptionBridge({
  sessionId,
  enabled,
  userRole,
  onState,
}: {
  sessionId: string;
  enabled: boolean;
  userRole: 'therapist' | 'client';
  onState: (s: { isRecording: boolean; chunkCount: number }) => void;
}) {
  const { isRecording, chunkCount } = useSessionTranscription({ sessionId, enabled, userRole });
  useEffect(() => {
    onState({ isRecording, chunkCount });
  }, [isRecording, chunkCount, onState]);
  return null;
}

export default function SessionRoomPage({ params }: { params: { sessionId: string } }) {
  const sessionId = params.sessionId;

  const { uid, role, profile } = useAuthStore();
  const { setActiveSessionId, setTherapistControl } = useSessionStore();
  const router = useRouter();

  const isTherapist = role === 'THERAPIST';

  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef(Date.now());
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [isModuleActive, setIsModuleActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const [aiInsight, setAiInsight] = useState<any>(null);
  const [insightVisible, setInsightVisible] = useState(false);
  const [analyseLoading, setAnalyseLoading] = useState(false);
  const [analyseCooldown, setAnalyseCooldown] = useState(false);
  const [showConsentBanner, setShowConsentBanner] = useState(true);
  const [consentStatus, setConsentStatus] = useState<{ therapist: boolean; client: boolean } | null>(null);
  const [myConsent, setMyConsent] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // The room should open in full screen. Browsers block programmatic fullscreen
  // without a user gesture, so we try immediately and also fall back to the first
  // interaction. The toggle button lets the user return to the normal view.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    const tryFs = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    tryFs();
    const onFirstGesture = () => tryFs();
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('pointerdown', onFirstGesture);
    };
  }, []);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const handleModuleLaunch = async (moduleId: string, moduleName: string) => {
    await handleModuleSwitch(moduleId);
    setSelectorOpen(false);
    showToast(`${moduleName} launched`);
    // Log module usage for the admin dashboard (best-effort).
    if (isTherapist && profile?.id) {
      fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId: profile.id, type: 'MODULE_LAUNCH', label: moduleId, sessionId }),
      }).catch(() => {});
    }
  };

  const handleModuleClose = async () => {
    if (!isTherapist) return;
    await updateDoc(doc(db, 'liveSessions', sessionId), {
      activeModuleId: null,
      'timestamps.updatedAt': new Date().toISOString(),
    });
    if (selectorOpen) setSelectorOpen(false);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!uid) {
      router.push('/auth');
      return;
    }

    setActiveSessionId(sessionId);

    const ensureSessionExists = async () => {
      const liveRef = doc(db, 'liveSessions', sessionId);
      const liveSnap = await getDoc(liveRef);
      if (!liveSnap.exists()) {
        await setDoc(liveRef, {
          sessionId,
          activeModuleId: null,
          therapistControl: false,
          participants: {
            [uid]: {
              uid,
              name: profile ? `${profile.firstName} ${profile.lastName}` : 'User',
              role: isTherapist ? 'therapist' : 'client',
              isOnline: true,
              lastSeen: new Date().toISOString(),
            },
          },
          timestamps: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }

      const sessionDocRef = doc(db, 'sessions', sessionId);
      const sessionSnap = await getDoc(sessionDocRef);
      if (!sessionSnap.exists()) {
        await setDoc(sessionDocRef, {
          sessionId,
          aiConsent: {},
          createdAt: new Date().toISOString(),
        });
      }
    };
    ensureSessionExists();

    const sessionRef = doc(db, 'liveSessions', sessionId);
    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as SessionState & { therapistControl?: boolean };
        setSessionState(data);
        setActiveModule(data.activeModuleId);
        if (typeof data.therapistControl === 'boolean') {
          setIsLocked(data.therapistControl);
        }
        if (!isTherapist && data.participants) {
          const therapist = Object.values(data.participants).find(p => p.role === 'therapist');
          setTherapistControl(therapist?.isOnline || false);
        }
      }
      setLoading(false);
    });

    updateDoc(doc(db, 'liveSessions', sessionId), {
      [`participants.${uid}`]: {
        uid,
        name: `${profile?.firstName} ${profile?.lastName}`,
        role: isTherapist ? 'therapist' : 'client',
        isOnline: true,
        lastSeen: new Date().toISOString(),
      },
    }).catch(() => {});

    return () => unsubscribe();
  }, [sessionId, uid, role, profile, router, setActiveSessionId, setTherapistControl, isTherapist]);

  // Promote the scheduled session to ACTIVE once someone joins the room.
  // Idempotent on the server: only a SCHEDULED session is transitioned.
  useEffect(() => {
    if (!uid || !sessionId) return;
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }).catch(() => {});
  }, [uid, sessionId]);

  useEffect(() => {
    setIsModuleActive(activeModule !== null);
  }, [activeModule]);

  useEffect(() => {
    if (!uid) return;

    const sessionRef = doc(db, 'sessions', sessionId);

    getDoc(sessionRef).then((snap) => {
      if (snap.exists()) {
        const aiConsent = snap.data()?.aiConsent ?? {};
        const myKey = isTherapist ? 'therapist' : 'client';
        if (aiConsent[myKey] != null) {
          setShowConsentBanner(false);
          setMyConsent(aiConsent[myKey]);
        }
      }
    });

    const unsub = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const aiConsent = data?.aiConsent ?? {};
        setConsentStatus(aiConsent);

        const myKey = isTherapist ? 'therapist' : 'client';
        if (aiConsent[myKey] != null) {
          setShowConsentBanner(false);
        }

        if (isTherapist && data?.aiInsight) {
          setAiInsight(data.aiInsight);
          setInsightVisible(true);
        }
      }
    });

    return () => unsub();
  }, [sessionId, uid, isTherapist]);

  const handleModuleSwitch = async (moduleId: string) => {
    if (!isTherapist) return;
    try {
      await updateDoc(doc(db, 'liveSessions', sessionId), {
        activeModuleId: moduleId,
        'timestamps.updatedAt': new Date().toISOString(),
      });
    } catch {
      setActiveModule(moduleId);
    }
  };

  const handleLockToggle = async () => {
    const next = !isLocked;
    setIsLocked(next);
    await updateDoc(doc(db, 'liveSessions', sessionId), {
      therapistControl: next,
      'timestamps.updatedAt': new Date().toISOString(),
    }).catch(() => {});
  };

  const handleAnalyse = async () => {
    if (analyseLoading || analyseCooldown) return;
    setAnalyseLoading(true);
    const clientParticipant = Object.values(participants).find((p) => p.role === 'client');
    try {
      const res = await fetch('/api/ai-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          therapistId: uid,
          // Route expects `clientProfile` (was `client` — the mismatch made the
          // copilot button 400 every time).
          clientProfile: {
            clientId: clientParticipant?.uid ?? '',
            name: clientParticipant?.name ?? 'Client',
            age: 0,
            conditions: [],
            sessionNumber: 1,
            therapistId: uid,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Analysis failed');
      }
      setAnalyseCooldown(true);
      setTimeout(() => setAnalyseCooldown(false), 30000);
      showToast('Analysis complete');
    } catch (e) {
      console.error('Analyse error:', e);
      showToast('Analysis failed. Try again.');
    } finally {
      setAnalyseLoading(false);
    }
  };

  const handleLaunchModule = (moduleSlug: string) => {
    handleModuleSwitch(moduleSlug);
    showToast(`Launching ${moduleSlug}`);
  };

  const handleConsent = async (given: boolean) => {
    setMyConsent(given);
    const roleKey = isTherapist ? 'therapist' : 'client';
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        [`aiConsent.${roleKey}`]: given,
      });
    } catch (e) {
      console.error('Consent write failed:', e);
    }
    setShowConsentBanner(false);
  };

  const handleCopySessionId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleLeaveSession = async () => {
    if (uid) {
      try {
        await updateDoc(doc(db, 'liveSessions', sessionId), {
          [`participants.${uid}.isOnline`]: false,
          status: 'ended',
          'timestamps.updatedAt': new Date().toISOString(),
        });
      } catch {}
    }
    // Mark the scheduled session as COMPLETED in the database so it moves into
    // the client's session history once the call is cut.
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      });
    } catch {}
    // Log transcription volume for the admin dashboard (therapist side, best-effort).
    if (isTherapist && profile?.id && transcription.chunkCount > 0) {
      try {
        await fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ therapistId: profile.id, type: 'TRANSCRIPTION', count: transcription.chunkCount, sessionId }),
        });
      } catch {}
    }
    // Kick off the end-of-session AI report while the transcript is still fresh
    // in Firestore (the cleanup cron clears transcripts after 24h). `keepalive`
    // lets the request outlive the imminent redirect; the server route runs the
    // LLM generation to completion independently of this page.
    if (isTherapist) {
      try {
        fetch('/api/session-report', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch {}
    }
    setActiveSessionId(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  const participants = sessionState?.participants || {};
  const onlineCount = Object.values(participants).filter((p) => p.isOnline).length;
  const clientParticipant = Object.values(participants).find((p) => p.role === 'client');
  const clientName = clientParticipant?.name || 'Client';

  const participantName = isTherapist ? clientName : (Object.values(participants).find((p) => p.role === 'therapist')?.name || 'Therapist');
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const userRole = isTherapist ? 'therapist' as const : 'client' as const;
  const therapistConsented = consentStatus?.therapist === true;
  const clientConsented = consentStatus?.client === true;
  const bothConsented = therapistConsented && clientConsented;
  // Dev test mode: let transcription run with just the therapist present+consented
  // so the pipeline can be verified solo (no second participant needed).
  const sttTestMode = process.env.NEXT_PUBLIC_STT_TEST_MODE === 'true';
  const transcriptionEnabled = sttTestMode ? therapistConsented : bothConsented;
  // The transcription hook needs the LiveKit room from <StaadVideo>'s context,
  // so it must run INSIDE that provider — see <TranscriptionBridge> rendered in
  // the JSX below. We lift just the bits we display/use back up to here.
  const [transcription, setTranscription] = useState<{ isRecording: boolean; chunkCount: number }>({
    isRecording: false,
    chunkCount: 0,
  });

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: '#0d1614' }}>
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent mx-auto" style={{ borderColor: 'var(--sage-mid)', borderTopColor: 'transparent' }} />
          <p className="mt-4 font-medium" style={{ color: 'var(--ink-muted)', fontSize: 14 }}>Joining session room...</p>
        </div>
      </div>
    );
  }

  return (
    <StaadVideo
      sessionId={sessionId}
      userName={profile ? `${profile.firstName} ${profile.lastName}` : 'User'}
      role={isTherapist ? 'therapist' : 'client'}
    >
      {/* Runs the Sarvam pipeline inside the room provider so it can access the
          LiveKit room; reports recording state up to this page for the chip. */}
      <TranscriptionBridge
        sessionId={sessionId}
        enabled={transcriptionEnabled}
        userRole={userRole}
        onState={setTranscription}
      />
      <div style={{ width: '100vw', height: '100vh', background: RC.pageBg, overflow: 'hidden', position: 'relative', display: 'flex' }}>
        {/* ===== MAIN COLUMN (full width — no left rail) ===== */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 12 }}>
          {/* ---- Top strip: participant thumbnails + meta ---- */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0, overflowX: 'auto', paddingBottom: 2 }}>
              {Object.values(participants).map((p) =>
                p.uid === uid ? (
                  <LocalVideoPip key={p.uid} docked />
                ) : (
                  <ParticipantThumb key={p.uid} name={p.name} online={p.isOnline} self={false} />
                )
              )}
            </div>

            {/* Transcription status — Live / online / timer were moved onto the
                video timer pill. Centred when a tool occupies the right column. */}
            {isTherapist && transcriptionEnabled && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: transcription.isRecording ? RC.greenDark : RC.inkMuted,
                  ...(isModuleActive
                    ? { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
                    : {}),
                }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: transcription.isRecording ? RC.green : RC.border, animation: transcription.isRecording ? 'pulse 1.4s ease infinite' : 'none' }} />
                {transcription.isRecording ? `${transcription.chunkCount} lines` : 'transcript off'}
              </div>
            )}

            {/* Full-screen toggle — stays at the far right regardless of tool state */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: `1px solid ${RC.border}`, background: RC.panel, color: RC.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          {/* ---- Main row: video stage + right module panel ---- */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
            {/* Video stage (relative — overlays float above the rounded card, un-clipped) */}
            <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {/* Rounded green video card */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: 24, overflow: 'hidden', background: RC.videoBg, border: `2px solid ${RC.green}`, boxShadow: `0 0 0 5px ${RC.greenSoft}, 0 18px 44px rgba(20,40,30,0.18)` }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <RemoteVideoArea participantName={participantName} />
                  </div>

                  {/* Timer pill (top-left over video) — timer + online count */}
                  <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 15, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: RC.red, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: RC.ink, fontFamily: 'monospace' }}>{timerStr}</span>
                    <span style={{ width: 1, height: 12, background: 'rgba(0,0,0,0.12)', display: 'inline-block' }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: RC.greenDark }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: RC.green, display: 'inline-block' }} />
                      {onlineCount} online
                    </span>
                  </div>

                  {/* Floating pill control bar — patient only. The therapist's
                      controls live inline in the bottom toolbar line (below). */}
                  {!isTherapist && (
                    <PillControls
                      onEndClick={() => setShowConfirm(true)}
                      reactionBarOpen={reactionBarOpen}
                      onToggleReactions={() => setReactionBarOpen((o) => !o)}
                    />
                  )}
                </div>

                {/* ---- Overlays (kept as dark widgets, float above the card) ---- */}
                {isTherapist && (
                  <ModuleSelectorPanel
                    open={selectorOpen}
                    onClose={() => setSelectorOpen(false)}
                    onLaunch={handleModuleLaunch}
                    allowedModuleIds={resolveAllowedModuleIds(profile)}
                  />
                )}

                {isTherapist && (
                  <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} sessionId={sessionId} />
                )}

                <ReactionOverlay sessionId={sessionId} />

                {isTherapist && (
                  <AIErrorBoundary>
                    <AIInsightBar
                      insight={aiInsight}
                      visible={insightVisible}
                      onDismiss={() => setInsightVisible(false)}
                      onLaunchModule={handleLaunchModule}
                    />
                  </AIErrorBoundary>
                )}

                {/* Toast notification */}
                {toast && (
                  <div
                    key={toast}
                    style={{ position: 'absolute', bottom: 84, left: '50%', zIndex: 50, pointerEvents: 'none', animation: 'toastInOut 2.2s ease forwards' }}
                  >
                    <div style={{ background: RC.green, color: '#fff', padding: '7px 16px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', transform: 'translateX(-50%)', boxShadow: '0 6px 18px rgba(63,174,106,0.35)' }}>
                      ✓ {toast}
                    </div>
                  </div>
                )}
              </div>

              {/* ---- Bottom toolbar: call controls pinned left, feature tiles centered ---- */}
              {isTherapist && (
                <div style={{ flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 66 }}>
                  <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)' }}>
                    <PillControls
                      inline
                      onEndClick={() => setShowConfirm(true)}
                      reactionBarOpen={reactionBarOpen}
                      onToggleReactions={() => setReactionBarOpen((o) => !o)}
                    />
                  </div>
                  <FeatureToolbar
                    isTherapist={isTherapist}
                    selectorOpen={selectorOpen}
                    onToggleTherapy={() => setSelectorOpen((o) => !o)}
                    notesOpen={notesOpen}
                    onToggleNotes={() => setNotesOpen((o) => !o)}
                    isLocked={isLocked}
                    onToggleLock={handleLockToggle}
                    analyseLoading={analyseLoading}
                    analyseCooldown={analyseCooldown}
                    consentGiven={bothConsented}
                    onAnalyse={handleAnalyse}
                  />
                </div>
              )}
            </div>

          </div>
        </div>

        {/* ---- Full-height tool panel — a launched module uses the entire right
             column, top to bottom of the screen ---- */}
        <div style={{
          width: isModuleActive ? 420 : 0,
          minWidth: isModuleActive ? 420 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          justifyContent: 'flex-end',
          padding: isModuleActive ? '12px 16px 12px 0' : 0,
        }}>
          <GlassModulePanel
            sessionId={sessionId}
            activeModule={activeModule}
            isTherapist={isTherapist}
            isLocked={isLocked}
            onModuleSwitch={handleModuleSwitch}
            onLockToggle={handleLockToggle}
            onClose={handleModuleClose}
          />
        </div>

        {/* ===== AI CONSENT BANNER ===== */}
        <AIErrorBoundary>
          {showConsentBanner && (
            <AIConsentBanner
              userRole={userRole}
              onConsent={handleConsent}
              otherPartyConsented={
                userRole === 'therapist'
                  ? clientConsented
                  : therapistConsented
              }
            />
          )}
        </AIErrorBoundary>

        {/* Confirm dialog */}
        {showConfirm && (
          <ConfirmEndDialog
            onCancel={() => setShowConfirm(false)}
            onConfirmed={handleLeaveSession}
          />
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </StaadVideo>
  );
}

/* ===== PILL CONTROLS — mic / camera / end / react / settings =====
   `inline` renders the cluster without absolute positioning so it can sit in the
   bottom toolbar line (therapist). Default (floating) overlays the video for the
   patient. */
function PillControls({
  onEndClick,
  reactionBarOpen,
  onToggleReactions,
  inline = false,
}: {
  onEndClick: () => void;
  reactionBarOpen: boolean;
  onToggleReactions: () => void;
  inline?: boolean;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  const toggleMic = () => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCam = () => {
    if (!localParticipant) return;
    localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const circle = (active = false): React.CSSProperties => ({
    width: 46,
    height: 46,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    background: active ? RC.tileActive : RC.tile,
    color: active ? RC.greenDark : RC.ink,
    transition: 'all 0.15s',
  });

  const containerStyle: React.CSSProperties = inline
    ? { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 999, background: RC.panel, border: `1px solid ${RC.border}`, boxShadow: '0 6px 18px rgba(20,30,40,0.05)' }
    : { position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', boxShadow: '0 10px 30px rgba(0,0,0,0.22)' };

  return (
    <div style={containerStyle}>
      <button
        title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        onClick={toggleMic}
        style={{ ...circle(), background: !isMicrophoneEnabled ? RC.redSoft : RC.tile, color: !isMicrophoneEnabled ? RC.red : RC.ink }}
      >
        {isMicrophoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
      </button>
      <button
        title={isCameraEnabled ? 'Stop camera' : 'Start camera'}
        onClick={toggleCam}
        style={{ ...circle(), background: !isCameraEnabled ? RC.redSoft : RC.tile, color: !isCameraEnabled ? RC.red : RC.ink }}
      >
        {isCameraEnabled ? <Camera size={19} /> : <CameraOff size={19} />}
      </button>
      <button title="Reactions" onClick={onToggleReactions} style={circle(reactionBarOpen)}>
        <Smile size={19} />
      </button>
      <button title="End call" onClick={onEndClick} style={{ ...circle(), width: 54, height: 54, background: RC.red, color: '#fff', boxShadow: '0 6px 16px rgba(255,90,95,0.4)' }}>
        <PhoneOff size={21} />
      </button>
      {!inline && (
        <button title="Settings" style={circle(false)}>
          <Settings size={19} />
        </button>
      )}
    </div>
  );
}

/* ===== BOTTOM FEATURE TOOLBAR — Module / Note / AI Copilot / Control + invite ===== */
function FeatureToolbar({
  isTherapist,
  selectorOpen,
  onToggleTherapy,
  notesOpen,
  onToggleNotes,
  isLocked,
  onToggleLock,
  analyseLoading,
  analyseCooldown,
  consentGiven,
  onAnalyse,
}: {
  isTherapist: boolean;
  selectorOpen: boolean;
  onToggleTherapy: () => void;
  notesOpen: boolean;
  onToggleNotes: () => void;
  isLocked: boolean;
  onToggleLock: () => void;
  analyseLoading: boolean;
  analyseCooldown: boolean;
  consentGiven: boolean;
  onAnalyse: () => void;
}) {
  if (!isTherapist) return null;

  // Each tile gets its own bright accent. Inactive = soft tint + coloured icon,
  // active = solid fill + white — clear, colourful, non-greyscale.
  const tile = (accent: string, active: boolean, disabled = false): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    minWidth: 76,
    padding: '10px 10px',
    borderRadius: 16,
    border: `1.5px solid ${active ? accent : accent + '4D'}`,
    background: active ? accent : accent + '16',
    color: active ? '#ffffff' : accent,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontSize: 11,
    fontWeight: 600,
    boxShadow: active ? `0 4px 14px ${accent}55` : 'none',
    transition: 'all 0.15s',
  });

  const C = { module: '#2f80ed', notes: '#f2994a', copilot: '#9b51e0', control: '#27ae60' };

  return (
    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 14px', borderRadius: 18, background: RC.panel, border: `1px solid ${RC.border}`, boxShadow: '0 6px 18px rgba(20,30,40,0.05)' }}>
      <button onClick={onToggleTherapy} style={tile(C.module, selectorOpen)}>
        <Blocks size={19} /> Module
      </button>
      <button onClick={onToggleNotes} style={tile(C.notes, notesOpen)}>
        <NotebookPen size={19} /> Note
      </button>
      <button onClick={onAnalyse} disabled={!consentGiven || analyseCooldown} style={tile(C.copilot, analyseLoading, !consentGiven || analyseCooldown)} title={consentGiven ? 'Analyse session' : 'Both must consent first'}>
        <span className={analyseLoading ? 'animate-spin' : ''} style={{ display: 'inline-flex' }}>
          <Lightbulb size={19} />
        </span>
        AI Copilot
      </button>
      <button onClick={onToggleLock} style={tile(C.control, isLocked)}>
        {isLocked ? <Lock size={19} /> : <LockOpen size={19} />}
        Control
      </button>
    </div>
  );
}

/* ===== PARTICIPANT THUMBNAIL — top strip ===== */
function ParticipantThumb({ name, online, self }: { name: string; online: boolean; self: boolean }) {
  return (
    <div style={{ position: 'relative', width: 132, height: 78, borderRadius: 14, flexShrink: 0, overflow: 'hidden', background: '#f3f5f8', border: `1px solid ${RC.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: RC.greenSoft, border: `2px solid ${RC.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: RC.greenDark, fontSize: 18, fontWeight: 600 }}>
        {name?.charAt(0)?.toUpperCase() || '?'}
      </div>
      <div style={{ position: 'absolute', bottom: 6, left: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.92)', fontSize: 10, fontWeight: 600, color: RC.ink }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? RC.green : RC.inkMuted }} />
        {self ? 'You' : name}
      </div>
    </div>
  );
}

/* ===== CONFIRM END DIALOG ===== */
function ConfirmEndDialog({
  onCancel,
  onConfirmed,
}: {
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const { disconnect } = useSessionRoom();

  const handleEnd = () => {
    disconnect();
    onConfirmed();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--glass-strong)',
          backdropFilter: 'blur(20px)',
          borderRadius: 16,
          padding: '24px 28px',
          border: '1px solid var(--glass-border)',
          maxWidth: 320,
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
          End this session?
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--ink-muted)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleEnd}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}
