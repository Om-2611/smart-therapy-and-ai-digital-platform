'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

interface ModuleItem {
  id: string
  name: string
  emoji: string
  desc: string
}

interface Category {
  id: string
  name: string
  desc: string
  emoji: string
  iconBg: string
  iconBorder: string
  modules: ModuleItem[]
}

const CATEGORIES: Category[] = [
  {
    id: 'sld',
    name: 'SLD',
    desc: 'Specific Learning Disorder',
    emoji: '📚',
    iconBg: 'rgba(120,90,220,0.25)',
    iconBorder: 'rgba(120,90,220,0.3)',
    modules: [
      { id: 'digital-sand-tray', name: 'Digital Sand Tray', emoji: '🏖️', desc: 'Non-verbal expression · emotional processing' },
      { id: 'word-building', name: 'Word Building', emoji: '🔤', desc: 'Phonics · spelling · decoding' },
      { id: 'whack-a-mole-math', name: 'Whack-a-Mole Math', emoji: '🔨', desc: 'Math fluency · number recognition' },
      { id: 'pixel-art-coding', name: 'Pixel Art Coding', emoji: '🎨', desc: 'Sequential thinking · pattern recognition' },
      { id: 'bubble_splash', name: 'Bubble Splash', emoji: '🫧', desc: 'Sight words · reading fluency' },
    ],
  },
  {
    id: 'adhd',
    name: 'ADHD',
    desc: 'Attention Deficit Hyperactivity Disorder',
    emoji: '⚡',
    iconBg: 'rgba(220,150,40,0.22)',
    iconBorder: 'rgba(220,150,40,0.3)',
    modules: [
      { id: 'n-back-challenge', name: 'N-Back Challenge', emoji: '🧠', desc: 'Working memory · clinically validated' },
      { id: 'maze', name: 'Virtual Maze', emoji: '🌀', desc: 'Sustained attention · motor planning' },
      { id: 'simon-says', name: 'Simon Says', emoji: '🎮', desc: 'Executive function · inhibitory control' },
    ],
  },
  {
    id: 'anxiety-dep',
    name: 'Anxiety & Depression',
    desc: 'Anxiety and mood disorders',
    emoji: '🌿',
    iconBg: 'rgba(74,124,111,0.25)',
    iconBorder: 'rgba(74,124,111,0.3)',
    modules: [
      { id: '5-4-3-2-1-grounding', name: '5-4-3-2-1 Grounding', emoji: '🌱', desc: 'Sensory anchoring · anxiety reduction' },
      { id: 'emotional-charades', name: 'Emotional Charades', emoji: '🎭', desc: 'Emotion identification · social learning' },
      { id: 'virtual-box-popping', name: 'Virtual Box Popping', emoji: '📦', desc: 'Tension release · cognitive defusion' },
      { id: 'worry-box', name: 'Worry Box', emoji: '🗃️', desc: 'Worry containment · externalisation' },
    ],
  },
  {
    id: 'id',
    name: 'ID',
    desc: 'Intellectual Disability',
    emoji: '🌟',
    iconBg: 'rgba(40,130,210,0.22)',
    iconBorder: 'rgba(40,130,210,0.3)',
    modules: [
      { id: 'drag-drop-sorting', name: 'Drag & Drop Sorting', emoji: '🗂️', desc: 'Categorisation · concept formation' },
      { id: 'social-story-sequencing', name: 'Social Story Sequencing', emoji: '📖', desc: 'Narrative comprehension · social prep' },
      { id: 'virtual-shop', name: 'Virtual Shop', emoji: '🛒', desc: 'Money skills · daily living' },
    ],
  },
]

interface ModuleSelectorPanelProps {
  open: boolean
  onClose: () => void
  onLaunch: (moduleId: string, moduleName: string) => void
}

export default function ModuleSelectorPanel({ open, onClose, onLaunch }: ModuleSelectorPanelProps) {
  const hoverStyles = `
    .hover\\:bg-white-12:hover { background: rgba(255,255,255,0.12); }
    .hover\\:bg-white-10:hover { background: rgba(255,255,255,0.10); }
  `
  const [currentCategory, setCurrentCategory] = useState<string | null>(null)

  const category = currentCategory ? CATEGORIES.find(c => c.id === currentCategory) : null

  const handleBack = () => {
    setCurrentCategory(null)
  }

  const handleLaunch = (mod: ModuleItem) => {
    onLaunch(mod.id, mod.name)
  }

  return (
    <>
      <style>{hoverStyles}</style>
      <div
        style={{
          position: 'absolute',
        top: 48,
        left: 0,
        bottom: 64,
        width: 280,
        zIndex: 25,
        background: 'rgba(20,30,26,0.42)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderRight: '1px solid rgba(255,255,255,0.13)',
        boxShadow: '2px 0 24px rgba(0,0,0,0.18)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'rgba(0,0,0,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14 }}>🗂️</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
            {category ? category.name : 'Therapy Modules'}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            border: 'none',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div
        style={{
          padding: '7px 14px',
          fontSize: 10,
          color: 'rgba(255,255,255,0.3)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        {category ? (
          <>
            <span
              onClick={handleBack}
              style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            >
              All
            </span>
            <span style={{ color: 'rgba(255,255,255,0.2)' }}> › {category.name}</span>
          </>
        ) : (
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>All categories</span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {category ? (
          /* CATEGORY VIEW */
          <div className="flex flex-col gap-1">
            {/* Back button */}
            <button
              onClick={handleBack}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 11,
                cursor: 'pointer',
                padding: '6px 4px',
                textAlign: 'left',
              }}
            >
              ‹ Back
            </button>

            {/* Category description */}
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 7,
                padding: '7px 10px',
                marginBottom: 4,
              }}
            >
              {category.desc}
            </div>

            {/* Module list */}
            <div className="flex flex-col" style={{ gap: 5 }}>
              {category.modules.map((mod) => (
                <div
                  key={mod.id}
                  className="group hover:bg-white-10"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '9px 11px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    transition: 'background 0.15s',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 7,
                      background: 'rgba(255,255,255,0.07)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    {mod.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
                      {mod.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {mod.desc}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLaunch(mod)}
                    className="opacity-0 group-hover:opacity-100"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(74,124,111,0.4)',
                      background: 'rgba(74,124,111,0.3)',
                      color: '#b8d4ce',
                      fontSize: 10,
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    Launch
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ROOT VIEW — category folders */
          <div className="flex flex-col" style={{ gap: 6 }}>
            {CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                onClick={() => setCurrentCategory(cat.id)}
                className="hover:bg-white-12"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: cat.iconBg,
                    border: `1px solid ${cat.iconBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {cat.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                    {cat.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cat.desc}
                  </div>
                </div>
                <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      padding: '2px 7px',
                    }}
                  >
                    {cat.modules.length}
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
