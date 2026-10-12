import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check } from '@phosphor-icons/react'
import { kindLabel, platformOf, projects } from '../data/projects'
import { site } from '../data/site'
import { asset, projectHref } from '../lib/route'
import { toFlowItem } from '../lib/items'
import { btnSecondary } from '../lib/ui'
import { Cover } from './Cover'
import { Frame } from './Frame'
import { LaunchPanel } from './LaunchPanel'

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
          <Frame className="aspect-video" inner="crt relative">
            <img src={asset(s)} alt={`${p.title} screenshot`} loading="lazy" className="size-full object-cover" />
          </Frame>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="mt-24" aria-labelledby="screens">
      <h2
        id="screens"
        className="font-display text-3xl font-bold uppercase tracking-tight md:text-4xl"
      >
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
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-36 md:px-8">
        <h1 className="font-display text-5xl font-bold uppercase tracking-tight">
          Project not found
        </h1>
        <a href="#work" className={`${btnSecondary} mt-8`}>
          <ArrowLeft size={18} weight="bold" /> All games
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
      className="relative"
    >
      {/* the project's art, blurred, as the room it lives in */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden">
        <div className="size-full scale-110 opacity-40 blur-3xl">
          <Cover project={p} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-28 md:px-8">
        <a
          href="#work"
          className="hud inline-flex items-center gap-2 text-xs text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} weight="bold" /> All games
        </a>

        <header className="mt-8 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight md:text-7xl">
              {p.title}
            </h1>
            <p className="mt-5 max-w-[46ch] text-xl leading-relaxed text-fg/80">{p.tagline}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 self-end lg:col-span-4">
            {meta.map(([k, v]) => (
              <div key={k}>
                <dt className="hud text-[11px] text-muted">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
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
              <p key={para} className="max-w-[62ch] text-lg leading-relaxed text-fg/90">
                {para}
              </p>
            ))}
          </div>
          <div className="space-y-10 lg:col-span-4 lg:col-start-9">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-tight">
                What I did
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-3">
                    <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-accent" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-tight">
                Built with
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {p.stack.map((s) => (
                  <li key={s} className="cut hud bg-surface-2 px-3 py-1.5 text-[11px] text-muted">
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
            className="group mt-24 block"
          >
            <Frame>
              <div className="flex items-center justify-between gap-6 p-6 md:p-8">
                <span>
                  <span className="hud block text-[11px] text-muted">Next game</span>
                  <span className="mt-2 block font-display text-3xl font-bold uppercase tracking-tight md:text-5xl">
                    {next.title}
                  </span>
                </span>
                <ArrowRight
                  weight="bold"
                  className="size-8 shrink-0 text-accent transition-transform group-hover:translate-x-1"
                />
              </div>
            </Frame>
          </a>
        )}
      </div>
    </motion.main>
  )
}
