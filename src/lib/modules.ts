// Canonical registry of the in-session therapy modules.
// Single source of truth for: the in-session module selector, per-therapist
// access control, and the admin access UI. Module ids here MUST match the ids
// that GlassModulePanel switches on / ModuleSelectorPanel launches.

export interface ModuleItem {
  id: string
  name: string
  emoji: string
  desc: string
}

export interface ModuleCategory {
  id: string
  name: string
  desc: string
  emoji: string
  iconBg: string
  iconBorder: string
  modules: ModuleItem[]
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
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
  {
    id: 'general',
    name: 'General',
    desc: 'General therapy & emotional regulation',
    emoji: '🧘',
    iconBg: 'rgba(100,100,100,0.22)',
    iconBorder: 'rgba(100,100,100,0.3)',
    modules: [
      { id: 'emotion-wheel', name: 'Emotion Wheel', emoji: '🎡', desc: 'Emotion identification · granular awareness' },
      { id: 'safe-space-builder', name: 'Safe Space Builder', emoji: '🏠', desc: 'Grounding · personalized calm environment' },
      { id: 'defusion-river', name: 'Defusion River', emoji: '🌊', desc: 'Cognitive defusion · thought observation' },
      { id: 'thought-challenger', name: 'Thought Challenger', emoji: '⚖️', desc: 'CBT · evidence-based thought restructuring' },
      { id: 'micro-quest-board', name: 'Micro Quest Board', emoji: '🗺️', desc: 'Behavioral activation · micro-goals' },
      { id: 'values-card-sort', name: 'Values Card Sort', emoji: '🃏', desc: 'ACT · values clarification & commitment' },
      { id: 'urge-surfing', name: 'Urge Surfing', emoji: '🏄', desc: 'DBT · urge tolerance · mindfulness' },
      { id: 'worry-vault', name: 'Worry Vault', emoji: '🗄️', desc: 'Worry containment · scheduled worry time' },
      { id: 'facts-vs-feelings', name: 'Facts vs Feelings', emoji: '🔍', desc: 'Reality testing · emotion-fact distinction' },
    ],
  },
]

export const ALL_MODULES: ModuleItem[] = MODULE_CATEGORIES.flatMap((c) => c.modules)
export const ALL_MODULE_IDS: string[] = ALL_MODULES.map((m) => m.id)

const MODULE_NAME_BY_ID: Record<string, string> = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, m.name])
)
export const moduleName = (id: string): string => MODULE_NAME_BY_ID[id] ?? id

// Resolve a therapist's effective allowed module ids.
// `allModulesAllowed` true (default) means unrestricted -> every module.
export function resolveAllowedModuleIds(therapist: {
  allModulesAllowed?: boolean
  moduleAccess?: string[]
} | null | undefined): string[] {
  if (!therapist) return ALL_MODULE_IDS
  if (therapist.allModulesAllowed !== false) return ALL_MODULE_IDS
  return therapist.moduleAccess ?? []
}
