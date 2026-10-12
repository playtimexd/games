import { hueOf, projects, type Kind } from '../data/projects'
import { asset } from './route'

/**
 * Where each project stands on the campaign map. Pure data in, positions out, so the
 * 3D world and the minimap always agree.
 *
 *  - x is time: oldest project on the left, one step per project
 *  - z is the lane: one lane per kind that actually exists
 *  - the last spot is always "next", sitting at the edge of unexplored territory
 */

export interface Spot {
  /** project slug, or "next" */
  id: string
  title: string
  src?: string
  hue: number
  kind: Kind | 'next'
  x: number
  z: number
}

export interface MapLayout {
  spots: Spot[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export const STEP = 6.6
const KIND_ORDER: Kind[] = ['game', 'app', 'tool', 'agent']

const jitter = (i: number) => {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453
  return (s - Math.floor(s) - 0.5) * 1.6
}

export function buildLayout(nextTitle: string): MapLayout {
  const ordered = [...projects].sort((a, b) => a.year - b.year)
  const present = KIND_ORDER.filter((k) => ordered.some((p) => p.kind === k))
  const lanes = Math.max(present.length, 1)

  const spots: Spot[] = ordered.map((p, i) => ({
    id: p.slug,
    title: p.title,
    src: p.cover ? asset(p.cover) : undefined,
    hue: hueOf(p),
    kind: p.kind,
    x: i * STEP,
    // consecutive bases weave left and right, so none hides another along the camera's sightline
    z: (present.indexOf(p.kind) - (lanes - 1) / 2) * 5 + (i % 2 === 0 ? -3.4 : 3.4) + jitter(i) * 0.5,
  }))
  spots.push({
    id: 'next',
    title: nextTitle,
    hue: 200,
    kind: 'next',
    x: ordered.length * STEP,
    z: 0,
  })

  const pad = 15
  const zs = spots.map((s) => s.z)
  return {
    spots,
    bounds: {
      minX: spots[0].x - 64,
      maxX: spots[spots.length - 1].x + 64,
      minZ: Math.min(...zs) - 24,
      maxZ: Math.max(...zs) + 24,
    },
  }
}
