import { hueOf, type Project } from '../data/projects'
import type { FlowItem } from './flow'
import { asset } from './route'

/** Adapts a project (or one of its shots) into what the WebGL scenes consume. */
export const toFlowItem = (p: Project, src?: string): FlowItem => {
  const path = src ?? p.cover
  return {
    id: src ?? p.slug,
    title: p.title,
    src: path ? asset(path) : undefined,
    hue: hueOf(p),
  }
}
