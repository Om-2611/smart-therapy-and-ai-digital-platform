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
import { Plus, Play, Calendar, ClipboardList, LogOut, ArrowRight, UserCheck, Heart, Moon, Sun } from 'lucide-react';

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

const GLASS_CARD = 'bg-white dark:bg-[#16221e] shadow-[var(--glass-shadow)] rounded-2xl border border-[var(--glass-border)]';
const GLASS_INNER = 'bg-[var(--sage-light)]';
const GLASS_STRONG = 'bg-white/90 dark:bg-[rgba(18,28,25,0.92)] backdrop-blur-xl border-b border-[var(--glass-border)]';

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

  useEffect(() => {
    if (!uid) {
      router.push('/auth');
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

  return (
    <div className="min-h-screen py-10 px-6 md:px-16 lg:px-24" style={{ background: 'var(--page-bg)' }}>
      {/* Header */}
      <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 ${GLASS_STRONG} -mx-6 md:-mx-16 lg:-mx-24 px-6 md:px-16 lg:px-24 py-5 sticky top-0 z-40`}>
        <div>
          <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wider mb-1" style={{ color: 'var(--sage)' }}>
            <Heart className="h-4 w-4" style={{ fill: 'var(--sage)' }} /> Core therapy space
          </div>
          <h1 className="text-4xl md:text-5xl font-heading" style={{ color: 'var(--ink)' }}>
            Welcome back, {profile.firstName}
          </h1>
          <p className="mt-2 text-md max-w-lg font-medium" style={{ color: 'var(--ink-muted)' }}>
            {role === 'THERAPIST' 
              ? 'Real-time interactive modules, calm interfaces, and session workspace tools.' 
              : 'Your space to collaborate with your therapist on interactive games and tasks.'
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
            }}
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          {role === 'THERAPIST' && (
            <>
              <Button 
                onClick={() => setIsBookModalOpen(true)} 
                variant="outline"
                className="rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm border"
                style={{
                  background: 'var(--glass-bg)',
                  borderColor: 'var(--glass-border)',
                  color: 'var(--ink)',
                }}
              >
                <Calendar className="h-4 w-4" /> Book Appointment
              </Button>
              <Button 
                onClick={() => setIsSessionModalOpen(true)}
                className="rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm"
                style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
              >
                <Plus className="h-4 w-4" /> New Session Room
              </Button>
            </>
          )}
          <Button 
            onClick={handleLogout} 
            variant="ghost" 
            className="rounded-xl flex items-center gap-2 py-5"
            style={{ color: 'var(--ink-muted)' }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      {/* CLIENT DASHBOARD */}
      {role === 'CLIENT' && (
        <main className="space-y-8 mt-10">
          {/* Welcome & Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className={`col-span-2 ${GLASS_CARD} p-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-muted)' }}>Hello!</p>
                  <h2 className="text-3xl font-heading" style={{ color: 'var(--ink)' }}>Ready for something fun?</h2>
                  <p className="mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>Your therapist is waiting for you</p>
                </div>
                <div className="hidden md:flex flex-col items-center gap-2">
                  <div className="text-5xl">🌟</div>
                  <span className="text-sm font-bold" style={{ color: 'var(--sage)' }}>Great job!</span>
                </div>
              </div>
            </Card>
            <Card className={`${GLASS_CARD} p-6`}>
              <div className="text-center">
                <div className="text-4xl mb-2">🔥</div>
                <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{Math.floor(Math.random() * 10) + 3}</p>
                <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>Day Streak</p>
                <p className="text-xs mt-1" style={{ color: 'var(--sage)' }}>Keep it up!</p>
              </div>
            </Card>
          </div>

          {/* Upcoming Session Card */}
          {sessions.length > 0 && (
            <Card className={`${GLASS_CARD} p-6`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: 'var(--sage-light)' }}>
                    👨‍🏫
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: 'var(--sage)', background: 'var(--sage-light)' }}>Upcoming</span>
                      {sessions[0]?.status === 'ACTIVE' && (
                        <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          Live Now
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Session with {sessions[0]?.therapist?.firstName}</p>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                      {new Date(sessions[0]?.scheduledAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                      {' • '}
                      {new Date(sessions[0]?.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => handleStartSession(sessions[0]?.id)}
                  className="rounded-xl flex items-center gap-2 py-4 px-6 shadow-md"
                  style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                >
                  <Play className="h-5 w-5" /> Join Session
                </Button>
              </div>
            </Card>
          )}

          {/* Activity History & Therapist Message */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className={`${GLASS_CARD} p-6`}>
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg font-heading flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  📝 Today's Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-3">
                {sessions.length > 0 ? (
                  <div className="space-y-2">
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${GLASS_INNER}`}>
                      <span className="text-xl">🎯</span>
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>Maze Challenge</p>
                        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Completed in 3:45</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${GLASS_INNER}`}>
                      <span className="text-xl">🫧</span>
                      <div>
                        <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>Bubble Splash</p>
                        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>12 bubbles popped</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-4 font-medium" style={{ color: 'var(--ink-muted)' }}>No activities yet today</p>
                )}
              </CardContent>
            </Card>

            <Card className={`${GLASS_CARD} p-6`}>
              <CardHeader className="p-0 pb-4">
                <CardTitle className="text-lg font-heading flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  💬 Therapist Note
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className={`rounded-xl p-4 ${GLASS_INNER}`}>
                  <p className="font-medium italic" style={{ color: 'var(--ink)' }}>"Great progress today! Keep practicing the breathing exercises we learned."</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--ink-muted)' }}>— {profile?.firstName}'s Therapist</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      )}

      {/* THERAPIST DASHBOARD */}
      {role === 'THERAPIST' && (
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-10">
        
        {/* Bookings / Sessions Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Active Sessions */}
          <Card className={`${GLASS_CARD} p-6`}>
            <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <CardTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Session Rooms</CardTitle>
                <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Join scheduled realtime sessions</CardDescription>
              </div>
              <ClipboardList className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-3">
              {sessions.length === 0 ? (
                <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: 'var(--glass-border)', background: 'var(--sage-light)' }}>
                  <p className="font-medium" style={{ color: 'var(--ink-muted)' }}>No sessions scheduled.</p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div 
                    key={session.id} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl transition-all gap-4"
                    style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}
                  >
                    <div>
                      <p className="font-semibold text-md" style={{ color: 'var(--ink)' }}>
                        {role === 'THERAPIST' 
                          ? `Session with ${session.client?.firstName} ${session.client?.lastName}`
                          : `Session with Therapist ${session.therapist?.firstName}`
                        }
                      </p>
                      <p className="text-xs font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(session.scheduledAt).toLocaleDateString(undefined, {
                          weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <Button 
                      onClick={() => handleStartSession(session.id)}
                      className="rounded-lg flex items-center gap-1 text-sm font-semibold"
                      style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: 'none' }}
                    >
                      <Play className="h-4 w-4" /> Enter Room <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Upcoming Schedule */}
          <Card className={`${GLASS_CARD} p-6`}>
            <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <CardTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Appointment Schedule</CardTitle>
                <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>Bookings overview</CardDescription>
              </div>
              <Calendar className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-3">
              {bookings.length === 0 ? (
                <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: 'var(--glass-border)', background: 'var(--sage-light)' }}>
                  <p className="font-medium" style={{ color: 'var(--ink-muted)' }}>No appointments booked.</p>
                </div>
              ) : (
                bookings.map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}>
                    <div>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {role === 'THERAPIST' 
                          ? `Appointment: ${booking.client?.firstName} ${booking.client?.lastName}`
                          : `Appointment: ${booking.therapist?.firstName} ${booking.therapist?.lastName}`
                        }
                      </p>
                      <p className="text-xs font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(booking.dateTime).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })} • {booking.duration} mins
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info/Clients Profile column */}
        <div>
          <Card className={`${GLASS_CARD} p-6`}>
            <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <CardTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>
                  {role === 'THERAPIST' ? 'Client Directory' : 'Learning Plan'}
                </CardTitle>
                <CardDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
                  {role === 'THERAPIST' ? 'Manage your cohort' : 'Core learning adjustments'}
                </CardDescription>
              </div>
              <UserCheck className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
            </CardHeader>
            <CardContent className="p-0 pt-4 space-y-4">
              {role === 'THERAPIST' ? (
                clients.length === 0 ? (
                  <p className="text-center py-4 font-medium text-sm" style={{ color: 'var(--ink-muted)' }}>No clients assigned yet.</p>
                ) : (
                  clients.map((client) => (
                    <div key={client.id} className="p-4 rounded-xl" style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}>
                      <p className="font-bold" style={{ color: 'var(--ink)' }}>{client.firstName} {client.lastName}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {client.diagnosis.map((tag) => (
                          <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                      <Button
                        onClick={() => handleStartSession(undefined, client.userId)}
                        className="mt-3 w-full text-xs font-semibold rounded-lg"
                        style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: 'none' }}
                      >
                        Launch Direct Session
                      </Button>
                    </div>
                  ))
                )
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl" style={{ background: 'var(--sage-light)' }}>
                    <p className="font-semibold" style={{ color: 'var(--ink)' }}>Diagnoses / Needs</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {profile.diagnosis?.map((tag: string) => (
                        <span key={tag} className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--sage-light)', color: 'var(--sage)', border: '1px solid var(--glass-border)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl" style={{ background: 'var(--sage-light)' }}>
                    <p className="font-semibold" style={{ color: 'var(--ink)' }}>DOB</p>
                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
                      {new Date(profile.dateOfBirth).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </main>
      )}

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
            <Button variant="ghost" onClick={() => setIsBookModalOpen(false)} className="rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={loading} className="rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Book</Button>
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
            <Button variant="ghost" onClick={() => setIsSessionModalOpen(false)} className="rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
            <Button onClick={() => handleStartSession()} disabled={loading || !selectedClientId} className="rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Launch Room</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
