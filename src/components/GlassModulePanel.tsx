'use client'
import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Lock, LockOpen } from 'lucide-react'
import MazeModule from '@/components/modules/MazeModule'
import BubbleSplashModule from '@/components/modules/BubbleSplashModule'
import TalkingCalculatorModule from '@/components/modules/TalkingCalculatorModule'
import MemoryMatchModule from '@/components/modules/MemoryMatchModule'
import DigitalSandTray from '@/components/modules/sld/DigitalSandTray'
import WordBuilding from '@/components/modules/sld/WordBuilding'
import WhackAMoleMath from '@/components/modules/sld/WhackAMoleMath'
import PixelArtCoding from '@/components/modules/sld/PixelArtCoding'
import BubbleSplash from '@/components/modules/sld/BubbleSplash'
import NBackChallenge from '@/components/modules/adhd/NBackChallenge'
import VirtualMaze from '@/components/modules/adhd/VirtualMaze'
import GroundingGame from '@/components/modules/anxiety/GroundingGame'
import EmotionalCharades from '@/components/modules/anxiety/EmotionalCharades'
import BoxPopping from '@/components/modules/anxiety/BoxPopping'
import WorryBox from '@/components/modules/anxiety/WorryBox'
import DragDropSorting from '@/components/modules/id/DragDropSorting'
import SocialStorySequencing from '@/components/modules/id/SocialStorySequencing'
import VirtualShop from '@/components/modules/id/VirtualShop'
import SimonSays from '@/components/modules/adhd/SimonSays'

const MODULES = [
  { id: 'maze', name: 'Maze', icon: '🌀', label: 'Maze' },
  { id: 'bubble_splash', name: 'Bubble Splash', icon: '🫧', label: 'Bubbles' },
  { id: 'talking_calculator', name: 'Calculator', icon: '🔢', label: 'Calc' },
  { id: 'memory_match', name: 'Memory Match', icon: '🧩', label: 'Memory' },
  { id: 'digital-sand-tray', name: 'Digital Sand Tray', icon: '🏖️', label: 'Sand Tray' },
  { id: 'word-building', name: 'Word Building', icon: '🔤', label: 'Word' },
  { id: 'whack-a-mole-math', name: 'Whack-a-Mole Math', icon: '🔨', label: 'Math' },
  { id: 'pixel-art-coding', name: 'Pixel Art Coding', icon: '🎨', label: 'Pixel Art' },
  { id: 'bubble-splash-sld', name: 'Reading Bubbles', icon: '🫧', label: 'Reading' },
  { id: 'n-back-challenge', name: 'N-Back Challenge', icon: '🧠', label: 'N-Back' },
  { id: 'grounding-game', name: 'Grounding Game', icon: '🌱', label: 'Grounding' },
  { id: 'emotional-charades', name: 'Emotional Charades', icon: '🎭', label: 'Charades' },
  { id: 'virtual-box-popping', name: 'Virtual Box Popping', icon: '📦', label: 'Box Pop' },
  { id: 'worry-box', name: 'Worry Box', icon: '🗃️', label: 'Worry Box' },
  { id: 'drag-drop-sorting', name: 'Drag & Drop Sorting', icon: '🗂️', label: 'Sorting' },
  { id: 'social-story-sequencing', name: 'Social Story Sequencing', icon: '📖', label: 'Stories' },
  { id: 'virtual-shop', name: 'Virtual Shop', icon: '🛒', label: 'Shop' },
  { id: 'simon-says', name: 'Simon Says', icon: '🎮', label: 'Simon' },
]

const MODULE_INFO: Record<string, { title: string; subtitle: string }> = {
  maze: { title: 'Virtual Maze', subtitle: 'Sustained attention · motor planning' },
  bubble_splash: { title: 'Bubble Splash', subtitle: 'Pop & interact' },
  talking_calculator: { title: 'Calculator', subtitle: 'Talk through it' },
  memory_match: { title: 'Memory Match', subtitle: 'Match & recall' },
  'digital-sand-tray': { title: 'Digital Sand Tray', subtitle: 'Non-verbal expression' },
  'word-building': { title: 'Word Building', subtitle: 'Phonics · spelling · decoding' },
  'whack-a-mole-math': { title: 'Whack-a-Mole Math', subtitle: 'Math fluency · number recognition' },
  'pixel-art-coding': { title: 'Pixel Art Coding', subtitle: 'Pattern recognition · sequencing' },
  'bubble-splash-sld': { title: 'Reading Bubbles', subtitle: 'Reading fluency · sight words' },
  'n-back-challenge': { title: 'N-Back Challenge', subtitle: 'Working memory · clinically validated' },
  'grounding-game': { title: 'Grounding Game', subtitle: 'Sensory anchoring · anxiety reduction' },
  '5-4-3-2-1-grounding': { title: 'Grounding Game', subtitle: 'Sensory anchoring · anxiety reduction' },
  'emotional-charades': { title: 'Emotional Charades', subtitle: 'Emotion identification · social learning' },
  'virtual-box-popping': { title: 'Virtual Box Popping', subtitle: 'Tension release · cognitive defusion' },
  'worry-box': { title: 'Worry Box', subtitle: 'Worry containment · externalisation' },
  'drag-drop-sorting': { title: 'Drag & Drop Sorting', subtitle: 'Categorisation · concept formation' },
  'social-story-sequencing': { title: 'Social Story Sequencing', subtitle: 'Narrative comprehension · social prep' },
  'virtual-shop': { title: 'Virtual Shop', subtitle: 'Money skills · daily living' },
  'simon-says': { title: 'Simon Says', subtitle: 'Executive function · inhibitory control' },
}

interface GlassModulePanelProps {
  sessionId: string
  activeModule: string | null
  isTherapist: boolean
  isLocked: boolean
  onModuleSwitch: (moduleId: string) => void
  onLockToggle: () => void
  onClose?: () => void
}

export default function GlassModulePanel({
  sessionId,
  activeModule,
  isTherapist,
  isLocked,
  onModuleSwitch,
  onLockToggle,
  onClose,
}: GlassModulePanelProps) {
  const isActive = activeModule !== null
  const info = activeModule ? MODULE_INFO[activeModule] : null

  const role = isTherapist ? 'therapist' : 'client'

  const renderModule = () => {
    switch (activeModule) {
      case 'maze':
        return <VirtualMaze sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'bubble_splash':
        return <BubbleSplashModule sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'talking_calculator':
        return <TalkingCalculatorModule sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'memory_match':
        return <MemoryMatchModule sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'digital-sand-tray':
        return <DigitalSandTray sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'word-building':
        return <WordBuilding sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'whack-a-mole-math':
        return <WhackAMoleMath sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'pixel-art-coding':
        return <PixelArtCoding sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'bubble-splash-sld':
        return <BubbleSplash sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'n-back-challenge':
        return <NBackChallenge sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'grounding-game':
      case '5-4-3-2-1-grounding':
        return <GroundingGame sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'emotional-charades':
        return <EmotionalCharades sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'virtual-box-popping':
        return <BoxPopping sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'worry-box':
        return <WorryBox sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'drag-drop-sorting':
        return <DragDropSorting sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'social-story-sequencing':
        return <SocialStorySequencing sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'virtual-shop':
        return <VirtualShop sessionId={sessionId} role={role} isLocked={isLocked} />
      case 'simon-says':
        return <SimonSays sessionId={sessionId} role={role} isLocked={isLocked} />
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span style={{ fontSize: 36, marginBottom: 12 }}>🎯</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', marginBottom: 4 }}>
              {info?.title || 'Ready for Activity'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {info?.subtitle || (isTherapist
                ? 'Select a module below to begin'
                : 'Your therapist will choose an activity soon.')}
            </span>
          </div>
        )
    }
  }

  return (
    <div
      style={{
        width: 420,
        height: '100%',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderLeft: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        .gm-canvas::-webkit-scrollbar {
          width: 4px;
        }
        .gm-canvas::-webkit-scrollbar-track {
          background: transparent;
        }
        .gm-canvas::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 4px;
        }
      `}</style>
      {/* Module Header */}
      <div
        style={{
          height: 56,
          padding: '0 16px',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--sage-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
            }}
          >
            {activeModule ? MODULES.find(m => m.id === activeModule)?.icon || '🎯' : '🎯'}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
              {info?.title || 'No activity'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
              {info?.subtitle || 'Waiting for selection'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTherapist && isActive && (
            <button
              onClick={onLockToggle}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: `1px solid ${isLocked ? 'var(--accent)' : 'var(--glass-border)'}`,
                background: isLocked ? 'var(--accent-bg)' : 'transparent',
                color: isLocked ? 'var(--accent)' : 'var(--ink-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
              }}
            >
              {isLocked ? <Lock size={12} /> : <LockOpen size={12} />}
            </button>
          )}
          {isTherapist && isActive && (
            <button
              onClick={onClose}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: '1px solid var(--glass-border)',
                background: 'transparent',
                color: 'var(--ink-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Module Canvas — scrollable if content overflows */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="gm-canvas" style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 10px 10px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
          {renderModule()}
        </div>
        {isLocked && !isTherapist && isActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)',
              backdropFilter: 'blur(2px)',
              zIndex: 40,
              pointerEvents: 'all',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 10,
                background: 'rgba(15,30,26,0.85)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--ink)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <Lock size={13} style={{ color: 'var(--accent)' }} />
              Therapist is controlling
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
