'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  CreditCard,
  FileText,
  Flower2,
  Footprints,
  LifeBuoy,
  LogOut,
  Moon,
  Play,
  Plus,
  Smile,
  Sprout,
  Sun,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Video,
  Wind,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useTheme } from '@/components/ThemeProvider';
import { useNow, usePracticeData } from '@/hooks/usePracticeData';
import {
  Avatar,
  Card,
  Dropdown,
  EmptyState,
  ErrorBanner,
  IconBubble,
  LoadingBlock,
  Menu,
  MiniBars,
  PageHeader,
  ProgressRing,
  SectionTitle,
  Spinner,
  StatCard,
  StatusPill,
  Tag,
} from '@/components/practice/ui';
import { AddClientDialog, BookSessionDialog, StartSessionDialog } from '@/components/practice/dialogs';
import { useSessionActions } from '@/components/practice/useSessionActions';
import {
  SESSION_KIND,
  STATE_META,
  TONES,
  byStartAsc,
  clientFocus,
  clientStatus,
  fmtDate,
  fmtDayTime,
  fmtRelative,
  fmtSessionNo,
  fmtShortDate,
  fmtTime,
  fullName,
  greeting,
  isSameDay,
  newClientsSince,
  nextSessionFor,
  sessionClientId,
  sessionDuration,
  sessionNumbers,
  sessionRoomUrl,
  sessionState,
  weeklyCounts,
  type PracticeSession,
  type Tone,
} from '@/lib/practice';

type PracticeData = ReturnType<typeof usePracticeData>;

const TOOLKIT: { label: string; icon: typeof Sprout; tone: Tone; href: string }[] = [
  { label: 'CBT Activities', icon: Sprout, tone: 'green', href: '/modules?category=CBT' },
  { label: 'DBT Skills', icon: Flower2, tone: 'red', href: '/modules?category=DBT' },
  { label: 'Grounding', icon: Footprints, tone: 'blue', href: '/modules?q=grounding' },
  { label: 'Breathing', icon: Wind, tone: 'forest', href: `/modules?category=${encodeURIComponent('Anxiety & Depression')}` },
  { label: 'Journaling', icon: BookOpen, tone: 'clay', href: '/modules?q=worry' },
  { label: 'Mood Check-in', icon: Smile, tone: 'violet', href: '/modules?q=emotion' },
];

export default function Home() {
  const data = usePracticeData();
  const { uid, role, profile } = data;
  const router = useRouter();

  useEffect(() => {
    if (!uid) router.push('/auth');
    else if (role === 'ADMIN') router.push('/admin');
  }, [uid, role, router]);

  if (!profile || role === 'ADMIN') {
    return (
      <div className="ds-page flex h-screen w-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <DashboardLayout role={role} profile={profile}>
      {role === 'THERAPIST' ? <TherapistDashboard {...data} /> : <ClientHome {...data} />}
    </DashboardLayout>
  );
}

/* ─────────────────────────── Therapist dashboard ─────────────────────────── */

function TherapistDashboard({ profile, sessions, bookings, clients, loading, error, refresh }: PracticeData) {
  const router = useRouter();
  const now = useNow();
  const actions = useSessionActions(refresh);
  const [addOpen, setAddOpen] = useState(false);
  const [book, setBook] = useState<{ open: boolean; clientId?: string }>({ open: false });
  const [start, setStart] = useState<{ open: boolean; clientId?: string }>({ open: false });

  const numbers = useMemo(() => sessionNumbers(sessions), [sessions]);
  const durationOf = (s: PracticeSession) => sessionDuration(s, bookings);
  const stateOf = (s: PracticeSession) => sessionState(s, now, durationOf(s));

  const today = sessions
    .filter((s) => s.status !== 'CANCELLED' && isSameDay(new Date(s.scheduledAt), now))
    .sort(byStartAsc);
  const todayDone = today.filter((s) => s.status === 'COMPLETED').length;

  // Completion rate this month = completed ÷ sessions whose time has already come.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDue = sessions.filter((s) => {
    const t = new Date(s.scheduledAt);
    return t >= monthStart && t <= now && !['upcoming', 'live'].includes(stateOf(s));
  });
  const completedMonth = monthDue.filter((s) => s.status === 'COMPLETED').length;
  const completionRate = monthDue.length ? completedMonth / monthDue.length : 0;

  const pendingNotes = sessions.filter((s) => stateOf(s) === 'notes-pending').length;
  const activeClients = clients.filter((c) => clientStatus(c, sessions, bookings, now) !== 'follow-up').length;
  const newThisMonth = newClientsSince(clients, sessions, monthStart);
  const weekly = weeklyCounts(sessions, 6, now);

  const next = sessions.filter((s) => ['upcoming', 'live'].includes(stateOf(s))).sort(byStartAsc)[0];
  const nextState = next ? stateOf(next) : null;

  const nextTime = (s?: PracticeSession) => (s ? new Date(s.scheduledAt).getTime() : Infinity);
  const focus = clients
    .map((c) => ({ c, f: clientFocus(c, sessions, bookings, now), next: nextSessionFor(c.id, sessions, now) }))
    .sort((a, b) => a.f.rank - b.f.rank || nextTime(a.next) - nextTime(b.next))
    .slice(0, 3);

  const openBook = (clientId?: string) => setBook({ open: true, clientId });

  return (
    <div className="space-y-6">
      {/* Greeting + actions */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-5">
          <Avatar first={profile.firstName} last={profile.lastName} size={84} className="hidden text-[28px] sm:flex" />
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--ds-muted)' }}>
              {greeting(now)},
            </p>
            <h1 className="ds-title text-[40px] leading-[1.05] sm:text-[48px]">{profile.firstName}</h1>
            <p className="ds-muted mt-1 text-[15px]">Here&apos;s what your therapy day looks like.</p>
            <p className="mt-2 flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--ds-ink)' }}>
              <CalendarDays className="h-4 w-4" style={{ color: 'var(--ds-muted)' }} />
              {fmtDate(now)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="ds-btn ds-btn-outline" onClick={() => setAddOpen(true)}>
            <UserPlus /> Add Client
          </button>
          <button className="ds-btn ds-btn-outline" onClick={() => openBook()}>
            <CalendarPlus /> Book Appointment
          </button>
          <button className="ds-btn ds-btn-clay" onClick={() => setStart({ open: true })}>
            <Plus /> New Session
          </button>
          <AccountMenu profile={profile} />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refresh} />}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Today's Sessions"
          value={today.length}
          hint="Scheduled for today"
          onClick={() => router.push('/schedule')}
          visual={
            <ProgressRing value={today.length ? todayDone / today.length : 0} label={`${todayDone} of ${today.length} sessions done today`}>
              {todayDone}/{today.length}
            </ProgressRing>
          }
        />
        <StatCard
          icon={Users}
          label="Active Clients"
          value={activeClients}
          onClick={() => router.push('/clients')}
          hint={
            newThisMonth ? (
              <span className="inline-flex items-center gap-1">
                +{newThisMonth} new this month <TrendingUp className="h-3.5 w-3.5" />
              </span>
            ) : (
              'No new clients this month'
            )
          }
          visual={<MiniBars values={weekly} label="Sessions per week over the last 6 weeks" />}
        />
        <StatCard
          icon={CircleCheck}
          tone="green"
          label="Sessions Completed"
          value={completedMonth}
          hint="This month"
          onClick={() => router.push('/sessions')}
          visual={
            <ProgressRing value={completionRate} label="Completion rate this month">
              {Math.round(completionRate * 100)}%
            </ProgressRing>
          }
        />
        <StatCard
          icon={FileText}
          tone="red"
          label="Pending Session Notes"
          value={pendingNotes}
          hint={pendingNotes ? 'Need your attention' : 'All caught up'}
          highlight={pendingNotes > 0}
          onClick={() => router.push('/sessions?view=notes-pending')}
          visual={
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: 'var(--ds-surface)', color: 'var(--ds-red)' }}>
              <ChevronRight className="h-4 w-4" />
            </span>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Today's schedule */}
        <Card className="p-5 sm:p-6">
          <SectionTitle
            title="Today's Schedule"
            subtitle="Your appointments for today"
            action={
              <Link href="/schedule" className="ds-btn ds-btn-sm ds-btn-outline">
                <CalendarDays /> View Full Schedule <ChevronRight />
              </Link>
            }
          />
          <div className="mt-5">
            {loading ? (
              <LoadingBlock />
            ) : today.length === 0 ? (
              <EmptyState
                compact
                icon={
                  <IconBubble size={64}>
                    <CalendarDays className="h-7 w-7" />
                  </IconBubble>
                }
                title="No sessions today"
                body="Your day is open. Book an appointment or start a session whenever you're ready."
              >
                <button className="ds-btn ds-btn-primary" onClick={() => openBook()}>
                  <CalendarPlus /> Book Appointment
                </button>
              </EmptyState>
            ) : (
              <ol className="space-y-4">
                {today.map((s, i) => {
                  const st = stateOf(s);
                  const tone = TONES[STATE_META[st].tone];
                  const cid = sessionClientId(s);
                  return (
                    <li key={s.id} className="relative flex gap-3 sm:gap-4">
                      <div className="relative flex w-[86px] shrink-0 gap-2.5 pt-4 sm:w-[100px]">
                        <span
                          className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                          style={{ borderColor: tone.fg, background: 'var(--ds-surface)' }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
                        </span>
                        {i < today.length - 1 && (
                          <span
                            className="absolute left-[7px] top-9 bottom-[-28px] border-l-2 border-dashed"
                            style={{ borderColor: 'var(--ds-border-strong)' }}
                            aria-hidden
                          />
                        )}
                        <div>
                          <p className="whitespace-nowrap text-[14px] font-semibold">{fmtTime(s.scheduledAt)}</p>
                          <p className="ds-muted text-[12.5px]">{durationOf(s)} min</p>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 rounded-2xl p-4" style={{ border: '1px solid var(--ds-border)' }}>
                        <div className="flex items-start gap-3">
                          <Avatar first={s.client?.firstName} last={s.client?.lastName} size={46} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-semibold">{fullName(s.client)}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {(s.client?.diagnosis ?? []).slice(0, 2).map((t) => (
                                <Tag key={t} label={t} />
                              ))}
                            </div>
                            <p className="ds-muted mt-2 flex items-center gap-2 whitespace-nowrap text-[12.5px]">
                              <Video className="h-3.5 w-3.5 shrink-0" />
                              <span className="hidden sm:inline">{SESSION_KIND}</span>
                              {numbers.get(s.id) && (
                                <>
                                  <span aria-hidden className="hidden sm:inline">
                                    |
                                  </span>{' '}
                                  {fmtSessionNo(numbers.get(s.id))}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="hidden sm:inline-flex">
                              <StatusPill state={st} />
                            </span>
                            <Menu items={actions.menuFor(s, st, durationOf(s))} />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          <span className="mr-auto sm:hidden">
                            <StatusPill state={st} />
                          </span>
                          {(st === 'upcoming' || st === 'live' || st === 'missed') && cid && (
                            <button className="ds-btn ds-btn-sm ds-btn-outline" onClick={() => actions.viewClient(cid)}>
                              View Client
                            </button>
                          )}
                          {(st === 'upcoming' || st === 'live') && (
                            <button className="ds-btn ds-btn-sm ds-btn-primary" onClick={() => actions.enter(s)}>
                              <Play /> {st === 'live' ? 'Join Session' : 'Start Session'} <ChevronRight />
                            </button>
                          )}
                          {st === 'missed' && (
                            <button className="ds-btn ds-btn-sm ds-btn-clay-outline" onClick={() => actions.openReschedule(s)}>
                              Reschedule
                            </button>
                          )}
                          {(st === 'completed' || st === 'notes-pending') && (
                            <button className="ds-btn ds-btn-sm ds-btn-outline" onClick={() => actions.openNotes(s)}>
                              {st === 'notes-pending' ? 'Add Notes' : 'View Notes'}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          {/* Next session */}
          <Card
            className="p-5 sm:p-6"
            style={{ background: 'linear-gradient(140deg, var(--ds-forest-soft) 0%, var(--ds-surface) 75%)' }}
          >
            <SectionTitle title="Next Session" />
            {loading ? (
              <LoadingBlock />
            ) : next ? (
              <>
                <div className="mt-4 flex items-center gap-4">
                  <Avatar first={next.client?.firstName} last={next.client?.lastName} size={72} />
                  <div className="min-w-0">
                    <p className="ds-title truncate text-[26px] leading-tight">{fullName(next.client)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(next.client?.diagnosis ?? []).slice(0, 2).map((t) => (
                        <Tag key={t} label={t} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="ds-muted mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" /> {fmtDayTime(next.scheduledAt, now)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> {nextState === 'live' ? 'Live now' : fmtRelative(next.scheduledAt, now, durationOf(next))}
                  </span>
                  {numbers.get(next.id) && (
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-4 w-4" /> {fmtSessionNo(numbers.get(next.id))}
                    </span>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="ds-btn ds-btn-outline" onClick={() => actions.viewClient(sessionClientId(next))}>
                    View Client
                  </button>
                  <button className="ds-btn ds-btn-primary" onClick={() => actions.enter(next)}>
                    <Play /> {nextState === 'live' ? 'Join Session' : 'Start Session'}
                  </button>
                </div>
              </>
            ) : (
              <EmptyState compact title="Nothing booked yet" body="Book your next appointment and it will show up here.">
                <button className="ds-btn ds-btn-primary" onClick={() => openBook()}>
                  <CalendarPlus /> Book Appointment
                </button>
              </EmptyState>
            )}
          </Card>

          {/* Client focus */}
          <Card className="p-5 sm:p-6">
            <SectionTitle
              title="Client Focus"
              subtitle="Clients needing your attention"
              action={
                <Link href="/clients" className="ds-btn ds-btn-sm ds-btn-ghost">
                  View All Clients <ChevronRight />
                </Link>
              }
            />
            {loading ? (
              <LoadingBlock />
            ) : focus.length === 0 ? (
              <EmptyState compact title="No clients yet" body="Invite your first client to start tracking their journey.">
                <button className="ds-btn ds-btn-clay" onClick={() => setAddOpen(true)}>
                  <UserPlus /> Add Client
                </button>
              </EmptyState>
            ) : (
              <ul className="mt-3">
                {focus.map(({ c, f, next: cNext }) => (
                  <li key={c.id} className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: 'var(--ds-border)' }}>
                    <Avatar first={c.firstName} last={c.lastName} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="min-w-0 truncate text-[14px] font-semibold">{fullName(c)}</p>
                        {c.diagnosis[0] && <Tag label={c.diagnosis[0]} />}
                        <span
                          className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium"
                          style={{ color: TONES[f.tone].fg }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ background: TONES[f.tone].fg }} />
                          {f.label}
                        </span>
                      </div>
                      <p className="ds-muted mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]">
                        <span>
                          Last session: <span style={{ color: 'var(--ds-ink)' }}>{c.lastSession ? fmtShortDate(c.lastSession) : '—'}</span>
                        </span>
                        <span>
                          Next: <span style={{ color: 'var(--ds-ink)' }}>{cNext ? fmtDayTime(cNext.scheduledAt, now) : 'Not booked'}</span>
                        </span>
                      </p>
                    </div>
                    <Menu
                      items={[
                        { label: 'View client', icon: User, onClick: () => actions.viewClient(c.id) },
                        { label: 'Book a session', icon: CalendarPlus, onClick: () => openBook(c.id) },
                        {
                          label: cNext?.status === 'ACTIVE' ? 'Join live session' : 'Start session now',
                          icon: Play,
                          onClick: () => (cNext?.status === 'ACTIVE' ? actions.enter(cNext) : setStart({ open: true, clientId: c.id })),
                        },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Toolkit */}
      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Therapy Toolkit"
          subtitle="Quick access to therapeutic tools"
          action={
            <Link href="/modules" className="ds-btn ds-btn-sm ds-btn-ghost">
              View All Tools <ChevronRight />
            </Link>
          }
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
          {TOOLKIT.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl px-3 py-6 text-center text-[14px] font-medium transition-transform hover:-translate-y-0.5"
              style={{ background: TONES[t.tone].bg, color: 'var(--ds-ink)' }}
            >
              <t.icon className="h-8 w-8" style={{ color: TONES[t.tone].fg }} />
              {t.label}
            </Link>
          ))}
        </div>
      </Card>

      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />
      <BookSessionDialog
        open={book.open}
        onOpenChange={(open) => setBook((b) => ({ ...b, open }))}
        clients={clients}
        defaultClientId={book.clientId}
        onBooked={refresh}
        onAddClient={() => {
          setBook({ open: false });
          setAddOpen(true);
        }}
      />
      <StartSessionDialog
        open={start.open}
        onOpenChange={(open) => setStart((s) => ({ ...s, open }))}
        clients={clients}
        sessions={sessions}
        defaultClientId={start.clientId}
        onAddClient={() => {
          setStart({ open: false });
          setAddOpen(true);
        }}
      />
      {actions.dialogs}
    </div>
  );
}

function AccountMenu({ profile }: { profile: any }) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const go = (href: string) => router.push(href);
  const items = [
    { label: 'Profile', icon: User, onClick: () => go('/profile') },
    { label: 'Plans & subscription', icon: CreditCard, onClick: () => go('/plans') },
    { label: 'Help & support', icon: LifeBuoy, onClick: () => go('/help') },
    { label: theme === 'light' ? 'Dark mode' : 'Light mode', icon: theme === 'light' ? Moon : Sun, onClick: toggle },
  ];
  return (
    <Dropdown
      width={230}
      trigger={({ open, toggle: t }) => (
        <button
          type="button"
          onClick={t}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors hover:bg-[var(--ds-surface)]"
        >
          <Avatar first={profile.firstName} last={profile.lastName} size={40} />
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--ds-muted)' }} />
        </button>
      )}
    >
      {(close) => (
        <div role="menu">
          <div className="px-3 py-2">
            <p className="truncate text-[14px] font-semibold">{fullName(profile)}</p>
            <p className="ds-muted text-[12px]">Therapist</p>
          </div>
          <div className="my-1 h-px" style={{ background: 'var(--ds-border)' }} />
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className="ds-menu-item"
              onClick={() => {
                close();
                item.onClick();
              }}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
          <div className="my-1 h-px" style={{ background: 'var(--ds-border)' }} />
          <button
            role="menuitem"
            className="ds-menu-item"
            style={{ color: 'var(--ds-red)' }}
            onClick={async () => {
              close();
              await signOut(auth);
              router.push('/auth');
            }}
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </Dropdown>
  );
}

/* ─────────────────────────── Client home ─────────────────────────── */

function ClientHome({ profile, sessions, loading, error, refresh }: PracticeData) {
  const router = useRouter();
  const now = useNow();

  const upcoming = sessions
    .filter((s) => ['upcoming', 'live'].includes(sessionState(s, now)))
    .sort(byStartAsc);
  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const next = upcoming[0];
  const nextLive = next?.status === 'ACTIVE';

  return (
    <div className="space-y-6">
      <PageHeader title={`${greeting(now)}, ${profile.firstName}`} subtitle="Your calm space for sessions and progress." />
      {error && <ErrorBanner message={error} onRetry={refresh} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-6" style={{ background: 'linear-gradient(140deg, var(--ds-forest-soft) 0%, var(--ds-surface) 75%)' }}>
          <SectionTitle title="Your next session" />
          {loading ? (
            <LoadingBlock />
          ) : next ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar first={next.therapist?.firstName} last={next.therapist?.lastName} size={64} />
                <div>
                  <p className="ds-title text-[24px] leading-tight">with {fullName(next.therapist) || 'your therapist'}</p>
                  <p className="ds-muted mt-1 text-[14px]">{fmtDayTime(next.scheduledAt, now)}</p>
                </div>
              </div>
              <p className="flex items-center gap-2 text-[13.5px]" style={{ color: nextLive ? 'var(--ds-forest)' : 'var(--ds-muted)' }}>
                <Clock className="h-4 w-4" /> {nextLive ? 'Your therapist is in the room' : fmtRelative(next.scheduledAt, now)}
              </p>
              <button className="ds-btn ds-btn-lg ds-btn-primary" onClick={() => router.push(sessionRoomUrl(next.id))}>
                <Play /> Join Session
              </button>
            </div>
          ) : (
            <EmptyState compact title="No upcoming sessions" body="When your therapist schedules your next session it will appear here." />
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle title="Your journey" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4" style={{ background: 'var(--ds-green-soft)' }}>
              <p className="ds-title text-[32px] leading-none">{completed}</p>
              <p className="ds-muted mt-1 text-[13px]">Sessions completed</p>
            </div>
            <div className="rounded-2xl p-4" style={{ background: 'var(--ds-amber-soft)' }}>
              <p className="ds-title text-[32px] leading-none">{upcoming.length}</p>
              <p className="ds-muted mt-1 text-[13px]">Upcoming</p>
            </div>
          </div>
          <Link href="/my-sessions" className="ds-btn ds-btn-outline mt-5 w-full">
            View all my sessions <ChevronRight />
          </Link>
        </Card>
      </div>

      {upcoming.length > 1 && (
        <Card className="p-6">
          <SectionTitle title="Coming up" />
          <ul className="mt-3">
            {upcoming.slice(1, 6).map((s) => (
              <li key={s.id} className="flex items-center gap-3 border-t py-3 first:border-t-0" style={{ borderColor: 'var(--ds-border)' }}>
                <CalendarDays className="h-5 w-5" style={{ color: 'var(--ds-clay)' }} />
                <span className="flex-1 text-[14px]">{fmtDayTime(s.scheduledAt, now)}</span>
                <span className="ds-muted text-[13px]">with {fullName(s.therapist)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
