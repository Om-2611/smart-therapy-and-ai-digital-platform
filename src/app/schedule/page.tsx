'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Lightbulb,
  List,
  ListFilter,
  Play,
  Plus,
  Zap,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useNow, usePracticeData, useTherapistGuard } from '@/hooks/usePracticeData';
import { useSessionActions } from '@/components/practice/useSessionActions';
import { Avatar, Card, Dropdown, ErrorBanner, LoadingBlock, Menu, PageHeader, StatusPill, Tag, cx, toast } from '@/components/practice/ui';
import { AddClientDialog, AvailabilityDialog, BookSessionDialog } from '@/components/practice/dialogs';
import {
  SESSION_KIND,
  STATE_META,
  TONES,
  addDays,
  byStartAsc,
  downloadFile,
  fmtSessionNo,
  fmtTime,
  fullName,
  isSameDay,
  sessionDuration,
  sessionIcs,
  sessionNumbers,
  sessionState,
  startOfDay,
  startOfWeek,
  toDateInput,
  type PracticeSession,
  type SessionState,
} from '@/lib/practice';

const FILTERABLE: SessionState[] = ['upcoming', 'live', 'completed', 'notes-pending', 'missed'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const longDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function MiniMonth({
  month,
  onMonth,
  selected,
  onSelect,
  marks,
  now,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  selected: Date;
  onSelect: (d: Date) => void;
  marks: Set<string>;
  now: Date;
}) {
  const gridStart = startOfWeek(month);
  let cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  if (cells[35].getMonth() !== month.getMonth()) cells = cells.slice(0, 35);
  const shift = (n: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="ds-title text-[22px]">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="flex gap-1">
          <button className="ds-icon-btn" style={{ border: '1px solid var(--ds-border)' }} onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="ds-icon-btn" style={{ border: '1px solid var(--ds-border)' }} onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="ds-muted pb-1 text-[12px]">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const sel = isSameDay(d, selected);
          const today = isSameDay(d, now);
          const has = marks.has(toDateInput(d));
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelect(d)}
              aria-pressed={sel}
              aria-label={`${longDay(d)}${has ? ', has sessions' : ''}`}
              className="relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13.5px] transition-colors hover:bg-[var(--ds-surface-2)]"
              style={
                sel
                  ? { background: 'var(--ds-forest)', color: '#fff', fontWeight: 600 }
                  : { color: inMonth ? 'var(--ds-ink)' : 'var(--ds-faint)', boxShadow: today ? 'inset 0 0 0 1.5px var(--ds-clay)' : undefined }
              }
            >
              {d.getDate()}
              {has && !sel && <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: 'var(--ds-clay)' }} />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export default function SchedulePage() {
  useTherapistGuard();
  const { role, profile, sessions, bookings, clients, loading, error, refresh } = usePracticeData();
  const router = useRouter();
  const now = useNow();
  const actions = useSessionActions(refresh);

  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState<SessionState[]>([]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [book, setBook] = useState<{ open: boolean; day?: Date }>({ open: false });
  const [availOpen, setAvailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const numbers = useMemo(() => sessionNumbers(sessions), [sessions]);
  const durationOf = (s: PracticeSession) => sessionDuration(s, bookings);
  const stateOf = (s: PracticeSession) => sessionState(s, now, durationOf(s));

  const visible = sessions.filter(
    (s) => (showCancelled || s.status !== 'CANCELLED') && (statusFilter.length === 0 || statusFilter.includes(stateOf(s)))
  );
  const onDay = (d: Date) => visible.filter((s) => isSameDay(new Date(s.scheduledAt), d)).sort(byStartAsc);

  const weekStart = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const daySessions = onDay(selected);
  const hiddenOnDay = sessions.filter((s) => isSameDay(new Date(s.scheduledAt), selected)).length - daySessions.length;
  const isToday = isSameDay(selected, now);
  const isPast = selected < startOfDay(now);
  const filterCount = statusFilter.length + (showCancelled ? 1 : 0);

  const sessionDays = useMemo(
    () => new Set(sessions.filter((s) => s.status !== 'CANCELLED').map((s) => toDateInput(new Date(s.scheduledAt)))),
    [sessions]
  );

  const selectDay = (d: Date) => {
    const day = startOfDay(d);
    setSelected(day);
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  };
  const openBook = (day?: Date) => setBook({ open: true, day: day && day >= startOfDay(new Date()) ? day : undefined });

  const exportCalendar = () => {
    const upcoming = sessions.filter((s) => s.status === 'SCHEDULED' && new Date(s.scheduledAt) > now).sort(byStartAsc);
    if (upcoming.length === 0) {
      toast('No upcoming sessions to export yet.', 'info');
      return;
    }
    downloadFile('staad-schedule.ics', sessionIcs(upcoming.map((s) => ({ s, minutes: durationOf(s) }))), 'text/calendar');
    toast(`Exported ${upcoming.length} session${upcoming.length === 1 ? '' : 's'}. In Google Calendar, use Settings → Import & export to add them.`);
  };

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${days[6].toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;

  const quickActions = [
    { icon: CalendarPlus, title: 'Book a Session', sub: 'Schedule a new client session', onClick: () => openBook(selected) },
    { icon: Clock, title: 'Manage Availability', sub: 'Set your working hours', onClick: () => setAvailOpen(true) },
    { icon: CalendarCheck, title: 'Sync Calendar', sub: 'Export to Google Calendar (.ics)', onClick: exportCalendar },
    { icon: ClipboardList, title: 'View All Sessions', sub: 'See past and upcoming sessions', onClick: () => router.push('/sessions') },
  ];

  return (
    <DashboardLayout role={role} profile={profile}>
      <div className="space-y-6">
        <PageHeader
          title="Schedule"
          subtitle="Plan. Connect. Make a difference."
          actions={
            <button className="ds-btn ds-btn-lg ds-btn-clay" onClick={() => openBook(selected)}>
              <Plus /> Book Session
            </button>
          }
        />

        {error && <ErrorBanner message={error} onRetry={refresh} />}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            {/* Week strip */}
            <Card className="p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <button className="ds-icon-btn" onClick={() => selectDay(addDays(selected, -7))} aria-label="Previous week">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h2 className="ds-title flex-1 text-center text-[18px] sm:text-[22px]">{weekLabel}</h2>
                <button className="ds-icon-btn" onClick={() => selectDay(addDays(selected, 7))} aria-label="Next week">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button className="ds-btn ds-btn-outline ml-1" onClick={() => selectDay(new Date())}>
                  Today
                </button>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
                {days.map((d) => {
                  const n = onDay(d).length;
                  const sel = isSameDay(d, selected);
                  const today = isSameDay(d, now);
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => selectDay(d)}
                      aria-pressed={sel}
                      aria-label={`${longDay(d)}, ${n} session${n === 1 ? '' : 's'}`}
                      className="flex flex-col items-center rounded-2xl px-1 py-3 transition-colors"
                      style={
                        sel
                          ? { background: 'var(--ds-forest)', color: '#fff' }
                          : {
                              background: 'var(--ds-surface-2)',
                              color: 'var(--ds-ink)',
                              boxShadow: today ? 'inset 0 0 0 1.5px var(--ds-clay)' : undefined,
                            }
                      }
                    >
                      <span className="text-[12.5px] opacity-80">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <span className="text-[22px] leading-tight sm:text-[26px]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                        {d.getDate()}
                      </span>
                      <span className="hidden text-[11.5px] opacity-80 sm:block">
                        {n} session{n === 1 ? '' : 's'}
                      </span>
                      <span className="text-[11px] opacity-80 sm:hidden">{n}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Day / week detail */}
            <Card className="p-4 sm:p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="ds-title text-[24px] leading-tight sm:text-[28px]">
                    {selected.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h2>
                  <p className="ds-muted text-[14px]">
                    {view === 'calendar' ? 'Your week at a glance' : isToday ? 'Your sessions for today' : isPast ? 'Sessions on this day' : 'Your sessions for this day'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className={cx('ds-btn', view === 'list' ? 'ds-btn-primary' : 'ds-btn-outline')} aria-pressed={view === 'list'} onClick={() => setView('list')}>
                    <List /> List View
                  </button>
                  <button
                    className={cx('ds-btn', view === 'calendar' ? 'ds-btn-primary' : 'ds-btn-outline')}
                    aria-pressed={view === 'calendar'}
                    onClick={() => setView('calendar')}
                  >
                    <CalendarDays /> Calendar View
                  </button>
                  <Dropdown
                    width={240}
                    trigger={({ open, toggle }) => (
                      <button className="ds-btn ds-btn-outline" aria-expanded={open} onClick={toggle}>
                        <ListFilter /> Filter{filterCount ? ` (${filterCount})` : ''}
                      </button>
                    )}
                  >
                    {() => (
                      <div className="p-1.5">
                        <p className="ds-muted px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide">Show only</p>
                        {FILTERABLE.map((st) => (
                          <label key={st} className="ds-menu-item cursor-pointer">
                            <input
                              type="checkbox"
                              checked={statusFilter.includes(st)}
                              onChange={() => setStatusFilter((prev) => (prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]))}
                              style={{ accentColor: 'var(--ds-clay)' }}
                            />
                            {STATE_META[st].label}
                          </label>
                        ))}
                        <div className="my-1 h-px" style={{ background: 'var(--ds-border)' }} />
                        <label className="ds-menu-item cursor-pointer">
                          <input type="checkbox" checked={showCancelled} onChange={() => setShowCancelled((v) => !v)} style={{ accentColor: 'var(--ds-clay)' }} />
                          Show cancelled sessions
                        </label>
                        {filterCount > 0 && (
                          <button
                            className="ds-btn ds-btn-sm ds-btn-ghost mt-1 w-full"
                            onClick={() => {
                              setStatusFilter([]);
                              setShowCancelled(false);
                            }}
                          >
                            Reset filters
                          </button>
                        )}
                      </div>
                    )}
                  </Dropdown>
                </div>
              </div>

              <div className="mt-5">
                {loading ? (
                  <LoadingBlock label="Loading your schedule…" />
                ) : view === 'calendar' ? (
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[700px] grid-cols-7 gap-2">
                      {days.map((d) => {
                        const list = onDay(d);
                        const sel = isSameDay(d, selected);
                        const past = d < startOfDay(now);
                        return (
                          <div
                            key={d.toISOString()}
                            className="flex min-h-[240px] flex-col rounded-2xl p-2"
                            style={{ background: sel ? 'var(--ds-forest-soft)' : 'var(--ds-surface-2)' }}
                          >
                            <button className="mb-2 rounded-lg py-1 text-center hover:bg-[var(--ds-surface)]" onClick={() => selectDay(d)}>
                              <span className="ds-muted block text-[11.5px]">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                              <span className="text-[16px] font-semibold">{d.getDate()}</span>
                            </button>
                            <div className="flex-1 space-y-1.5">
                              {list.map((s) => {
                                const st = stateOf(s);
                                const tone = TONES[STATE_META[st].tone];
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      selectDay(d);
                                      setView('list');
                                    }}
                                    className="w-full rounded-lg px-2 py-1.5 text-left text-[11.5px] leading-tight"
                                    style={{ background: tone.bg, color: tone.fg }}
                                    title={`${fullName(s.client)} · ${STATE_META[st].label}`}
                                  >
                                    <span className="block font-semibold">{fmtTime(s.scheduledAt)}</span>
                                    <span className="block truncate">{s.client?.firstName}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {!past && (
                              <button className="ds-btn ds-btn-sm ds-btn-ghost mt-2 w-full" onClick={() => openBook(d)} aria-label={`Book a session on ${longDay(d)}`}>
                                <Plus /> Book
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : daySessions.length === 0 ? (
                  <div className="rounded-2xl px-4 py-10 text-center" style={{ border: '1px solid var(--ds-border)' }}>
                    <div
                      className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl"
                      style={{ background: 'var(--ds-clay-soft)', color: 'var(--ds-clay-ink)' }}
                    >
                      <CalendarDays className="h-12 w-12" strokeWidth={1.5} />
                    </div>
                    <p className="ds-title mt-5 text-[24px]">No sessions scheduled for {isToday ? 'today' : 'this day'}</p>
                    <p className="ds-muted mx-auto mt-1.5 max-w-md text-[14.5px]">
                      {isPast ? (
                        'Nothing was booked on this day.'
                      ) : (
                        <>
                          Looks like you have a free day.
                          <br />
                          Take this time to plan ahead or explore therapy resources.
                        </>
                      )}
                    </p>
                    {hiddenOnDay > 0 && (
                      <p className="mt-2 text-[13px]" style={{ color: 'var(--ds-amber)' }}>
                        {hiddenOnDay} session{hiddenOnDay === 1 ? ' is' : 's are'} hidden by your filters.{' '}
                        <button
                          className="underline"
                          onClick={() => {
                            setStatusFilter([]);
                            setShowCancelled(true);
                          }}
                        >
                          Show all
                        </button>
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      {!isPast && (
                        <button className="ds-btn ds-btn-lg ds-btn-primary" onClick={() => openBook(selected)}>
                          <Plus /> Book a Session
                        </button>
                      )}
                      <button className="ds-btn ds-btn-lg ds-btn-outline" onClick={() => router.push('/clients')}>
                        View All Clients
                      </button>
                    </div>
                    <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center gap-4 rounded-2xl p-4 text-left" style={{ background: 'var(--ds-surface-2)' }}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--ds-clay-soft)', color: 'var(--ds-clay-ink)' }}>
                        <Lightbulb className="h-5 w-5" />
                      </span>
                      <div className="min-w-[200px] flex-1">
                        <p className="text-[14px] font-semibold">Make the most of your day</p>
                        <p className="ds-muted text-[13px]">Use this time to complete pending notes, explore modules or prepare for upcoming sessions.</p>
                      </div>
                      <button className="ds-btn ds-btn-outline" onClick={() => router.push('/sessions?view=notes-pending')}>
                        Go to Tasks <ArrowRight />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <ul className="space-y-3">
                      {daySessions.map((s) => {
                        const st = stateOf(s);
                        const dur = durationOf(s);
                        return (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl p-4" style={{ border: '1px solid var(--ds-border)' }}>
                            <div className="w-[78px] shrink-0">
                              <p className="text-[14.5px] font-semibold">{fmtTime(s.scheduledAt)}</p>
                              <p className="ds-muted text-[12px]">{dur} min</p>
                            </div>
                            <div className="flex min-w-[180px] flex-1 items-center gap-3">
                              <Avatar first={s.client?.firstName} last={s.client?.lastName} size={44} />
                              <div className="min-w-0">
                                <p className="truncate text-[15px] font-semibold">{fullName(s.client)}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {s.client?.diagnosis?.[0] && <Tag label={s.client.diagnosis[0]} />}
                                  <span className="ds-muted text-[12.5px]">
                                    {SESSION_KIND}
                                    {numbers.get(s.id) ? ` · ${fmtSessionNo(numbers.get(s.id))}` : ''}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <StatusPill state={st} />
                            <div className="flex items-center gap-2">
                              {(st === 'upcoming' || st === 'live') && (
                                <button className="ds-btn ds-btn-sm ds-btn-primary" onClick={() => actions.enter(s)}>
                                  <Play /> {st === 'live' ? 'Join' : 'Start'}
                                </button>
                              )}
                              {(st === 'completed' || st === 'notes-pending') && (
                                <button className="ds-btn ds-btn-sm ds-btn-outline" onClick={() => actions.openNotes(s)}>
                                  {st === 'notes-pending' ? 'Add Notes' : 'View Notes'}
                                </button>
                              )}
                              {(st === 'missed' || st === 'cancelled') && (
                                <button className="ds-btn ds-btn-sm ds-btn-clay-outline" onClick={() => actions.openReschedule(s)}>
                                  Reschedule
                                </button>
                              )}
                              <Menu items={actions.menuFor(s, st, dur)} label={`More actions for ${fullName(s.client)}'s session`} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {!isPast && (
                      <div className="mt-4 flex justify-center">
                        <button className="ds-btn ds-btn-ghost" onClick={() => openBook(selected)}>
                          <Plus /> Book another session on this day
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>

          {/* Side column */}
          <div className="space-y-6">
            <MiniMonth month={month} onMonth={setMonth} selected={selected} onSelect={selectDay} marks={sessionDays} now={now} />
            <Card className="p-5">
              <h2 className="ds-title flex items-center gap-2 text-[22px]">
                <Zap className="h-5 w-5" style={{ color: 'var(--ds-clay)' }} /> Quick Actions
              </h2>
              <div className="mt-4 space-y-2">
                {quickActions.map((a) => (
                  <button
                    key={a.title}
                    onClick={a.onClick}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-[var(--ds-clay-soft)]"
                    style={{ background: 'var(--ds-surface-2)' }}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--ds-clay-soft)', color: 'var(--ds-clay-ink)' }}>
                      <a.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{a.title}</span>
                      <span className="ds-muted block text-[12.5px]">{a.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--ds-muted)' }} />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <BookSessionDialog
        open={book.open}
        onOpenChange={(open) => setBook((b) => ({ ...b, open }))}
        clients={clients}
        defaultDay={book.day}
        onBooked={(s) => {
          selectDay(new Date(s.scheduledAt));
          setView('list');
          refresh();
        }}
        onAddClient={() => {
          setBook({ open: false });
          setAddOpen(true);
        }}
      />
      <AvailabilityDialog open={availOpen} onOpenChange={setAvailOpen} />
      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />
      {actions.dialogs}
    </DashboardLayout>
  );
}
