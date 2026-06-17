'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { LifeBuoy, Mail, Send, Loader2, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

const CATEGORIES = ['Technical Issue', 'Billing', 'Account', 'Feedback', 'Other'];
const SUPPORT_EMAIL = 'om.cofounder@staad.in';

const inputStyle = {
  background: 'var(--glass-bg)',
  border: '1px solid var(--glass-border)',
  color: 'var(--ink)',
} as const;

export default function HelpPage() {
  const { uid, role, profile, email } = useAuthStore();
  const router = useRouter();

  const [category, setCategory] = useState('Technical Issue');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) { router.push('/auth'); return; }
  }, [uid]);

  const fullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : '';

  const handleSubmit = async () => {
    setError('');
    if (!subject.trim() || !message.trim()) {
      setError('Please add a subject and describe your issue.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName,
          email,
          role,
          category,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setSentRef(data.ref || 'Submitted');
        setSubject('');
        setMessage('');
        setCategory('Technical Issue');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
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
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm" style={{ background: 'linear-gradient(135deg, var(--sage), var(--sage-mid))' }}>
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Help &amp; Support</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
              Raise a ticket and our team will get back to you over email.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Ticket form */}
          <div className={`lg:col-span-2 ${GLASS_CARD} p-6`}>
            {sentRef ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-14 w-14" style={{ color: 'var(--sage)' }} />
                <h2 className="font-heading text-2xl mt-4" style={{ color: 'var(--ink)' }}>Ticket submitted!</h2>
                <p className="text-sm font-medium mt-2 max-w-sm" style={{ color: 'var(--ink-muted)' }}>
                  Thanks for reaching out. Your reference is <strong style={{ color: 'var(--ink)' }}>{sentRef}</strong>.
                  We&apos;ll reply to <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
                </p>
                <Button
                  onClick={() => setSentRef(null)}
                  className="btn-press rounded-xl font-semibold px-5 mt-6"
                  style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                >
                  Raise another ticket
                </Button>
              </div>
            ) : (
              <>
                <h2 className="font-heading text-xl mb-1" style={{ color: 'var(--ink)' }}>Raise a ticket</h2>
                <p className="text-sm font-medium mb-5" style={{ color: 'var(--ink-muted)' }}>
                  Describe your question or problem in detail.
                </p>

                <div className="space-y-4">
                  {/* Name + email (read-only context) */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Name</label>
                      <input value={fullName} readOnly className="w-full rounded-xl p-3 text-sm focus-visible:outline-none opacity-80" style={inputStyle} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Email</label>
                      <input value={email || ''} readOnly className="w-full rounded-xl p-3 text-sm focus-visible:outline-none opacity-80" style={inputStyle} />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Category</label>
                    <Select onValueChange={(val) => setCategory(val || 'Other')} value={category}>
                      <SelectTrigger className="w-full rounded-xl" style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)' }}>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} style={{ color: 'var(--ink)' }}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Subject */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Subject</label>
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief summary of your issue"
                      className="w-full rounded-xl p-3 text-sm focus-visible:outline-none"
                      style={inputStyle}
                    />
                  </div>

                  {/* Message */}
                  <div className="space-y-1">
                    <label className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what's happening, what you expected, and any steps to reproduce..."
                      rows={6}
                      className="w-full rounded-xl p-3 text-sm focus-visible:outline-none resize-y"
                      style={inputStyle}
                    />
                  </div>

                  {error && (
                    <p className="text-sm font-medium" style={{ color: 'var(--c-accent)' }}>{error}</p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      onClick={handleSubmit}
                      disabled={sending}
                      className="btn-press rounded-xl font-semibold px-5 flex items-center gap-2"
                      style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {sending ? 'Sending...' : 'Submit Ticket'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Contact info side panel */}
          <div className="space-y-6">
            <div className={`${GLASS_CARD} stagger-1 p-6`}>
              <h3 className="font-heading text-lg mb-3" style={{ color: 'var(--ink)' }}>Contact us directly</h3>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-3 rounded-xl p-3 no-underline"
                style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--glass-bg)', color: 'var(--sage)' }}>
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>Email</p>
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{SUPPORT_EMAIL}</p>
                </div>
              </a>
              <p className="text-xs font-medium mt-4" style={{ color: 'var(--ink-muted)' }}>
                We typically respond within 1&ndash;2 business days. Tickets you raise here are emailed straight to our support team.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
