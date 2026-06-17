'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Play, ArrowRight, Plus, Calendar as CalendarIcon } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface SessionData {
  id: string;
  scheduledAt: string;
  status: string;
  confirmedByPatient?: boolean;
  client?: { id: string; firstName: string; lastName: string; diagnosis?: string[] };
}

interface ClientBasic {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

export default function SchedulePage() {
  const { uid, role, profile } = useAuthStore();
  const { setActiveSessionId } = useSessionStore();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [clients, setClients] = useState<ClientBasic[]>([]);
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  // Booking modal
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [duration, setDuration] = useState(50);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid || role !== 'THERAPIST') { router.push('/auth'); return; }
    fetchData();
  }, [uid, role]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [sessionsRes, clientsRes] = await Promise.all([
        fetch(`/api/sessions?therapistId=${profile.id}`),
        fetch(`/api/clients?therapistId=${profile.id}`),
      ]);
      if (sessionsRes.ok) { const d = await sessionsRes.json(); setSessions(d.sessions || []); }
      if (clientsRes.ok) { const d = await clientsRes.json(); setClients(d.clients || []); }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleCreateBooking = async () => {
    if (!profile || !selectedClientId || !dateTime) return;
    setSaving(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId: profile.id, clientId: selectedClientId, dateTime, duration }),
      });
      if (res.ok) { setIsBookModalOpen(false); fetchData(); }
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleStartSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    router.push(`/session/${sessionId}`);
  };

  // Week calculation
  const getWeekDates = (offset: number) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const weekDays = getWeekDates(currentWeekOffset);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isToday = (d: Date) => d.getTime() === today.getTime();

  // Get sessions for a specific day
  const getSessionsForDay = (day: Date) => {
    return sessions.filter((s) => {
      const sDate = new Date(s.scheduledAt);
      return sDate.getFullYear() === day.getFullYear() &&
        sDate.getMonth() === day.getMonth() &&
        sDate.getDate() === day.getDate();
    });
  };

  const upcomingSessions = sessions
    .filter((s) => new Date(s.scheduledAt) > new Date())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  return (
    <DashboardLayout role={role} profile={profile}>
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob animate-blob" style={{ top: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle at 70% 30%, rgba(200, 96, 42, 0.08), transparent 70%)' }} />
        <div className="blob animate-blob" style={{ bottom: '-15%', left: '-8%', width: '35vw', height: '35vw', background: 'radial-gradient(circle at 30% 70%, rgba(156, 125, 89, 0.10), transparent 70%)', animationDelay: '-9s' }} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Schedule</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>Manage your weekly sessions</p>
          </div>
          <Button onClick={() => setIsBookModalOpen(true)} className="btn-press rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
            <Plus className="h-4 w-4" /> Book Session
          </Button>
        </div>

        {/* Week Calendar */}
        <div className={`${GLASS_CARD} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentWeekOffset((o) => o - 1)} className="btn-press flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: 'var(--ink-muted)' }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-heading text-base" style={{ color: 'var(--ink)' }}>
              {weekDays[0].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} — {weekDays[6].toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => setCurrentWeekOffset((o) => o + 1)} className="btn-press flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: 'var(--ink-muted)' }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="-mx-2 overflow-x-auto px-2">
          <div className="grid grid-cols-7 gap-2 min-w-[560px]">
            {weekDays.map((day) => {
              const daySessions = getSessionsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className="rounded-xl p-2 min-h-[100px]"
                  style={{
                    background: isToday(day) ? 'var(--sage-light)' : 'var(--glass-bg)',
                    border: isToday(day) ? '1px solid var(--sage)' : '1px solid transparent',
                  }}
                >
                  <p className="text-center text-xs font-semibold mb-1" style={{ color: isToday(day) ? 'var(--sage)' : 'var(--ink-muted)' }}>
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-center text-sm font-bold mb-2" style={{ color: isToday(day) ? 'var(--sage)' : 'var(--ink)' }}>
                    {day.getDate()}
                  </p>
                  <div className="space-y-1">
                    {daySessions.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => handleStartSession(s.id)}
                        className="w-full rounded-lg px-1.5 py-1 text-left text-[10px] font-semibold leading-tight hover-lift"
                        style={{
                          background: s.status === 'ACTIVE' ? 'var(--sage)' : 'var(--c-accent-bg)',
                          color: s.status === 'ACTIVE' ? '#fff' : 'var(--c-accent)',
                        }}
                      >
                        {s.client?.firstName}
                        <br />
                        {new Date(s.scheduledAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Upcoming Sessions */}
        <div className={`${GLASS_CARD} p-5`}>
          <h2 className="font-heading text-lg mb-4" style={{ color: 'var(--ink)' }}>Upcoming Sessions</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
            </div>
          ) : upcomingSessions.length === 0 ? (
            <p className="text-sm font-medium text-center py-8" style={{ color: 'var(--ink-muted)' }}>No upcoming sessions. Book one to get started.</p>
          ) : (
            <div className="space-y-3">
              {upcomingSessions.map((s, i) => (
                <div key={s.id} className={`flex items-center justify-between rounded-xl p-3 stagger-${Math.min(i + 1, 4)}`} style={{ background: 'var(--sage-light)' }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
                      {((s.client?.firstName || '')[0] ?? '') + ((s.client?.lastName || '')[0] ?? '') || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.client?.firstName} {s.client?.lastName}</p>
                      <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(s.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {s.confirmedByPatient === false && (
                        <span className="inline-flex items-center gap-1 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>
                          Awaiting confirmation
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartSession(s.id)}
                    className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    style={{ background: 'var(--sage)', border: 'none' }}
                  >
                    <Play className="h-3 w-3" /> Enter <ArrowRight className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Book Session Modal */}
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
              <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)}
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
            <Button onClick={handleCreateBooking} disabled={saving} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
