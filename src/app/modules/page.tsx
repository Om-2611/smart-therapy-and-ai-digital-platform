'use client';

import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import DashboardLayout from '@/components/layout/DashboardLayout';

interface ModuleData {
  id: string;
  name: string;
  emoji: string;
  category: string;
  description: string;
  approach: string;
}

const CATEGORIES = [
  'All',
  'SLD',
  'ADHD',
  'Anxiety & Depression',
  'Intellectual Disability',
  'General Therapy',
] as const;

const MODULES: ModuleData[] = [
  // SLD (5)
  { id: 'digital-sand-tray', name: 'Digital Sand Tray', emoji: '🎨', category: 'SLD', description: 'Expressive sand play in a digital environment', approach: 'Sensory Integration' },
  { id: 'word-building', name: 'Word Building', emoji: '🔤', category: 'SLD', description: 'Construct words from letters and sounds', approach: 'Phonics-based' },
  { id: 'whack-a-mole-math', name: 'Whack-a-Mole Math', emoji: '🔨', category: 'SLD', description: 'Math facts practice through whack-a-mole gameplay', approach: 'Gamified Learning' },
  { id: 'pixel-art-coding', name: 'Pixel Art Coding', emoji: '🎮', category: 'SLD', description: 'Learn coding basics through pixel art creation', approach: 'Computational Thinking' },
  { id: 'bubble-splash', name: 'Bubble Splash', emoji: '🫧', category: 'SLD', description: 'Pop bubbles to practice letter-number recognition', approach: 'Visual-Motor' },
  // ADHD (3)
  { id: 'n-back-challenge', name: 'N-Back Challenge', emoji: '🧠', category: 'ADHD', description: 'Dual n-back working memory training', approach: 'Cognitive Training' },
  { id: 'virtual-maze', name: 'Virtual Maze', emoji: '🌀', category: 'ADHD', description: 'Navigate mazes to build focus and planning', approach: 'Executive Function' },
  { id: 'simon-says', name: 'Simon Says', emoji: '🎯', category: 'ADHD', description: 'Follow pattern sequences with increasing difficulty', approach: 'Inhibitory Control' },
  // Anxiety & Depression (4)
  { id: 'grounding-54321', name: '5-4-3-2-1 Grounding', emoji: '🌿', category: 'Anxiety & Depression', description: 'Sensory grounding exercise for anxiety management', approach: 'Grounding Techniques' },
  { id: 'emotional-charades', name: 'Emotional Charades', emoji: '🎭', category: 'Anxiety & Depression', description: 'Identify and express emotions through play', approach: 'Emotional Literacy' },
  { id: 'virtual-box-popping', name: 'Virtual Box Popping', emoji: '📦', category: 'Anxiety & Depression', description: 'Pop boxes to release pent-up emotions', approach: 'Cathartic Release' },
  { id: 'worry-box', name: 'Worry Box', emoji: '📥', category: 'Anxiety & Depression', description: 'Deposit worries into a virtual worry box', approach: 'Externalization' },
  // Intellectual Disability (3)
  { id: 'drag-drop-sorting', name: 'Drag & Drop Sorting', emoji: '🧩', category: 'Intellectual Disability', description: 'Sort objects by shape, color, and category', approach: 'Cognitive Skills' },
  { id: 'social-story-sequencing', name: 'Social Story Sequencing', emoji: '📖', category: 'Intellectual Disability', description: 'Sequence social stories in the right order', approach: 'Social Narratives' },
  { id: 'virtual-shop', name: 'Virtual Shop', emoji: '🛒', category: 'Intellectual Disability', description: 'Practice everyday shopping and transactions', approach: 'Life Skills' },
  // General Therapy (12)
  { id: 'thought-challenger', name: 'Thought Challenger', emoji: '💭', category: 'General Therapy', description: 'Challenge and reframe negative thought patterns', approach: 'CBT' },
  { id: 'facts-vs-feelings', name: 'Facts vs Feelings', emoji: '⚖️', category: 'General Therapy', description: 'Distinguish between factual and emotional responses', approach: 'CBT' },
  { id: 'worry-vault', name: 'Worry Vault', emoji: '🔒', category: 'General Therapy', description: 'Lock away worries in a secure vault', approach: 'ACT' },
  { id: 'defusion-river', name: 'Defusion River', emoji: '🌊', category: 'General Therapy', description: 'Watch thoughts float by like leaves on a river', approach: 'ACT' },
  { id: 'urge-surfing-wave', name: 'Urge Surfing Wave', emoji: '🏄', category: 'General Therapy', description: 'Ride the wave of urges without acting on them', approach: 'ACT' },
  { id: 'values-card-sort', name: 'Values Card Sort', emoji: '🃏', category: 'General Therapy', description: 'Sort and prioritize personal values', approach: 'ACT' },
  { id: 'emotion-wheel', name: 'Emotion Wheel', emoji: '🎡', category: 'General Therapy', description: 'Explore and name the full spectrum of emotions', approach: 'Emotion-Focused' },
  { id: 'safe-space-builder', name: 'Safe Space Builder', emoji: '🏠', category: 'General Therapy', description: 'Create a personalized safe space visualization', approach: 'Positive Psych' },
  { id: 'micro-quest-board', name: 'Micro-Quest Board', emoji: '📋', category: 'General Therapy', description: 'Complete small therapeutic quests and missions', approach: 'Gamified Therapy' },
  { id: 'distortion-boss-fights', name: 'Distortion Boss Fights', emoji: '👾', category: 'General Therapy', description: 'Battle cognitive distortions in a boss fight format', approach: 'CBT' },
  { id: 'problem-solving-ladder', name: 'Problem-Solving Ladder', emoji: '🪜', category: 'General Therapy', description: 'Climb the ladder from problem to solution step by step', approach: 'CBT' },
  { id: 'support-circle-mapper', name: 'Support Circle Mapper', emoji: '🔄', category: 'General Therapy', description: 'Map out your personal support network', approach: 'Systemic' },
];

const CATEGORY_COLORS: Record<string, string> = {
  'SLD': '#8B6340',
  'ADHD': '#C4784A',
  'Anxiety & Depression': '#9c7d59',
  'Intellectual Disability': '#A87A4F',
  'General Therapy': '#8B6340',
};

const CARD_BASE =
  'rounded-[14px] border-[0.5px] border-[var(--glass-border)] shadow-[var(--glass-shadow)] bg-[var(--glass-bg)] dark:bg-[#16221e] animate-fade-up';
const GLASS_CARD = `${CARD_BASE} hover-lift`;

export default function ModulesPage() {
  const { role, profile } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered =
    activeCategory === 'All'
      ? MODULES
      : MODULES.filter((m) => m.category === activeCategory);

  return (
    <DashboardLayout role={role} profile={profile}>
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob animate-blob" style={{ top: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle at 70% 30%, rgba(200, 96, 42, 0.06), transparent 70%)' }} />
        <div className="blob animate-blob" style={{ bottom: '-15%', left: '-8%', width: '35vw', height: '35vw', background: 'radial-gradient(circle at 30% 70%, rgba(156, 125, 89, 0.08), transparent 70%)', animationDelay: '-9s' }} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-heading text-[28px]" style={{ color: 'var(--ink)' }}>Therapy Modules</h1>
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--ink-muted)' }}>
            {MODULES.length} interactive modules across {CATEGORIES.length - 1} categories &mdash; launched live in sessions
          </p>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="btn-press rounded-lg px-4 py-2 text-xs font-semibold"
              style={{
                background: activeCategory === cat ? 'var(--sage)' : 'var(--glass-bg)',
                color: activeCategory === cat ? '#fff' : 'var(--ink-muted)',
                border: activeCategory === cat ? 'none' : '1px solid var(--glass-border)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mod, i) => (
            <div key={mod.id} className={`${GLASS_CARD} p-5 stagger-${Math.min(i + 1, 4)}`}>
              <div className="text-[32px] mb-3">{mod.emoji}</div>
              <h3 className="font-heading text-[15px] mb-1" style={{ color: 'var(--ink)' }}>{mod.name}</h3>
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold mb-2"
                style={{
                  background: `${CATEGORY_COLORS[mod.category]}15`,
                  color: CATEGORY_COLORS[mod.category],
                }}
              >
                {mod.category}
              </span>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--ink-muted)' }}>{mod.description}</p>
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'var(--sage-light)', color: 'var(--sage)' }}
              >
                {mod.approach}
              </span>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div
          className="rounded-[14px] p-5 text-center"
          style={{ background: 'var(--sage-light)', border: '1px solid var(--glass-border)' }}
        >
          <p className="text-sm font-medium italic" style={{ color: 'var(--ink-muted)' }}>
            Modules are launched during live sessions from the therapy panel. They cannot be used outside a session.
          </p>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
