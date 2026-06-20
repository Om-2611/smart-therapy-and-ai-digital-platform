'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Search, Copy, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface ClientWithMeta {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  diagnosis: string[];
  sessionCount: number;
  lastSession: string | null;
  user?: { email: string };
}

interface Invite {
  id: string;
  token: string;
  firstName: string;
  lastName: string;
  diagnosis: string[];
  status: string;
  createdAt: string;
}

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

export default function ClientsPage() {
  const { uid, role, profile } = useAuthStore();
  const router = useRouter();

  const [clients, setClients] = useState<ClientWithMeta[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [invitesOpen, setInvitesOpen] = useState(false);

  // Add patient modal
  const [isAddPatientModalOpen, setIsAddPatientModalOpen] = useState(false);
  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [patientDiagnosisInput, setPatientDiagnosisInput] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!uid || role !== 'THERAPIST') { router.push('/auth'); return; }
    fetchData();
  }, [uid, role]);

  const fetchData = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [clientsRes, invitesRes] = await Promise.all([
        fetch(`/api/clients?therapistId=${profile.id}`),
        fetch(`/api/invites?therapistId=${profile.id}`),
      ]);
      if (clientsRes.ok) { const d = await clientsRes.json(); setClients(d.clients || []); }
      if (invitesRes.ok) { const d = await invitesRes.json(); setInvites(d.invites || []); }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleAddPatient = async () => {
    if (!profile || !patientFirstName.trim()) return;
    setAdding(true);
    try {
      const diagnosis = patientDiagnosisInput.split(',').map((d) => d.trim()).filter((d) => d.length > 0);
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId: profile.id, firstName: patientFirstName.trim(), lastName: patientLastName.trim(), diagnosis }),
      });
      if (res.ok) {
        const data = await res.json();
        setInviteLink(`${window.location.origin}/auth?invite=${data.token}`);
        fetchData();
      }
    } catch (err) { console.error(err); }
    setAdding(false);
  };

  const resetAddPatient = () => {
    setIsAddPatientModalOpen(false);
    setPatientFirstName('');
    setPatientLastName('');
    setPatientDiagnosisInput('');
    setInviteLink('');
    setCopied(false);
  };

  const handleCopyInvite = async (link?: string) => {
    try {
      await navigator.clipboard.writeText(link || inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error(err); }
  };

  const nameInitials = (f?: string, l?: string) => `${(f || '')[0] ?? ''}${(l || '')[0] ?? ''}`.toUpperCase();

  const filteredClients = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingInvites = invites.filter((i) => i.status === 'PENDING');

  return (
    <DashboardLayout role={role} profile={profile}>
    <div className="relative">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob animate-blob" style={{ top: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle at 70% 30%, rgba(200, 96, 42, 0.08), transparent 70%)' }} />
        <div className="blob animate-blob" style={{ bottom: '-15%', left: '-8%', width: '35vw', height: '35vw', background: 'radial-gradient(circle at 30% 70%, rgba(156, 125, 89, 0.10), transparent 70%)', animationDelay: '-9s' }} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Clients</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
              {clients.length} client{clients.length !== 1 ? 's' : ''} in your practice
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients..."
                className="btn-press rounded-xl py-2.5 pl-9 pr-4 text-sm w-48 focus-visible:outline-none"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }}
              />
            </div>
            <Button onClick={() => setIsAddPatientModalOpen(true)} className="btn-press rounded-xl flex items-center gap-2 py-5 px-4 shadow-sm" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
              <Plus className="h-4 w-4" /> Add Patient
            </Button>
          </div>
        </div>

        {/* Client Cards */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className={`${GLASS_CARD} flex flex-col items-center justify-center py-20 gap-4`}>
            <div className="text-6xl">👋</div>
            <p className="font-heading text-xl" style={{ color: 'var(--ink)' }}>No clients yet</p>
            <p className="text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>Add your first patient to get started</p>
            <Button onClick={() => setIsAddPatientModalOpen(true)} className="btn-press rounded-xl flex items-center gap-2 px-5 py-2.5 shadow-sm mt-2" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
              <Plus className="h-4 w-4" /> Add Patient
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredClients.map((client, i) => (
              <div key={client.id} className={`${GLASS_CARD} p-5 stagger-${Math.min(i + 1, 4)}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
                    {nameInitials(client.firstName, client.lastName) || '🙂'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{client.firstName} {client.lastName}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {client.diagnosis.map((tag) => (
                        <span key={tag} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium mb-3" style={{ color: 'var(--ink-muted)' }}>
                  <span>Sessions: {client.sessionCount}</span>
                  <span>Last: {client.lastSession ? new Date(client.lastSession).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/sessions?clientId=${client.id}`)}
                    className="btn-press flex-1 rounded-lg py-2 text-xs font-semibold"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink-muted)' }}
                  >
                    View Sessions
                  </button>
                  <button
                    onClick={() => router.push(`/session/new?clientId=${client.userId}`)}
                    className="btn-press flex-1 rounded-lg py-2 text-xs font-semibold text-white"
                    style={{ background: 'var(--sage)', border: 'none' }}
                  >
                    Start Session
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className={`${CARD_BASE} overflow-hidden`}>
            <button
              onClick={() => setInvitesOpen(!invitesOpen)}
              className="flex w-full items-center justify-between p-4 text-left"
              style={{ color: 'var(--ink)' }}
            >
              <span className="font-heading text-lg" style={{ color: 'var(--ink)' }}>Pending Invites ({pendingInvites.length})</span>
              {invitesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {invitesOpen && (
              <div className="space-y-2 px-4 pb-4">
                {pendingInvites.map((inv) => {
                  const link = `${window.location.origin}/auth?invite=${inv.token}`;
                  return (
                    <div key={inv.id} className="flex items-center justify-between rounded-xl p-3" style={{ background: 'var(--sage-light)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{inv.firstName} {inv.lastName}</p>
                        {inv.diagnosis.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {inv.diagnosis.map((tag) => (
                              <span key={tag} className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>Created {new Date(inv.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button
                          onClick={() => handleCopyInvite(link)}
                          className="btn-press flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{ background: 'var(--sage)', color: '#fff' }}
                        >
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`You're invited to a STAAD therapy session. Sign up here: ${link}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-press flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      <Dialog open={isAddPatientModalOpen} onOpenChange={(open) => { if (!open) resetAddPatient(); else setIsAddPatientModalOpen(true); }}>
        <DialogContent className="rounded-2xl max-w-md" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
          {!inviteLink ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Add New Patient</DialogTitle>
                <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
                  Enter the patient's name and disorder. We'll generate an invite link for them to sign up.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>First Name</label>
                    <input value={patientFirstName} onChange={(e) => setPatientFirstName(e.target.value)} placeholder="John" className="w-full rounded-xl p-3 text-sm focus-visible:outline-none" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Last Name</label>
                    <input value={patientLastName} onChange={(e) => setPatientLastName(e.target.value)} placeholder="Doe" className="w-full rounded-xl p-3 text-sm focus-visible:outline-none" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Disorder / Diagnosis (comma-separated)</label>
                  <input value={patientDiagnosisInput} onChange={(e) => setPatientDiagnosisInput(e.target.value)} placeholder="ADHD, Anxiety, Dyslexia" className="w-full rounded-xl p-3 text-sm focus-visible:outline-none" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' }} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={resetAddPatient} className="btn-press rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
                <Button onClick={handleAddPatient} disabled={adding || !patientFirstName.trim()} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
                  {adding ? 'Generating...' : 'Generate Invite'}
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
                  <button onClick={() => handleCopyInvite()} className="btn-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--sage)', color: '#fff' }}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(`You're invited to a STAAD therapy session. Sign up here: ${inviteLink}`)}`} target="_blank" rel="noopener noreferrer" className="btn-press flex-1 rounded-xl py-2.5 text-center text-sm font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>Share via WhatsApp</a>
                  <a href={`mailto:?subject=${encodeURIComponent('Your STAAD therapy session invite')}&body=${encodeURIComponent(`You're invited to a STAAD therapy session. Sign up here: ${inviteLink}`)}`} className="btn-press flex-1 rounded-xl py-2.5 text-center text-sm font-semibold" style={{ background: 'var(--c-accent-bg)', color: 'var(--c-accent)' }}>Share via Email</a>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={resetAddPatient} className="btn-press rounded-xl font-semibold px-5" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
