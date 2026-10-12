// One entry per project. Add a new object and it shows up everywhere:
// the home grid, the filters, the 3D hero and its own project page.
// No layout depends on how many projects there are.

export type Kind = 'game' | 'app' | 'tool' | 'agent'

/** How a visitor opens the project. Leave `launch` out until a link exists. */
export type Launch =
  /** A web game or app. `embed: true` lets visitors play inside the project page. */
  | { type: 'web'; url: string; embed?: boolean }
  /** A Steam store page. The page shows Steam's own widget. */
  | { type: 'steam'; appId: number }
  /** A GitHub repo as "owner/name". The page shows a live repo card. */
  | { type: 'github'; repo: string }
  /** Anything else: itch.io, App Store, a third-party site. */
  | { type: 'link'; url: string; label?: string }

export interface Project {
  slug: string
  title: string
  tagline: string
  kind: Kind
  year: number
  status: string
  role: string
  /** Short paragraphs shown on the project page. */
  summary: string[]
  /** What you personally did. */
  highlights: string[]
  stack: string[]
  /** Path under /public, e.g. "covers/my-game.webp". Omit to use a generated cover. */
  cover?: string
  /** Extra screenshots. Two or more switch the project page to the 3D gallery. */
  shots?: string[]
  /** 0-360. Tints the generated cover. Defaults to a hash of the slug. */
  hue?: number
  featured?: boolean
  launch?: Launch
}

const entries: Project[] = [
  {
    slug: 'echo-bastion',
    title: 'Echo Bastion',
    tagline: 'Time-loop tower defence where your past selves are your towers.',
    kind: 'game',
    year: 2026,
    status: 'In development',
    role: 'Producer',
    summary: [
      'Each loop you defend the Heartspire, then rewind. Your recorded runs replay as Echoes and keep fighting beside the next you.',
      'The simulation is deterministic, so every Echo repeats exactly what you did, and a loop can be replayed or tuned by changing one input.',
    ],
    highlights: [
      'Scoped the loop structure and the eight-loop campaign arc',
      'Set up the Meshy and Blender asset pipeline and the audio pass',
      'Ran the verification process: scripted playtests and canvas inspection',
    ],
    stack: ['TypeScript', 'Three.js', 'Vite', 'Electron'],
    cover: 'covers/echo-bastion.webp',
    shots: ['covers/echo-bastion-1.webp', 'covers/echo-bastion-2.webp'],
    featured: true,
  },
  {
    slug: 'night-harvest',
    title: 'Night Harvest',
    tagline: 'Scavenge a village house by flashlight before something finds you.',
    kind: 'game',
    year: 2026,
    status: 'In development',
    role: 'Producer',
    summary: [
      'A top-down horror run. You load a van with whatever is worth taking, and the dark decides how long you get.',
      'Fog of war hides rooms you have not entered, and a director system escalates the unease as the night goes on.',
    ],
    highlights: [
      'Rebuilt the prototype into a production project with an English-language pass',
      'Directed the Blender prop kit and Meshy rigged characters',
      'Defined the horror pacing rules and the balance bots',
    ],
    stack: ['TypeScript', 'Three.js', 'Blender', 'Meshy'],
    cover: 'covers/night-harvest.webp',
    shots: ['covers/night-harvest-1.webp', 'covers/night-harvest-2.webp'],
  },
  {
    slug: 'void-breach',
    title: 'VOID//BREACH',
    tagline: 'Third-person action roguelite that runs in the browser.',
    kind: 'game',
    year: 2026,
    status: 'Prototype',
    role: 'Producer',
    summary: [
      'Fast third-person combat built from procedural rigs with no imported art, so the whole game loads in seconds.',
    ],
    highlights: [
      'Defined the combat feel and the character rig conventions',
      'Kept the project fully typed and physics-driven with Rapier',
    ],
    stack: ['TypeScript', 'Three.js', 'Rapier', 'Vite'],
  },
]

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
export const hueOf = (p: Project) => p.hue ?? hash(p.slug) % 360

/** Featured first, then newest, then A to Z. */
export const projects: Project[] = [...entries].sort(
  (a, b) =>
    Number(!!b.featured) - Number(!!a.featured) ||
    b.year - a.year ||
    a.title.localeCompare(b.title),
)

export const kindLabel: Record<Kind, string> = {
  game: 'Game',
  app: 'App',
  tool: 'Tool',
  agent: 'Agent',
}

export const platformOf = (p: Project) =>
  p.launch
    ? { web: 'Web', steam: 'Steam', github: 'GitHub', link: 'Link' }[p.launch.type]
    : 'Soon'
