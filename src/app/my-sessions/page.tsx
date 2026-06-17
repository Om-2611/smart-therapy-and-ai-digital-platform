'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter } from 'next/navigation';
import { Play, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface SessionData {
  id: string;
  scheduledAt: string;
  status: string;
  therapist?: { firstName: string; lastName: string };
}

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

export default function MySessionsPage() {
  const { uid, role, profile } = useAuthStore();
  const { setActiveSessionId } = useSessionStore();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { router.push('/auth'); return; }
    if (role === 'THERAPIST') { router.push('/sessions'); return; }
    fetchSessions();
  }, [uid, role, profile]);

  const fetchSessions = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions?clientId=${profile.id}`);
      if (res.ok) { const d = await res.json(); setSessions(d.sessions || []); }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleJoinSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    router.push(`/session/${sessionId}`);
  };

  const nextSession = sessions.find(
    (s) => s.status === 'SCHEDULED' || s.status === 'ACTIVE'
  );
  const pastSessions = sessions.filter((s) => s.status === 'COMPLETED');

  return (
    <DashboardLayout role={role} profile={profile}>
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob animate-blob" style={{ top: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle at 70% 30%, rgba(200, 96, 42, 0.08), transparent 70%)' }} />
        <div className="blob animate-blob" style={{ bottom: '-15%', left: '-8%', width: '35vw', height: '35vw', background: 'radial-gradient(circle at 30% 70%, rgba(156, 125, 89, 0.10), transparent 70%)', animationDelay: '-9s' }} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>My Sessions</h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-20 gap-3`}>
            <div className="text-5xl">📅</div>
            <p className="font-heading text-lg" style={{ color: 'var(--ink)' }}>No sessions yet</p>
            <p className="text-sm font-medium text-center max-w-xs" style={{ color: 'var(--ink-muted)' }}>
              Your therapist will send you a link to join your first session.
            </p>
          </div>
        ) : (
          <>
            {/* Next session card */}
            {nextSession && (
              <div
                className={`${GLASS_CARD} p-6`}
                style={{
                  border: '1px solid var(--sage)',
                  background: 'var(--sage-light)',
                }}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl" style={{ background: 'var(--glass-bg)' }}>
                      👨‍🏫
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: 'var(--c-accent)', background: 'var(--c-accent-bg)' }}>
                          {nextSession.status === 'ACTIVE' ? 'Live Now' : 'Upcoming'}
                        </span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
                        Session with {nextSession.therapist?.firstName || 'your therapist'}
                      </p>
                      <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(nextSession.scheduledAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        {' • '}
                        {new Date(nextSession.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinSession(nextSession.id)}
                    className="btn-press flex items-center gap-2 rounded-xl px-6 py-3 shadow-md text-white"
                    style={{ background: 'var(--sage)', border: 'none' }}
                  >
                    <Play className="h-5 w-5" /> Join Session <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Past sessions */}
            {pastSessions.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-heading text-lg mt-8" style={{ color: 'var(--ink)' }}>Past Sessions</h2>
                {pastSessions.map((s, i) => (
                  <div key={s.id} className={`${GLASS_CARD} p-4 stagger-${Math.min(i + 1, 4)}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                          <Play className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                            Session with {s.therapist?.firstName || 'therapist'}
                          </p>
                          <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                            {new Date(s.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: 'var(--c-accent)', background: 'var(--c-accent-bg)' }}>
                        Completed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}
