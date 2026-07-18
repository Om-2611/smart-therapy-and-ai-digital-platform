'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Play, ArrowRight, FileText, X, Send, Loader2, Sparkles, RefreshCw, Pencil, Save } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import SessionReportView from '@/components/report/SessionReportView';

interface SessionData {
  id: string;
  scheduledAt: string;
  status: string;
  client?: { id: string; firstName: string; lastName: string; diagnosis?: string[] };
  therapist?: { firstName: string; lastName: string };
}

interface ClientBasic {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
}

interface NoteData {
  id: string;
  content: string;
  createdAt: string;
  isPrivate: boolean;
}

interface ReportData {
  content: string;
  model?: string | null;
  aiGenerated?: boolean;
  editedByTherapist?: boolean;
  generatedAt?: string;
  updatedAt?: string;
}

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

const FILTERS = ['All', 'Upcoming', 'Past', 'Active'];

export default function SessionsPage() {
  const { uid, role, profile } = useAuthStore();
  const { setActiveSessionId } = useSessionStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [clients, setClients] = useState<ClientBasic[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedClientFilter, setSelectedClientFilter] = useState(searchParams.get('clientId') ?? '');
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(10);

  // Notes drawer
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [notesSessionId, setNotesSessionId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Report drawer
  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingReport, setEditingReport] = useState(false);
  const [reportDraft, setReportDraft] = useState('');
  const [savingReport, setSavingReport] = useState(false);

  useEffect(() => {
    if (!uid) { router.push('/auth'); return; }
    fetchSessions();
    if (role === 'THERAPIST' && profile) {
      fetch(`/api/clients?therapistId=${profile.id}`).then(r => r.ok && r.json()).then(d => setClients(d.clients || [])).catch(() => {});
    }
  }, [uid, role, profile]);

  const fetchSessions = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const param = role === 'THERAPIST' ? `therapistId=${profile.id}` : `clientId=${profile.id}`;
      const res = await fetch(`/api/sessions?${param}`);
      if (res.ok) { const d = await res.json(); setSessions(d.sessions || []); }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const openNotesDrawer = async (sessionId: string) => {
    setNotesSessionId(sessionId);
    setNotesDrawerOpen(true);
    setNotesLoading(true);
    setNewNoteContent('');
    try {
      const res = await fetch(`/api/notes?sessionId=${sessionId}`);
      if (res.ok) { const d = await res.json(); setNotes(d.notes || []); }
    } catch (err) { console.error(err); }
    setNotesLoading(false);
  };

  const handleAddNote = async () => {
    if (!profile || !notesSessionId || !newNoteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: notesSessionId, therapistId: profile.id, content: newNoteContent.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setNotes((prev) => [d.note, ...prev]);
        setNewNoteContent('');
      }
    } catch (err) { console.error(err); }
    setSavingNote(false);
  };

  const handleStartSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    router.push(`/session/${sessionId}`);
  };

  const generateReport = async (sessionId: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/session-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) { const d = await res.json(); setReport(d.report); setEditingReport(false); }
    } catch (err) { console.error(err); }
    setGenerating(false);
  };

  const openReportDrawer = async (sessionId: string) => {
    setReportSessionId(sessionId);
    setReportDrawerOpen(true);
    setEditingReport(false);
    setReport(null);
    setReportLoading(true);
    try {
      const res = await fetch(`/api/session-report?sessionId=${sessionId}`);
      if (res.ok) {
        const d = await res.json();
        if (d.report) setReport(d.report);
        else await generateReport(sessionId); // none yet → generate on first view
      }
    } catch (err) { console.error(err); }
    setReportLoading(false);
  };

  const startEditingReport = () => {
    setReportDraft(report?.content ?? '');
    setEditingReport(true);
  };

  const saveReport = async () => {
    if (!reportSessionId) return;
    setSavingReport(true);
    try {
      const res = await fetch('/api/session-report', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: reportSessionId, content: reportDraft }),
      });
      if (res.ok) { const d = await res.json(); setReport(d.report); setEditingReport(false); }
    } catch (err) { console.error(err); }
    setSavingReport(false);
  };

  const nameInitials = (f?: string, l?: string) => `${(f || '')[0] ?? ''}${(l || '')[0] ?? ''}`.toUpperCase();

  const now = new Date();
  const filteredSessions = sessions.filter((s) => {
    if (activeFilter === 'Upcoming') return s.status === 'SCHEDULED' && new Date(s.scheduledAt) > now;
    if (activeFilter === 'Past') return s.status === 'COMPLETED' || new Date(s.scheduledAt) < now;
    if (activeFilter === 'Active') return s.status === 'ACTIVE';
    return true;
  }).filter((s) => {
    if (!selectedClientFilter) return true;
    return s.client?.id === selectedClientFilter || s.client?.id === selectedClientFilter;
  });

  const displayedSessions = filteredSessions.slice(0, displayCount);

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'var(--sage)';
      case 'SCHEDULED': return 'var(--ink-muted)';
      case 'COMPLETED': return 'var(--c-accent)';
      default: return 'var(--ink-muted)';
    }
  };

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
            <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Sessions</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>{filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}</p>
          </div>
          {role === 'THERAPIST' && clients.length > 0 && (
            <div className="w-48">
              <Select onValueChange={(val) => setSelectedClientFilter(val || '')} value={selectedClientFilter}>
                <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                  <SelectValue placeholder="All clients" />
                </SelectTrigger>
                <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                  <SelectItem value="" style={{ color: 'var(--ink)' }}>All clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} style={{ color: 'var(--ink)' }}>{c.firstName} {c.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="btn-press rounded-lg px-4 py-2 text-xs font-semibold"
              style={{
                background: activeFilter === f ? 'var(--sage)' : 'var(--glass-bg)',
                color: activeFilter === f ? '#fff' : 'var(--ink-muted)',
                border: activeFilter === f ? 'none' : '1px solid var(--glass-border)',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
          </div>
        ) : displayedSessions.length === 0 ? (
          <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-20 gap-3`}>
            <div className="text-5xl">📅</div>
            <p className="font-heading text-lg" style={{ color: 'var(--ink)' }}>No sessions found</p>
            <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>Sessions will appear here once scheduled</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayedSessions.map((session, i) => (
              <div key={session.id} className={`${GLASS_CARD} p-4 stagger-${Math.min(i + 1, 4)}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
                      {nameInitials(session.client?.firstName, session.client?.lastName) || '🙂'}
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                        {session.client?.firstName} {session.client?.lastName}
                      </p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                        {new Date(session.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ color: statusColor(session.status), background: `${statusColor(session.status)}15` }}>
                      {session.status}
                    </span>
                    {session.status === 'ACTIVE' && (
                      <button onClick={() => handleStartSession(session.id)} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--sage)', border: 'none' }}>
                        <Play className="h-3.5 w-3.5" /> Enter Room <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                    {(session.status === 'SCHEDULED') && (
                      <button onClick={() => handleStartSession(session.id)} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
                        <Play className="h-3.5 w-3.5" /> Enter Room
                      </button>
                    )}
                    {(session.status === 'COMPLETED') && (
                      <button onClick={() => openNotesDrawer(session.id)} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
                        <FileText className="h-3.5 w-3.5" /> View Notes
                      </button>
                    )}
                    {(session.status === 'COMPLETED') && role === 'THERAPIST' && (
                      <button onClick={() => openReportDrawer(session.id)} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--sage)', border: 'none' }}>
                        <Sparkles className="h-3.5 w-3.5" /> Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {displayedSessions.length < filteredSessions.length && (
              <div className="flex justify-center pt-2">
                <button onClick={() => setDisplayCount((c) => c + 10)} className="btn-press rounded-lg px-6 py-2.5 text-sm font-semibold" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
                  Load More ({filteredSessions.length - displayedSessions.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes Drawer */}
      {notesDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setNotesDrawerOpen(false)} />
          <div
            className="relative w-full max-w-md h-full overflow-y-auto p-6 animate-fade-in"
            style={{
              background: 'var(--glass-strong)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--glass-border)',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading text-xl" style={{ color: 'var(--ink)' }}>Session Notes</h2>
              <button onClick={() => setNotesDrawerOpen(false)} className="btn-press flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: 'var(--ink-muted)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {notesLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--sage)' }} />
              </div>
            ) : (
              <div className="space-y-4">
                {notes.length === 0 && (
                  <p className="text-sm font-medium text-center py-8" style={{ color: 'var(--ink-muted)' }}>No notes recorded for this session</p>
                )}
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl p-4" style={{ background: 'var(--sage-light)' }}>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{note.content}</p>
                    <p className="text-xs mt-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
                      {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}

                {/* Add note */}
                {role === 'THERAPIST' && (
                  <div className="pt-4 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                    <textarea
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Add a note..."
                      rows={3}
                      className="w-full rounded-xl p-3 text-sm resize-none focus-visible:outline-none"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={handleAddNote}
                        disabled={savingNote || !newNoteContent.trim()}
                        className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white"
                        style={{ background: 'var(--sage)', border: 'none', opacity: savingNote || !newNoteContent.trim() ? 0.6 : 1 }}
                      >
                        {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Save Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report Drawer */}
      {reportDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setReportDrawerOpen(false)} />
          <div
            className="relative w-full max-w-lg h-full overflow-y-auto p-6 animate-fade-in"
            style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', borderLeft: '1px solid var(--glass-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-xl" style={{ color: 'var(--ink)' }}>Session Report</h2>
              <button onClick={() => setReportDrawerOpen(false)} className="btn-press flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: 'var(--ink-muted)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {(reportLoading || generating) ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--sage)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                  {generating ? 'Generating report…' : 'Loading…'}
                </p>
              </div>
            ) : !report ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <p className="text-sm font-medium text-center" style={{ color: 'var(--ink-muted)' }}>No report yet for this session.</p>
                {reportSessionId && (
                  <button onClick={() => generateReport(reportSessionId)} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--sage)', border: 'none' }}>
                    <Sparkles className="h-3.5 w-3.5" /> Generate Report
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Meta + actions */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--ink-muted)' }}>
                    {report.editedByTherapist ? 'Edited by therapist' : 'AI-generated draft'}
                    {report.model ? ` · ${report.model}` : ''}
                  </span>
                  {!editingReport && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => reportSessionId && generateReport(reportSessionId)} className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
                        <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                      </button>
                      <button onClick={startEditingReport} className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: 'var(--sage)', border: 'none' }}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>
                  )}
                </div>

                {editingReport ? (
                  <>
                    <textarea
                      value={reportDraft}
                      autoFocus
                      onChange={(e) => setReportDraft(e.target.value)}
                      className="w-full rounded-xl p-4 text-sm leading-relaxed focus-visible:outline-none"
                      style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)', minHeight: '60vh', resize: 'vertical', fontFamily: "'DM Sans', sans-serif" }}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingReport(false)} className="btn-press rounded-lg px-4 py-2 text-xs font-semibold" style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}>
                        Cancel
                      </button>
                      <button onClick={saveReport} disabled={savingReport} className="btn-press flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ background: 'var(--sage)', border: 'none', opacity: savingReport ? 0.6 : 1 }}>
                        {savingReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </button>
                    </div>
                  </>
                ) : (() => {
                  const s = sessions.find((x) => x.id === reportSessionId);
                  const clientName = s?.client ? `${s.client.firstName} ${s.client.lastName}`.trim() : undefined;
                  const dateSrc = report.generatedAt || s?.scheduledAt;
                  const dateLabel = dateSrc
                    ? new Date(dateSrc).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : undefined;
                  return (
                    <div className="rounded-xl p-5" style={{ background: '#ffffff', border: '1px solid var(--glass-border)' }}>
                      <SessionReportView
                        content={report.content}
                        meta={{
                          clientName,
                          dateLabel,
                          statusLabel: report.editedByTherapist ? 'Edited by therapist' : 'AI-generated draft',
                        }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
