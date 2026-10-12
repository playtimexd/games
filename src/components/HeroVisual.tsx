import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { hueOf, kindLabel, projects, type Project } from '../data/projects'
import { asset, projectHref } from '../lib/route'
import type { FlowItem } from '../lib/flow'
import type { FlowHandle } from './CoverFlow'
import { Cover } from './Cover'

// three.js is large, so it loads after first paint. The static cover holds the space meanwhile.
const CoverFlow = lazy(() => import('./CoverFlow').then((m) => ({ default: m.CoverFlow })))

export const toFlowItem = (p: Project, src?: string): FlowItem => ({
  id: src ?? p.slug,
  title: p.title,
  src: (src ?? p.cover) ? asset((src ?? p.cover)!) : undefined,
  hue: hueOf(p),
})

/** The hero: every project as a 3D cover you can drag, hover and open. */
export function HeroVisual() {
  const list = useMemo(() => projects.slice(0, 10), [])
  const items = useMemo(() => list.map((p) => toFlowItem(p)), [list])
  const [index, setIndex] = useState(0)
  const [webgl, setWebgl] = useState(true)
  const flow = useRef<FlowHandle>(null)
  const current = list[index] ?? list[0]
  if (!current) return null

  const open = () => {
    window.location.hash = projectHref(current.slug)
  }

  return (
    <div>
      <div className="edge-fade relative aspect-[4/3] w-full sm:aspect-[16/10]">
        {webgl ? (
          <Suspense
            fallback={
              <div className="absolute inset-[8%] overflow-hidden rounded-2xl">
                <Cover project={list[0]} priority />
              </div>
            }
          >
            <CoverFlow
              ref={flow}
              items={items}
              label="Projects, drag or use arrow keys to browse"
              className="size-full outline-offset-[-4px]"
              onChange={setIndex}
              onOpen={(it) => {
                window.location.hash = projectHref(it.id)
              }}
              onUnavailable={() => setWebgl(false)}
            />
          </Suspense>
        ) : (
          <a href={projectHref(current.slug)} className="absolute inset-[8%] block overflow-hidden rounded-2xl">
            <Cover project={current} priority />
          </a>
        )}
      </div>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <a
            href={projectHref(current.slug)}
            onClick={(e) => {
              e.preventDefault()
              open()
            }}
            className="group inline-flex items-center gap-1.5 text-lg font-semibold tracking-tight"
          >
            {current.title}
            <ArrowUpRight
              size={18}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </a>
          <p className="mt-1 max-w-[52ch] text-sm text-muted">
            {kindLabel[current.kind]} from {current.year}. {current.tagline}
          </p>
        </div>
        {list.length > 1 && webgl && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label="Previous project"
              onClick={() => flow.current?.prev()}
              className="grid size-10 place-items-center rounded-full border border-line text-muted transition hover:text-fg active:scale-[0.96]"
            >
              <CaretLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next project"
              onClick={() => flow.current?.next()}
              className="grid size-10 place-items-center rounded-full border border-line text-muted transition hover:text-fg active:scale-[0.96]"
            >
              <CaretRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
