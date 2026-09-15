'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark, BookmarkCheck, Clock, Lock, SlidersHorizontal } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { usePracticeData, useTherapistGuard } from '@/hooks/usePracticeData';
import { Card, EmptyState, PageHeader, Pill, SearchInput, cx, toast } from '@/components/practice/ui';
import { AddClientDialog, StartSessionDialog } from '@/components/practice/dialogs';
import { MODULE_CATEGORIES, resolveAllowedModuleIds } from '@/lib/modules';
import { TONES, type Tone } from '@/lib/practice';

// Display names for the registry categories in src/lib/modules.ts.
const CATEGORY_LABEL: Record<string, string> = {
  sld: 'SLD',
  adhd: 'ADHD',
  'anxiety-dep': 'Anxiety & Depression',
  id: 'Intellectual Disability',
  general: 'General Therapy',
  skill: 'Skill Development',
};

const CATEGORY_TONE: Record<string, Tone> = {
  sld: 'clay',
  adhd: 'red',
  'anxiety-dep': 'green',
  id: 'blue',
  general: 'amber',
  skill: 'violet',
};

type Approach = 'CBT' | 'DBT';

// Card copy, the skill each module targets, a typical run length, and which
// therapeutic approach it draws on (drives the CBT / DBT filters).
const META: Record<string, { blurb: string; focus: string; minutes: string; approaches?: Approach[] }> = {
  'word-building': { blurb: 'Construct words from letters and sounds.', focus: 'Language', minutes: '5–10' },
  'whack-a-mole-math': { blurb: 'Math facts practice through whack-a-mole gameplay.', focus: 'Attention', minutes: '5–10' },
  'pixel-art-coding': { blurb: 'Learn coding basics through pixel art creation.', focus: 'Creativity', minutes: '10–15' },
  'bubble-splash': { blurb: 'Pop bubbles to practice letter-number recognition.', focus: 'Visual Processing', minutes: '5–10' },
  'n-back-challenge': { blurb: 'Dual n-back working memory training.', focus: 'Working Memory', minutes: '10–15' },
  maze: { blurb: 'Navigate mazes to build focus and planning.', focus: 'Planning', minutes: '10–15' },
  'simon-says': { blurb: 'Follow pattern sequences with increasing difficulty.', focus: 'Inhibitory Control', minutes: '5–10' },
  '5-4-3-2-1-grounding': { blurb: 'Sensory grounding exercise for anxiety management.', focus: 'Grounding', minutes: '5–10', approaches: ['DBT'] },
  'emotional-charades': { blurb: 'Identify and express emotions through play.', focus: 'Emotional Literacy', minutes: '10–15' },
  'virtual-box-popping': { blurb: 'Pop boxes to release built-up tension safely.', focus: 'Tension Release', minutes: '5–10', approaches: ['DBT'] },
  'worry-box': { blurb: 'Write worries down and set them aside in a box.', focus: 'Externalisation', minutes: '5–10', approaches: ['CBT'] },
  'drag-drop-sorting': { blurb: 'Sort objects by shape, colour and category.', focus: 'Cognitive Skills', minutes: '5–10' },
  'social-story-sequencing': { blurb: 'Put everyday social stories in the right order.', focus: 'Social Skills', minutes: '10–15' },
  'virtual-shop': { blurb: 'Practise everyday shopping and handling money.', focus: 'Life Skills', minutes: '10–15' },
  'emotion-wheel': { blurb: 'Explore and name the full spectrum of emotions.', focus: 'Emotion Awareness', minutes: '5–10', approaches: ['DBT'] },
  'defusion-river': { blurb: 'Watch thoughts float by like leaves on a river.', focus: 'Defusion (ACT)', minutes: '10–15' },
  'thought-challenger': { blurb: 'Challenge and reframe unhelpful thoughts.', focus: 'Cognitive Restructuring', minutes: '10–15', approaches: ['CBT'] },
  'micro-quest-board': { blurb: 'Complete small, achievable therapeutic quests.', focus: 'Behavioural Activation', minutes: '10–15', approaches: ['CBT'] },
  'values-card-sort': { blurb: 'Sort and prioritise personal values.', focus: 'Values (ACT)', minutes: '10–15' },
  'worry-vault': { blurb: 'Lock worries away until a scheduled worry time.', focus: 'Worry Time', minutes: '5–10', approaches: ['CBT'] },
  'facts-vs-feelings': { blurb: 'Separate what happened from how it felt.', focus: 'Reality Testing', minutes: '5–10', approaches: ['CBT'] },
  'story-choice-adventure': { blurb: 'Learn about consequences through interactive choices.', focus: 'Decision Making', minutes: '10–15' },
  'emotion-detective': { blurb: 'Work out how others feel in real-life situations.', focus: 'Empathy', minutes: '10–15' },
  'build-together': { blurb: 'Combine what you each know to build something.', focus: 'Collaboration', minutes: '10–15' },
  'treasure-quest': { blurb: 'Follow a chain of clues by sharing information.', focus: 'Communication', minutes: '10–15' },
};

interface ModuleCard {
  id: string;
  name: string;
  emoji: string;
  categoryId: string;
  category: string;
  blurb: string;
  focus: string;
  minutes: string;
  approaches: Approach[];
}

const MODULES: ModuleCard[] = MODULE_CATEGORIES.flatMap((cat) =>
  cat.modules.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    categoryId: cat.id,
    category: CATEGORY_LABEL[cat.id] ?? cat.name,
    blurb: META[m.id]?.blurb ?? m.desc,
    focus: META[m.id]?.focus ?? '',
    minutes: META[m.id]?.minutes ?? '10–15',
    approaches: META[m.id]?.approaches ?? [],
  }))
);

const CHIPS = ['All', 'CBT', 'DBT', 'Anxiety & Depression', 'ADHD', 'Intellectual Disability', 'General Therapy'];
const FILTER_OPTIONS = ['All', 'Saved', 'CBT', 'DBT', ...MODULE_CATEGORIES.map((c) => CATEGORY_LABEL[c.id] ?? c.name)];

export default function ModulesPage() {
  useTherapistGuard();
  const { role, profile, sessions, clients, refresh } = usePracticeData();

  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [launch, setLaunch] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const storageKey = `staad-saved-modules-${profile?.id ?? 'anon'}`;

  // Deep links from the dashboard toolkit: ?category=CBT or ?q=grounding
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const cat = p.get('category');
    const q = p.get('q');
    if (cat && FILTER_OPTIONS.includes(cat)) setFilter(cat);
    if (q) setSearch(q);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setSaved(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {}
  }, [storageKey]);

  const allowed = useMemo(() => new Set(resolveAllowedModuleIds(profile)), [profile]);
  const lockedCount = MODULES.filter((m) => !allowed.has(m.id)).length;

  const toggleSave = (m: ModuleCard) => {
    const had = saved.has(m.id);
    const next = new Set(saved);
    if (had) next.delete(m.id);
    else next.add(m.id);
    setSaved(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
    } catch {}
    toast(had ? `${m.name} removed from saved` : `${m.name} saved`, had ? 'info' : 'success');
  };

  const q = search.trim().toLowerCase();
  const filtered = MODULES.filter((m) => {
    if (filter === 'Saved') return saved.has(m.id);
    if (filter === 'CBT' || filter === 'DBT') return m.approaches.includes(filter);
    return filter === 'All' || m.category === filter;
  }).filter((m) => !q || [m.name, m.blurb, m.focus, m.category, ...m.approaches].some((v) => v.toLowerCase().includes(q)));

  return (
    <DashboardLayout role={role} profile={profile}>
      <div className="space-y-6">
        <PageHeader
          title="Therapy Modules"
          subtitle="Interactive tools for meaningful progress."
          actions={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="Search modules…" className="w-full sm:w-[260px]" />
              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ds-muted)' }} />
                <select
                  aria-label="Module category"
                  className="ds-input"
                  style={{ width: 230, paddingLeft: '2.5rem' }}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {FILTER_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o === 'All' ? 'All Categories' : o === 'Saved' ? `Saved (${saved.size})` : o}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => (
            <button key={c} className={cx('ds-pill-tab', filter === c && 'is-active')} aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {c}
            </button>
          ))}
          <span className="ds-muted ml-auto text-[14px]">
            {filtered.length} module{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {lockedCount > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px]" style={{ background: 'var(--ds-amber-soft)', color: 'var(--ds-ink)' }}>
            <Lock className="h-4 w-4" style={{ color: 'var(--ds-amber)' }} />
            <span className="flex-1">
              {lockedCount} module{lockedCount === 1 ? ' is' : 's are'} not included in your current plan.
            </span>
            <Link href="/plans" className="ds-btn ds-btn-sm ds-btn-outline">
              See plans
            </Link>
          </div>
        )}

        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              title={filter === 'Saved' && !q ? 'No saved modules yet' : 'No modules match'}
              body={filter === 'Saved' && !q ? 'Tap the bookmark on any module to keep it here for quick access.' : 'Try a different search or category.'}
            >
              <button
                className="ds-btn ds-btn-outline"
                onClick={() => {
                  setFilter('All');
                  setSearch('');
                }}
              >
                Show all modules
              </button>
            </EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((m) => {
              const tone = CATEGORY_TONE[m.categoryId] ?? 'clay';
              const isSaved = saved.has(m.id);
              const isAllowed = allowed.has(m.id);
              return (
                <Card key={m.id} className="ds-card-hover flex gap-4 p-5">
                  <div
                    className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full text-[42px] sm:h-[96px] sm:w-[96px]"
                    style={{ background: TONES[tone].bg, opacity: isAllowed ? 1 : 0.6 }}
                    aria-hidden
                  >
                    {m.emoji}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="ds-title text-[21px] leading-tight">{m.name}</h3>
                      <button
                        className="ds-icon-btn -mr-2 -mt-1"
                        aria-pressed={isSaved}
                        aria-label={isSaved ? `Remove ${m.name} from saved` : `Save ${m.name}`}
                        onClick={() => toggleSave(m)}
                      >
                        {isSaved ? <BookmarkCheck className="h-5 w-5" style={{ color: 'var(--ds-clay)' }} /> : <Bookmark className="h-5 w-5" />}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill tone={tone}>{m.category}</Pill>
                      {m.focus && <Pill tone="gray">{m.focus}</Pill>}
                    </div>
                    <p className="ds-muted mt-2.5 text-[13px] leading-relaxed">{m.blurb}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <span className="ds-muted inline-flex items-center gap-1.5 text-[12.5px]">
                        <Clock className="h-4 w-4" /> {m.minutes} min
                      </span>
                      {isAllowed ? (
                        <button className="ds-btn ds-btn-sm ds-btn-primary" onClick={() => setLaunch({ id: m.id, name: m.name })}>
                          Launch in Session <ArrowRight />
                        </button>
                      ) : (
                        <Link href="/plans" className="ds-btn ds-btn-sm ds-btn-outline">
                          <Lock /> Unlock with a plan
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <p className="ds-muted text-center text-[13px]">
          Modules run inside a live session. &ldquo;Launch in Session&rdquo; opens the session room with the module ready.
        </p>
      </div>

      <StartSessionDialog
        open={!!launch}
        onOpenChange={(o) => !o && setLaunch(null)}
        clients={clients}
        sessions={sessions}
        moduleId={launch?.id}
        moduleName={launch?.name}
        onAddClient={() => {
          setLaunch(null);
          setAddOpen(true);
        }}
      />
      <AddClientDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />
    </DashboardLayout>
  );
}
