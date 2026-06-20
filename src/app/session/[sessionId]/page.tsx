'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Mic, MicOff, Camera, CameraOff, PhoneOff, Lock, LockOpen,
  StickyNote, Settings, Smile, Users, BookOpen, Copy, Sparkles,
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
          client: {
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
  const transcription = useSessionTranscription({
    sessionId,
    enabled: bothConsented,
    userRole,
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
      <div style={{ width: '100vw', height: '100vh', background: '#0d1614', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* ===== TOP BAR ===== */}
        <header
          style={{
            height: 48,
            flexShrink: 0,
            background: 'var(--glass-strong)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--glass-border)',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            gap: 12,
          }}
        >
          <img
            src="/assests/staad-logo-horizontal.svg"
            alt="STAAD"
            style={{ height: 40, width: 'auto', display: 'block' }}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'var(--accent-bg)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            <span className="animate-pulse-slow" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
            Live
          </div>

          <button
            onClick={handleCopySessionId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: copied ? 'rgba(74,124,111,0.15)' : 'transparent',
              color: copied ? 'var(--sage-mid)' : 'var(--ink)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {clientName}
            <span style={{ fontSize: 10, color: copied ? 'var(--sage-mid)' : 'var(--ink-faint)', fontFamily: 'monospace' }}>
              #{sessionId.slice(0, 6)}
            </span>
            {copied ? (
              <span style={{ fontSize: 9, color: 'var(--sage-mid)' }}>Copied!</span>
            ) : (
              <Copy size={11} style={{ color: 'var(--ink-faint)' }} />
            )}
          </button>

          <div style={{ flex: 1 }} />

          <div className="flex items-center gap-2" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <span>{onlineCount} online</span>
          </div>

          {isTherapist && bothConsented && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              color: transcription.isRecording ? '#4caf86' : 'rgba(255,255,255,0.3)',
            }}>
              <div style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                background: transcription.isRecording ? '#4caf86' : 'rgba(255,255,255,0.2)',
                animation: transcription.isRecording ? 'pulse 1.4s ease infinite' : 'none',
              }} />
              {transcription.isRecording
                ? `${transcription.chunkCount} lines`
                : 'transcript off'}
            </div>
          )}

          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', fontFamily: 'monospace' }}>
            {timerStr}
          </span>

          <button
            onClick={() => setNotesOpen((o) => !o)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: notesOpen ? 'var(--sage-mid)' : 'var(--ink-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <StickyNote size={14} />
          </button>
          <button
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid var(--glass-border)',
              background: 'transparent',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >
            <Settings size={14} />
          </button>
        </header>

        {/* ===== MAIN AREA ===== */}
        <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'row',
          }}>
            {/* Video + overlays area */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, #111f1c 0%, #0d1614 50%, #0f1e1a 100%)',
                zIndex: 1,
              }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <RemoteVideoArea participantName={participantName} />
                </div>
                <LocalVideoPip />
              </div>

              {/* Module Selector Panel — therapist only */}
              {isTherapist && (
                <ModuleSelectorPanel
                  open={selectorOpen}
                  onClose={() => setSelectorOpen(false)}
                  onLaunch={handleModuleLaunch}
                  allowedModuleIds={resolveAllowedModuleIds(profile)}
                />
              )}

              {/* Notes Panel */}
              {isTherapist && (
                <NotesPanel open={notesOpen} onClose={() => setNotesOpen(false)} sessionId={sessionId} />
              )}

              {/* Reaction Overlay */}
              <ReactionOverlay sessionId={sessionId} />

              {/* AI Insight Bar — therapist only */}
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
                  style={{
                    position: 'absolute',
                    bottom: 72,
                    left: '50%',
                    zIndex: 50,
                    pointerEvents: 'none',
                    animation: 'toastInOut 2.2s ease forwards',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(74,124,111,0.9)',
                      backdropFilter: 'blur(10px)',
                      color: '#fff',
                      padding: '7px 16px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    ✓ {toast}
                  </div>
                </div>
              )}
            </div>

            {/* Panel wrapper — flex shrink-proof 420px */}
            <div style={{
              width: isModuleActive ? 420 : 0,
              minWidth: isModuleActive ? 420 : 0,
              flexShrink: 0,
              overflow: 'hidden',
              transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
              zIndex: 10,
              display: 'flex',
              justifyContent: 'flex-end',
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
          </div>
        </main>

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

        {/* ===== BOTTOM BAR ===== */}
        <BottomBar
          sessionId={sessionId}
          isTherapist={isTherapist}
          notesOpen={notesOpen}
          onToggleNotes={() => setNotesOpen((o) => !o)}
          reactionBarOpen={reactionBarOpen}
          onToggleReactions={() => setReactionBarOpen((o) => !o)}
          isLocked={isLocked}
          onToggleLock={handleLockToggle}
          selectorOpen={selectorOpen}
          onToggleTherapy={() => setSelectorOpen((o) => !o)}
          onEndClick={() => setShowConfirm(true)}
          analyseLoading={analyseLoading}
          analyseCooldown={analyseCooldown}
          consentGiven={bothConsented}
          onAnalyse={handleAnalyse}
        />

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

/* ===== BOTTOM BAR ===== */
function BottomBar({
  sessionId,
  isTherapist,
  notesOpen,
  onToggleNotes,
  reactionBarOpen,
  onToggleReactions,
  isLocked,
  onToggleLock,
  selectorOpen,
  onToggleTherapy,
  onEndClick,
  analyseLoading,
  analyseCooldown,
  consentGiven,
  onAnalyse,
}: {
  sessionId: string;
  isTherapist: boolean;
  notesOpen: boolean;
  onToggleNotes: () => void;
  reactionBarOpen: boolean;
  onToggleReactions: () => void;
  isLocked: boolean;
  onToggleLock: () => void;
  selectorOpen: boolean;
  onToggleTherapy: () => void;
  onEndClick: () => void;
  analyseLoading: boolean;
  analyseCooldown: boolean;
  consentGiven: boolean;
  onAnalyse: () => void;
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

  const handleEnd = () => {
    onEndClick();
  };

  const circleBtn = (isActive: boolean, activeBg?: string, activeColor?: string) => ({
    width: 40,
    height: 40,
    borderRadius: '50%',
    border: '1px solid var(--glass-border)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    background: isActive ? (activeBg || 'var(--sage-light)') : 'rgba(255,255,255,0.08)',
    color: isActive ? (activeColor || 'var(--sage-mid)') : 'var(--ink)',
  })

  const lbl = (text: string) => (
    <span style={{ fontSize: 9, color: 'var(--ink-muted)', textAlign: 'center' }}>{text}</span>
  )

  return (
    <div
      style={{
        height: 64,
        flexShrink: 0,
        background: 'var(--glass-strong)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--glass-border)',
        zIndex: 30,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
      }}
    >
      {/* Left group — mute + camera */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <div className="flex flex-col items-center" style={{ gap: 2 }}>
          <button
            onClick={toggleMic}
            style={{
              ...circleBtn(false),
              background: !isMicrophoneEnabled ? 'var(--accent-bg)' : 'rgba(255,255,255,0.08)',
              color: !isMicrophoneEnabled ? 'var(--accent)' : 'var(--ink)',
            }}
          >
            {isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}
          </button>
          {lbl('Mute')}
        </div>
        <div className="flex flex-col items-center" style={{ gap: 2 }}>
          <button
            onClick={toggleCam}
            style={{
              ...circleBtn(false),
              background: !isCameraEnabled ? 'var(--accent-bg)' : 'rgba(255,255,255,0.08)',
              color: !isCameraEnabled ? 'var(--accent)' : 'var(--ink)',
            }}
          >
            {isCameraEnabled ? <Camera size={15} /> : <CameraOff size={15} />}
          </button>
          {lbl('Camera')}
        </div>
      </div>

      {/* Center group — therapist controls */}
      {isTherapist && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <div className="flex flex-col items-center" style={{ gap: 2 }}>
            <button
              onClick={onToggleTherapy}
              style={circleBtn(selectorOpen)}
            >
              <BookOpen size={15} />
            </button>
            {lbl('Therapy')}
          </div>
          <div className="flex flex-col items-center" style={{ gap: 2 }}>
            <button
              onClick={onToggleReactions}
              style={circleBtn(reactionBarOpen)}
            >
              <Smile size={15} />
            </button>
            {lbl('React')}
          </div>
          <div className="flex flex-col items-center" style={{ gap: 2 }}>
            <button
              onClick={onToggleNotes}
              style={circleBtn(notesOpen)}
            >
              <StickyNote size={15} />
            </button>
            {lbl('Notes')}
          </div>
          {consentGiven && (
            <div className="flex flex-col items-center" style={{ gap: 2 }}>
              <button
                onClick={onAnalyse}
                disabled={analyseCooldown}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '1px solid',
                  cursor: analyseCooldown ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  opacity: analyseCooldown ? 0.5 : 1,
                  background: analyseLoading
                    ? 'rgba(107,92,231,0.2)'
                    : 'rgba(255,255,255,0.07)',
                  borderColor: analyseLoading
                    ? 'rgba(107,92,231,0.4)'
                    : 'rgba(255,255,255,0.12)',
                  color: analyseLoading ? '#a89ae8' : 'rgba(255,255,255,0.8)',
                }}
                title="Analyse session"
              >
                <span className={analyseLoading ? 'animate-spin' : ''} style={{ display: 'inline-flex' }}>
                  <Sparkles size={15} />
                </span>
              </button>
              {lbl('Analyse')}
            </div>
          )}
          <div className="flex flex-col items-center" style={{ gap: 2 }}>
            <button
              onClick={onToggleLock}
              style={{
                ...circleBtn(isLocked),
                background: isLocked ? 'var(--accent-bg)' : 'rgba(255,255,255,0.08)',
                color: isLocked ? 'var(--accent)' : 'var(--ink)',
              }}
            >
              {isLocked ? <Lock size={15} /> : <LockOpen size={15} />}
            </button>
            {lbl('Control')}
          </div>
        </div>
      )}

      {/* Right group — end session */}
      <div
        style={{
          position: 'absolute',
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <button
          onClick={handleEnd}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: '1px solid var(--accent)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent-bg)',
            color: 'var(--accent)',
          }}
        >
          <PhoneOff size={15} />
        </button>
        {lbl('End')}
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
