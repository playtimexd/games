import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { kindLabel, platformOf, projects, type Kind, type Project } from '../data/projects'
import { projectHref } from '../lib/route'
import { Cover } from './Cover'
import { Frame } from './Frame'

function Card({ p, index }: { p: Project; index: number }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: (index % 3) * 0.06 }}
      className="lg:[&:nth-child(3n+2)]:mt-12"
    >
      <a
        href={projectHref(p.slug)}
        className="group block"
      >
        <Frame className="aspect-[16/10]" inner="crt relative">
          <Cover
            project={p}
            className="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />
        </Frame>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-2xl font-bold uppercase leading-none tracking-tight">
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.tagline}</p>
          </div>
          <ArrowUpRight
            size={22}
            weight="bold"
            className="mt-0.5 shrink-0 text-muted transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent"
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {[kindLabel[p.kind], platformOf(p), String(p.year)].map((t) => (
            <li key={t} className="cut hud bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
              {t}
            </li>
          ))}
        </ul>
      </a>
    </motion.li>
  )
}

export function Work() {
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  // Filters come from the data, so a new kind of project adds its own chip.
  const kinds = useMemo(() => [...new Set(projects.map((p) => p.kind))], [])
  const shown = filter === 'all' ? projects : projects.filter((p) => p.kind === filter)
  const count = (k: Kind) => projects.filter((p) => p.kind === k).length

  return (
    <section id="work" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-24 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 className="font-display text-5xl font-bold uppercase leading-none tracking-tight md:text-7xl">
          All games
        </h2>
        {kinds.length > 1 && (
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
            {(['all', ...kinds] as const).map((k) => {
              const on = filter === k
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(k)}
                  className={`cut hud h-10 px-4 text-xs transition active:scale-[0.97] ${
                    on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted hover:text-fg'
                  }`}
                >
                  {k === 'all' ? `All ${projects.length}` : `${kindLabel[k]} ${count(k)}`}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="mt-16 max-w-[50ch] text-muted">
          No projects yet. Add one to src/data/projects.ts and it appears here and on the street.
        </p>
      ) : (
        <ul className="mt-14 grid gap-x-8 gap-y-14 pb-12 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {shown.map((p, i) => (
              <Card key={p.slug} p={p} index={i} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
