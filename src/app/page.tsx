'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useTheme } from '@/components/ThemeProvider';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Plus, Play, Calendar, CalendarClock, ClipboardList, ArrowRight, UserCheck, UserPlus, Users, Heart, Copy, Check } from 'lucide-react';

interface Booking {
  id: string;
  dateTime: string;
  duration: number;
  client?: { firstName: string; lastName: string };
  therapist?: { firstName: string; lastName: string };
}

interface Session {
  id: string;
  scheduledAt: string;
  status: string;
  client?: { id: string; firstName: string; lastName: string };
  therapist?: { firstName: string; lastName: string };
}

interface ClientProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  diagnosis: string[];
}

// Creamy translucent surfaces in light mode; original dark surface in dark mode.
const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;
const STAT_CARD = `${CARD_BASE} stat-hover`;
const GLASS_INNER = 'bg-[var(--sage-light)]';
const GLASS_STRONG = 'bg-[var(--nav-bg)] backdrop-blur-[8px] border-b border-[var(--glass-border)]';

export default function Home() {
  const { uid, role, profile } = useAuthStore();
  const { setActiveSessionId } = useSessionStore();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<ClientProfile[]>([]);

  // Dialog State
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [loading, setLoading] = useState(false);

  // Add Patient (invite) State
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientDiagnosisInput, setPatientDiagnosisInput] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!uid) {
      router.push('/auth');
      return;
    }
    if (role === 'ADMIN') {
      router.push('/admin');
      return;
    }
    fetchDashboardData();
  }, [uid, role, profile]);

  const fetchDashboardData = async () => {
    if (!profile) return;
    try {
      const queryParam = role === 'THERAPIST' ? `therapistId=${profile.id}` : `clientId=${profile.id}`;

      const [bookingsRes, sessionsRes] = await Promise.all([
        fetch(`/api/bookings?${queryParam}`),
        fetch(`/api/sessions?${queryParam}`)
      ]);

      if (bookingsRes.ok) {
        const data = await bookingsRes.json();
        setBookings(data.bookings || []);
      }
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(data.sessions || []);
      }

      if (role === 'THERAPIST') {
        const clientsRes = await fetch('/api/clients');
        if (clientsRes.ok) {
          const data = await clientsRes.json();
          setClients(data.clients || []);
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const handleCreateBooking = async () => {
    if (!profile || !selectedClientId || !dateTime) return;
    setLoading(true);
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: profile.id,
          clientId: selectedClientId,
          dateTime,
          duration
        })
      });
      if (response.ok) {
        setIsBookModalOpen(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async (existingSessionId?: string, clientInputId?: string) => {
    if (!profile) return;
    setLoading(true);
    try {
      let finalSessionId = existingSessionId;

      if (!finalSessionId) {
        const targetClientId = clientInputId || selectedClientId;
        const response = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            therapistId: profile.id,
            clientId: targetClientId,
            scheduledAt: new Date().toISOString()
          })
        });
        if (response.ok) {
          const data = await response.json();
          finalSessionId = data.session.id;
        }
      }

      if (finalSessionId) {
        setActiveSessionId(finalSessionId);
        router.push(`/session/${finalSessionId}`);
      }
    } catch (err) {
      console.error('Failed to create/start session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPatient = async () => {
    if (!profile || !patientFirstName.trim()) return;
    setLoading(true);
    try {
      const diagnosis = patientDiagnosisInput.split(',').map((d) => d.trim()).filter((d) => d.length > 0);
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: profile.id,
          firstName: patientFirstName.trim(),
          lastName: patientLastName.trim(),
          diagnosis,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setInviteLink(`${window.location.origin}/auth?invite=${data.token}`);
      }
    } catch (err) {
      console.error('Failed to create invite:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetAddPatient = () => {
    setIsAddPatientModalOpen(false);
    setPatientFirstName('');
    setPatientLastName('');
    setPatientDiagnosisInput('');
    setInviteLink('');
    setCopied(false);
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth');
  };

  if (!profile) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--page-bg)' }}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
      </div>
    );
  }

  const initials = `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase();
  const nameInitials = (f?: string, l?: string) => `${f?.[0] ?? ''}${l?.[0] ?? ''}`.toUpperCase();

  const therapistStats = [
    { icon: Play, label: 'Active rooms', value: sessions.filter((s) => s.status === 'ACTIVE').length },
    { icon: CalendarClock, label: 'Appointments', value: bookings.length },
    { icon: Users, label: 'Clients', value: clients.length },
    { icon: ClipboardList, label: 'Total sessions', value: sessions.length },
  ];

  return (
    <DashboardLayout role={role} profile={profile}>
      {theme === 'light' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="blob animate-blob"
            style={{ top: '-14%', right: '-8%', width: '38vw', height: '38vw', background: 'radial-gradient(circle at 70% 30%, rgba(200, 96, 42, 0.10), transparent 70%)' }}
          />
          <div
            className="blob animate-blob"
            style={{ bottom: '-18%', left: '-10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle at 30% 70%, rgba(156, 125, 89, 0.12), transparent 70%)', animationDelay: '-9s' }}
          />
        </div>
      )}

      <div className="relative z-10">
        {/* Inline welcome + actions */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8 animate-fade-in">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}
            >
              {initials || '🙂'}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--sage)' }}>
                <Heart className="h-3.5 w-3.5" style={{ fill: 'var(--sage)' }} /> Core therapy space
              </div>
              <h1 className="font-heading text-2xl md:text-3xl" style={{ color: 'var(--ink)' }}>
                Welcome back, {profile.firstName}
              </h1>
            </div>
          </div>
          {role === 'THERAPIST' && (
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <Button
                onClick={() => setIsAddPatientModalOpen(true)}
                variant="outline"
                className="btn-press rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm border"
                style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--ink)' }}
              >
                <UserPlus className="h-4 w-4" /> <span className="hidden sm:inline">Add Patient</span>
              </Button>
              <Button
                onClick={() => setIsBookModalOpen(true)}
                variant="outline"
                className="btn-press rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm border"
                style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--ink)' }}
              >
                <Calendar className="h-4 w-4" /> <span className="hidden sm:inline">Book</span>
              </Button>
              <Button
                onClick={() => setIsSessionModalOpen(true)}
                className="btn-press rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm"
                style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Session</span>
              </Button>
            </div>
          )}
        </div>

        {/* CLIENT DASHBOARD */}
        {role === 'CLIENT' && (
          <main className="mt-8 space-y-6">
            {/* Welcome & Quick Stats */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Card className={`md:col-span-2 ${GLASS_CARD} p-6`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="mb-1 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>Hello!</p>
                    <h2 className="font-heading text-3xl" style={{ color: 'var(--ink)' }}>Ready for something fun?</h2>
                    <p className="mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>Your therapist is waiting for you</p>
                  </div>
                  <div className="hidden flex-col items-center gap-2 md:flex">
                    <div className="text-5xl">🌟</div>
                    <span className="text-sm font-bold" style={{ color: 'var(--sage)' }}>Great job!</span>
                  </div>
                </div>
              </Card>
              <Card className={`${GLASS_CARD} stagger-1 p-6`}>
                <div className="text-center">
                  <div className="mb-2 text-4xl">🔥</div>
                  <p className="font-heading text-4xl" style={{ color: 'var(--ink)' }}>{Math.floor(Math.random() * 10) + 3}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>Day Streak</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--sage)' }}>Keep it up!</p>
                </div>
              </Card>
            </div>

            {/* Upcoming Session Card */}
            {sessions.length > 0 && (
              <Card className={`${GLASS_CARD} p-6`}>
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl" style={{ background: 'var(--sage-light)' }}>
                      👨‍🏫
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ color: 'var(--c-accent)', background: 'var(--c-accent-bg)' }}>Upcoming</span>
                        {sessions[0]?.status === 'ACTIVE' && (
                          <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--c-accent)' }}>
                            <span className="live-dot h-2 w-2 rounded-full" style={{ background: 'var(--c-accent)' }}></span>
                            Live Now
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Session with {sessions[0]?.therapist?.firstName}</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(sessions[0]?.scheduledAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        {' • '}
                        {new Date(sessions[0]?.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleStartSession(sessions[0]?.id)}
                    className="btn-press flex items-center gap-2 rounded-xl px-6 py-4 shadow-md"
                    style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                  >
                    <Play className="h-5 w-5" /> Join Session
                  </Button>
                </div>
              </Card>
            )}

            {/* Activity History & Therapist Message */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className={`${GLASS_CARD} p-6`}>
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="flex items-center gap-2 font-heading text-lg" style={{ color: 'var(--ink)' }}>
                    📝 Today's Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-0">
                  {sessions.length > 0 ? (
                    <div className="space-y-2">
                      <div className={`flex items-center gap-3 rounded-xl p-3 ${GLASS_INNER}`}>
                        <span className="text-xl">🎯</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Maze Challenge</p>
                          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Completed in 3:45</p>
                        </div>
                      </div>
                      <div className={`flex items-center gap-3 rounded-xl p-3 ${GLASS_INNER}`}>
                        <span className="text-xl">🫧</span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Bubble Splash</p>
                          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>12 bubbles popped</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="py-4 text-center font-medium" style={{ color: 'var(--ink-muted)' }}>No activities yet today</p>
                  )}
                </CardContent>
              </Card>

              <Card className={`${GLASS_CARD} stagger-1 p-6`}>
                <CardHeader className="p-0 pb-4">
                  <CardTitle className="flex items-center gap-2 font-heading text-lg" style={{ color: 'var(--ink)' }}>
                    💬 Therapist Note
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className={`rounded-xl p-4 ${GLASS_INNER}`}>
                    <p className="font-medium italic" style={{ color: 'var(--ink)' }}>"Great progress today! Keep practicing the breathing exercises we learned."</p>
                    <p className="mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>— {profile?.firstName}'s Therapist</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        )}

        {/* THERAPIST DASHBOARD */}
        {role === 'THERAPIST' && (
          <main className="mt-8 space-y-6">
            {/* Stat row */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {therapistStats.map(({ icon: Icon, label, value }, i) => (
                <div key={label} className={`${STAT_CARD} stagger-${i + 1} p-5`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 font-heading text-4xl" style={{ color: 'var(--ink)' }}>{value}</p>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>{label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Sessions + Schedule */}
              <div className="space-y-6 lg:col-span-2">
                {/* Active Sessions */}
                <Card className={`${GLASS_CARD} p-6`}>
                  <CardHeader className="flex flex-row items-center justify-between p-0 pb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <div>
                      <CardTitle className="font-heading text-2xl" style={{ color: 'var(--ink)' }}>Session Rooms</CardTitle>
                      <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Join scheduled realtime sessions</CardDescription>
                    </div>
                    <ClipboardList className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
                  </CardHeader>
                  <CardContent className="space-y-3 p-0 pt-4">
                    {sessions.length === 0 ? (
                      <div className="rounded-xl border border-dashed py-10 text-center" style={{ borderColor: 'var(--glass-border)', background: 'var(--sage-light)' }}>
                        <p className="font-medium" style={{ color: 'var(--ink-muted)' }}>No sessions scheduled.</p>
                      </div>
                    ) : (
                      sessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex flex-col gap-4 rounded-xl p-4 hover-lift sm:flex-row sm:items-center sm:justify-between"
                          style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
                              {nameInitials(session.client?.firstName, session.client?.lastName) || '🙂'}
                            </div>
                            <div>
                              <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                                {session.client?.firstName} {session.client?.lastName}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                                {session.status === 'ACTIVE' && (
                                  <span className="live-dot inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--c-accent)' }}></span>
                                )}
                                {new Date(session.scheduledAt).toLocaleDateString(undefined, {
                                  weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleStartSession(session.id)}
                            className="btn-press flex items-center gap-1 rounded-lg text-sm font-semibold"
                            style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                          >
                            <Play className="h-4 w-4" /> Enter Room <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Upcoming Schedule */}
                <Card className={`${GLASS_CARD} p-6`}>
                  <CardHeader className="flex flex-row items-center justify-between p-0 pb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <div>
                      <CardTitle className="font-heading text-2xl" style={{ color: 'var(--ink)' }}>Appointment Schedule</CardTitle>
                      <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Bookings overview</CardDescription>
                    </div>
                    <Calendar className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
                  </CardHeader>
                  <CardContent className="space-y-3 p-0 pt-4">
                    {bookings.length === 0 ? (
                      <div className="rounded-xl border border-dashed py-10 text-center" style={{ borderColor: 'var(--glass-border)', background: 'var(--sage-light)' }}>
                        <p className="font-medium" style={{ color: 'var(--ink-muted)' }}>No appointments booked.</p>
                      </div>
                    ) : (
                      bookings.map((booking) => (
                        <div key={booking.id} className="flex items-center justify-between rounded-xl p-4 hover-lift" style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--sage)' }}>
                              <CalendarClock className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                                {booking.client?.firstName} {booking.client?.lastName}
                              </p>
                              <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                                {new Date(booking.dateTime).toLocaleDateString(undefined, {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })} • {booking.duration} mins
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Client Directory */}
              <div>
                <Card className={`${GLASS_CARD} stagger-1 p-6`}>
                  <CardHeader className="flex flex-row items-center justify-between p-0 pb-4" style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <div>
                      <CardTitle className="font-heading text-2xl" style={{ color: 'var(--ink)' }}>Client Directory</CardTitle>
                      <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Manage your cohort</CardDescription>
                    </div>
                    <UserCheck className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
                  </CardHeader>
                  <CardContent className="space-y-4 p-0 pt-4">
                    {clients.length === 0 ? (
                      <p className="py-4 text-center text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>No clients assigned yet.</p>
                    ) : (
                      clients.map((client) => (
                        <div key={client.id} className="rounded-xl p-4 hover-lift" style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
                              {nameInitials(client.firstName, client.lastName) || '🙂'}
                            </div>
                            <p className="font-bold" style={{ color: 'var(--ink)' }}>{client.firstName} {client.lastName}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {client.diagnosis.map((tag) => (
                              <span key={tag} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <Button
                            onClick={() => handleStartSession(undefined, client.userId)}
                            className="btn-press mt-3 w-full rounded-lg text-xs font-semibold"
                            style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                          >
                            Launch Direct Session
                          </Button>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>
        )}
      </div>

      {/* Book Appointment Modal */}
      <Dialog open={isBookModalOpen} onOpenChange={setIsBookModalOpen}>
        <DialogContent className="rounded-2xl max-w-md" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Book Session Appointment</DialogTitle>
            <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Select a client and appointment schedule</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Select Client</label>
              <Select onValueChange={(val) => setSelectedClientId(val || '')} value={selectedClientId}>
                <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} style={{ color: 'var(--ink)' }}>{c.firstName} {c.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Date & Time</label>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Duration (minutes)</label>
              <Select onValueChange={(val) => setDuration(Number(val))} value={String(duration)}>
                <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                  <SelectItem value="30" style={{ color: 'var(--ink)' }}>30 minutes</SelectItem>
                  <SelectItem value="50" style={{ color: 'var(--ink)' }}>50 minutes</SelectItem>
                  <SelectItem value="80" style={{ color: 'var(--ink)' }}>80 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsBookModalOpen(false)} className="btn-press rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={loading} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Live Session Modal */}
      <Dialog open={isSessionModalOpen} onOpenChange={setIsSessionModalOpen}>
        <DialogContent className="rounded-2xl max-w-md" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Start Live Session Room</DialogTitle>
            <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Launch a live workspace for instant therapist/client interaction</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Select Client</label>
              <Select onValueChange={(val) => setSelectedClientId(val || '')} value={selectedClientId}>
                <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                  {clients.map((c) => (
                    <SelectItem key={c.userId} value={c.userId} style={{ color: 'var(--ink)' }}>{c.firstName} {c.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSessionModalOpen(false)} className="btn-press rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
            <Button onClick={() => handleStartSession()} disabled={loading || !selectedClientId} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Launch Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Patient (invite) Modal */}
      <Dialog open={isAddPatientModalOpen} onOpenChange={(open) => { if (!open) resetAddPatient(); else setIsAddPatientModalOpen(true); }}>
        <DialogContent className="rounded-2xl max-w-md" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
          {!inviteLink ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Add New Patient</DialogTitle>
                <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
                  Enter the patient's name and disorder. We'll generate an invite link for them to sign up and join their session.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>First Name</label>
                    <input
                      value={patientFirstName}
                      onChange={(e) => setPatientFirstName(e.target.value)}
                      placeholder="John"
                      className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Last Name</label>
                    <input
                      value={patientLastName}
                      onChange={(e) => setPatientLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Disorder / Diagnosis (comma-separated)</label>
                  <input
                    value={patientDiagnosisInput}
                    onChange={(e) => setPatientDiagnosisInput(e.target.value)}
                    placeholder="ADHD, Anxiety, Dyslexia"
                    className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={resetAddPatient} className="btn-press rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
                <Button onClick={handleAddPatient} disabled={loading || !patientFirstName.trim()} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
                  {loading ? 'Generating...' : 'Generate Invite'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Invite Link Ready</DialogTitle>
                <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
                  Share this link with {patientFirstName}. They'll sign up and see their assigned session.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}>
                  <span className="flex-1 truncate text-sm font-medium" style={{ color: 'var(--ink)' }}>{inviteLink}</span>
                  <button onClick={handleCopyInvite} className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--sage)', color: '#fff' }}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`You're invited to a STAAD therapy session. Sign up here: ${inviteLink}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-press flex-1 rounded-xl py-2.5 text-center text-sm font-semibold"
                    style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}
                  >
                    Share via WhatsApp
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent('Your STAAD therapy session invite')}&body=${encodeURIComponent(`You're invited to a STAAD therapy session. Sign up here: ${inviteLink}`)}`}
                    className="btn-press flex-1 rounded-xl py-2.5 text-center text-sm font-semibold"
                    style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}
                  >
                    Share via Email
                  </a>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={resetAddPatient} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
