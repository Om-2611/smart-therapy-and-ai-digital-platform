'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Check, Loader2, Clock, CreditCard, Infinity as InfinityIcon, Sparkles } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { MODULE_CATEGORIES } from '@/lib/modules';

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;
const inputStyle = { background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--ink)' } as const;

interface Plan {
  id: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  durationMonths: number;
  toolQuota: number | null;
}
interface Current {
  planName: string;
  priceMonthly: number;
  toolQuota: number | null;
  status: string;
  months: number;
  startedAt: string;
  currentPeriodEnd: string;
  renewed: boolean;
  renewalCount: number;
  moduleAccess: string[];
}
interface Pending {
  id: string;
  planName: string;
  months: number;
  modules: string[];
}

const MONTH_OPTIONS = [1, 3, 6, 12];

export default function PlansPage() {
  const { uid, role, profile } = useAuthStore();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState(true);

  // Request modal
  const [reqPlan, setReqPlan] = useState<Plan | null>(null);
  const [months, setMonths] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid) { router.push('/auth'); return; }
    if (role && role !== 'THERAPIST') { router.push('/'); return; }
    if (role === 'THERAPIST' && profile?.id) load();
  }, [uid, role, profile?.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch('/api/plans'),
        fetch(`/api/subscriptions?therapistId=${profile.id}`),
      ]);
      if (pRes.ok) setPlans((await pRes.json()).plans || []);
      if (sRes.ok) {
        const d = await sRes.json();
        setCurrent(d.current);
        setPending(d.pendingRequest);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const openRequest = (p: Plan) => {
    setReqPlan(p);
    setMonths(p.durationMonths || 1);
    setSelected(new Set());
    setError('');
  };

  const toggle = (id: string) => {
    if (!reqPlan) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (reqPlan.toolQuota == null || next.size < reqPlan.toolQuota) next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!reqPlan || !profile?.id) return;
    setError('');
    if (reqPlan.toolQuota != null && selected.size === 0) {
      setError('Please select at least one tool.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/subscriptions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          therapistId: profile.id,
          planId: reqPlan.id,
          months,
          modules: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not submit request.'); }
      else { setReqPlan(null); load(); }
    } catch (err) { setError('Network error. Please try again.'); }
    setSubmitting(false);
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString();
  const price = (n: number) => (n > 0 ? `₹${n.toLocaleString('en-IN')}/mo` : 'Free');
  const quotaLabel = (q: number | null) => (q == null ? 'All tools' : `${q} tools`);

  return (
    <DashboardLayout role={role} profile={profile}>
      <div className="relative z-10 space-y-6">
        <div>
          <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Plans & Subscription</h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
            View your current plan and request a subscription. An admin reviews every request.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--sage)] border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Current plan / free tier */}
            <div className={`${GLASS_CARD} p-6`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                    {current ? <CreditCard className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Current plan</p>
                    <p className="font-heading text-2xl" style={{ color: 'var(--ink)' }}>
                      {current ? current.planName : 'Free tier'}
                    </p>
                  </div>
                </div>
                {current && (
                  <div className="text-right">
                    <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                      {current.renewed ? `Renewed ×${current.renewalCount}` : 'Active'}
                    </span>
                  </div>
                )}
              </div>

              {current ? (
                <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Tools', value: quotaLabel(current.toolQuota) },
                    { label: 'Term', value: `${current.months} mo` },
                    { label: 'Started', value: fmtDate(current.startedAt) },
                    { label: 'Renews / ends', value: fmtDate(current.currentPeriodEnd) },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>{s.label}</p>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium" style={{ color: 'var(--ink-muted)' }}>
                  You haven&apos;t taken a plan yet. Choose one below and send a request to unlock more tools.
                </p>
              )}
            </div>

            {/* Pending request banner */}
            {pending && (
              <div className={`${CARD_BASE} p-4 flex items-center gap-3`} style={{ borderColor: 'var(--c-accent)' }}>
                <Clock className="h-5 w-5 shrink-0" style={{ color: 'var(--c-accent)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  Your request for the <strong>{pending.planName}</strong> plan ({pending.months} mo
                  {pending.modules.length ? `, ${pending.modules.length} tools` : ''}) is awaiting admin approval.
                </p>
              </div>
            )}

            {/* Available plans */}
            <div>
              <h2 className="font-heading text-xl mb-3" style={{ color: 'var(--ink)' }}>Available plans</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((p, i) => (
                  <div key={p.id} className={`${CARD_BASE} stagger-${Math.min(i + 1, 4)} p-6 flex flex-col`}>
                    <div className="flex items-center gap-2">
                      <p className="font-heading text-xl" style={{ color: 'var(--ink)' }}>{p.name}</p>
                      {p.toolQuota == null && <InfinityIcon className="h-4 w-4" style={{ color: 'var(--sage)' }} />}
                    </div>
                    <p className="font-heading text-3xl mt-2" style={{ color: 'var(--ink)' }}>{price(p.priceMonthly)}</p>
                    <p className="text-sm font-medium mt-2" style={{ color: 'var(--ink-muted)' }}>{p.description}</p>
                    <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}>
                      <Check className="h-3.5 w-3.5" /> {quotaLabel(p.toolQuota)}
                    </div>
                    <div className="flex-1" />
                    <Button
                      onClick={() => openRequest(p)}
                      disabled={!!pending}
                      className="btn-press mt-5 rounded-xl font-semibold w-full"
                      style={{ background: 'var(--sage)', color: '#fff', border: 'none', opacity: pending ? 0.5 : 1 }}
                    >
                      {current?.planName === p.name ? 'Request again' : 'Request plan'}
                    </Button>
                  </div>
                ))}
                {plans.length === 0 && (
                  <div className={`${CARD_BASE} p-6 col-span-full text-sm font-medium`} style={{ color: 'var(--ink-muted)' }}>
                    No plans are available yet. Please check back later.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Request modal */}
      <Dialog open={!!reqPlan} onOpenChange={(o) => { if (!o) setReqPlan(null); }}>
        <DialogContent className="rounded-2xl max-w-lg" style={{ background: 'var(--glass-strong)', backdropFilter: 'blur(24px)', border: '1px solid var(--glass-border)' }}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-heading" style={{ color: 'var(--ink)' }}>Request {reqPlan?.name}</DialogTitle>
            <DialogDescription className="font-medium" style={{ color: 'var(--ink-muted)' }}>
              {reqPlan?.toolQuota == null
                ? 'This plan unlocks every tool. Choose a term and send your request.'
                : `Pick up to ${reqPlan?.toolQuota} tools you want, then send your request for admin approval.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[55vh] overflow-y-auto">
            {/* Term */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Term (months)</label>
              <div className="mt-2 flex gap-2">
                {MONTH_OPTIONS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMonths(m)}
                    className="btn-press rounded-lg px-4 py-2 text-sm font-semibold"
                    style={months === m
                      ? { background: 'var(--sage)', color: '#fff', border: '1px solid var(--sage)' }
                      : { ...inputStyle }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Tool selection (quota'd plans only) */}
            {reqPlan?.toolQuota != null && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Tools</label>
                  <span className="text-xs font-semibold" style={{ color: selected.size >= (reqPlan.toolQuota ?? 0) ? 'var(--c-accent)' : 'var(--ink-muted)' }}>
                    {selected.size} / {reqPlan.toolQuota} selected
                  </span>
                </div>
                <div className="mt-2 space-y-4">
                  {MODULE_CATEGORIES.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-muted)' }}>{cat.emoji} {cat.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {cat.modules.map((m) => {
                          const checked = selected.has(m.id);
                          const full = !checked && reqPlan.toolQuota != null && selected.size >= reqPlan.toolQuota;
                          return (
                            <label
                              key={m.id}
                              className="flex items-center gap-2 rounded-lg p-2"
                              style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.45 : 1 }}
                            >
                              <input type="checkbox" checked={checked} disabled={full} onChange={() => toggle(m.id)} style={{ accentColor: 'var(--sage)', width: 15, height: 15 }} />
                              <span className="text-sm" style={{ color: 'var(--ink)' }}>{m.emoji} {m.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm font-medium" style={{ color: '#ef4444' }}>{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReqPlan(null)} className="btn-press rounded-xl font-medium" style={{ color: 'var(--ink-muted)' }}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="btn-press rounded-xl font-semibold px-5 flex items-center gap-2" style={{ background: 'var(--sage)', color: '#fff', border: 'none' }}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
