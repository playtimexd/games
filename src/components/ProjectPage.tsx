import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { kindLabel, platformOf, projects } from '../data/projects'
import { site } from '../data/site'
import { asset, projectHref } from '../lib/route'
import { LaunchPanel } from './LaunchPanel'
import { toFlowItem } from './HeroVisual'

const CoverFlow = lazy(() => import('./CoverFlow').then((m) => ({ default: m.CoverFlow })))

const ease = [0.16, 1, 0.3, 1] as const

function Shots({ slug }: { slug: string }) {
  const p = projects.find((x) => x.slug === slug)!
  const shots = p.shots ?? []
  const items = useMemo(() => shots.map((s) => toFlowItem(p, s)), [slug]) // eslint-disable-line react-hooks/exhaustive-deps
  const [webgl, setWebgl] = useState(true)
  if (shots.length === 0) return null

  // Fallback keeps every screenshot reachable without WebGL.
  const strip = (
    <ul className="flex snap-x gap-4 overflow-x-auto pb-2">
      {shots.map((s) => (
        <li key={s} className="w-[80%] shrink-0 snap-center sm:w-[48%]">
          <img
            src={asset(s)}
            alt={`${p.title} screenshot`}
            loading="lazy"
            className="aspect-video w-full rounded-2xl object-cover ring-1 ring-line"
          />
        </li>
      ))}
    </ul>
  )

  return (
    <section className="mt-24" aria-labelledby="screens">
      <h2 id="screens" className="text-2xl font-semibold tracking-tight md:text-3xl">
        Screens
      </h2>
      <div className="mt-6">
        {shots.length === 1 || !webgl ? (
          strip
        ) : (
          <div className="edge-fade relative aspect-[16/8] w-full">
            <Suspense fallback={null}>
              <CoverFlow
                items={items}
                label={`${p.title} screenshots, drag or use arrow keys to browse`}
                className="size-full outline-offset-[-4px]"
                onUnavailable={() => setWebgl(false)}
              />
            </Suspense>
          </div>
        )}
      </div>
    </section>
  )
}

export function ProjectPage({ slug }: { slug: string }) {
  const idx = projects.findIndex((p) => p.slug === slug)
  const p = projects[idx]

  useEffect(() => {
    document.title = p ? `${p.title} | ${site.name}` : `Not found | ${site.name}`
    return () => {
      document.title = site.name
    }
  }, [p])

  if (!p) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-32 md:px-8">
        <h1 className="text-4xl font-semibold tracking-tighter">Project not found</h1>
        <a href="#work" className="mt-6 inline-flex items-center gap-2 text-accent-text">
          <ArrowLeft size={18} /> Back to all work
        </a>
      </main>
    )
  }

  const next = projects[(idx + 1) % projects.length]
  const meta: [string, string][] = [
    ['Type', kindLabel[p.kind]],
    ['Year', String(p.year)],
    ['Status', p.status],
    ['Role', p.role],
    ['Opens as', platformOf(p)],
  ]

  return (
    <motion.main
      key={p.slug}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease }}
      className="mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-8"
    >
      <a
        href="#work"
        className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={16} /> All work
      </a>

      <header className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <h1 className="text-5xl font-semibold leading-[0.98] tracking-tighter md:text-7xl">
            {p.title}
          </h1>
          <p className="mt-5 max-w-[46ch] text-xl leading-relaxed text-muted">{p.tagline}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 self-end lg:col-span-4">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-12">
        <LaunchPanel p={p} />
      </div>

      <div className="mt-20 grid gap-14 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          {p.summary.map((para) => (
            <p key={para} className="max-w-[62ch] text-lg leading-relaxed">
              {para}
            </p>
          ))}
        </div>
        <div className="space-y-10 lg:col-span-4 lg:col-start-9">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">What I did</h2>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
              {p.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Built with</h2>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {p.stack.map((s) => (
                <li key={s} className="rounded-full border border-line px-3 py-1 text-muted">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <Shots slug={p.slug} />

      {next.slug !== p.slug && (
        <a
          href={projectHref(next.slug)}
          className="group mt-24 flex items-center justify-between gap-6 border-t border-line pt-8"
        >
          <span>
            <span className="block text-sm text-muted">Next project</span>
            <span className="mt-1 block text-3xl font-semibold tracking-tighter md:text-5xl">
              {next.title}
            </span>
          </span>
          <ArrowRight
            weight="bold"
            className="size-8 shrink-0 text-accent-text transition-transform group-hover:translate-x-1"
          />
        </a>
      )}
    </motion.main>
  )
}
