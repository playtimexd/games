import { useEffect, useMemo, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { ArrowDown, ArrowUp, ArrowUpRight } from '@phosphor-icons/react'
import { hueOf, kindLabel, platformOf, projects } from '../data/projects'
import { site } from '../data/site'
import { asset, projectHref } from '../lib/route'
import { use3d, set3d } from '../lib/prefs'
import { sfx } from '../lib/sfx'
import { useGamepad } from '../lib/gamepad'
import type { Arcade as ArcadeHandle, ArcadeItem } from '../lib/arcade'
import { btnPrimary, btnSecondary } from '../lib/ui'
import { Frame } from './Frame'

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <h1 className="font-display text-6xl font-bold uppercase italic leading-[0.92] tracking-tight sm:text-7xl md:text-8xl">
        <span className="block">{site.headline[0]}</span>
        <span className="block pb-1 text-accent">{site.headline[1]}</span>
      </h1>
      <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-fg/80">{site.intro}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={onStart} className={btnPrimary}>
          Start
        </button>
        <a href="#contact" className={btnSecondary}>
          Contact
        </a>
      </div>
    </div>
  )
}

function Chip({ children }: { children: string }) {
  return <li className="cut hud bg-surface-2 px-2.5 py-1 text-[11px] text-muted">{children}</li>
}

function Info({ stop }: { stop: number }) {
  const idx = stop - 1
  if (idx >= projects.length) {
    return (
      <Frame className="glass" >
        <div className="p-6 md:p-7">
          <h2 className="font-display text-4xl font-bold uppercase italic leading-[0.95] tracking-tight md:text-5xl">
            {site.nextGame.title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-fg/80">{site.nextGame.body}</p>
          <a href="#contact" className={`${btnSecondary} mt-6`}>
            Contact
          </a>
        </div>
      </Frame>
    )
  }
  const p = projects[idx]
  const cta = p.kind === 'game' ? 'Play' : 'Open'
  return (
    <Frame className="glass">
      <div className="p-6 md:p-7">
        <ul className="flex flex-wrap gap-2">
          <Chip>{kindLabel[p.kind]}</Chip>
          <Chip>{String(p.year)}</Chip>
          <Chip>{p.status}</Chip>
        </ul>
        <h2 className="mt-4 font-display text-4xl font-bold uppercase italic leading-[0.95] tracking-tight md:text-5xl">
          {p.title}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-fg/80">{p.tagline}</p>
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
          <dt className="text-muted">Built with</dt>
          <dd>{p.stack.slice(0, 3).join(', ')}</dd>
          <dt className="text-muted">Opens as</dt>
          <dd>{platformOf(p)}</dd>
        </dl>
        <a
          href={projectHref(p.slug)}
          onClick={() => sfx.confirm()}
          className={`${btnPrimary} mt-6`}
        >
          {cta}
          <ArrowUpRight size={18} weight="bold" />
        </a>
      </div>
    </Frame>
  )
}

export function Arcade() {
  const mode3d = use3d()
  const scroller = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const api = useRef<ArcadeHandle | null>(null)
  const [stop, setStop] = useState(0)
  const stopRef = useRef(0)
  stopRef.current = stop
  const inView = useInView(scroller, { amount: 0.05 })

  const items = useMemo<ArcadeItem[]>(
    () => [
      ...projects.map((p) => ({
        id: p.slug,
        title: p.title,
        src: p.cover ? asset(p.cover) : undefined,
        hue: hueOf(p),
      })),
      { id: 'next', title: site.nextGame.title, hue: 32, next: true },
    ],
    [],
  )
  const S = items.length + 1

  // engine lifecycle
  useEffect(() => {
    const el = host.current
    if (!mode3d || !el || !scroller.current) return
    let cancelled = false
    let dispose: (() => void) | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 size-full'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)

    import('../lib/arcade').then(({ createArcade }) => {
      if (cancelled) return
      const a = createArcade({
        canvas,
        host: el,
        scroller: scroller.current!,
        items,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        quality: window.innerWidth < 700 ? 'low' : 'high',
        nextScreen: site.nextGame.screen,
        onActive: (s) => {
          setStop(s)
        },
        onFrame: (t) => {
          const d = Math.abs(t - Math.round(t))
          const a = 1 - smooth(0.1, 0.32, d)
          const p = panel.current
          if (p) {
            p.style.opacity = String(a)
            p.style.transform = `translateX(${(1 - a) * -28}px)`
            p.style.pointerEvents = a > 0.5 ? 'auto' : 'none'
          }
        },
        onOpen: (i) => {
          sfx.confirm()
          window.location.hash = projectHref(projects[i].slug)
        },
      })
      if (!a) {
        canvas.remove()
        set3d(false)
        return
      }
      api.current = a
      dispose = () => a.dispose()
    })

    return () => {
      cancelled = true
      dispose?.()
      api.current = null
      canvas.remove()
    }
  }, [mode3d, items])

  // a tick when the active cabinet changes
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    sfx.tick()
  }, [stop])

  const go = (s: number) => api.current?.goTo(Math.min(S - 1, Math.max(0, s)))
  const open = () => {
    const i = stopRef.current - 1
    if (i >= 0 && i < projects.length) {
      sfx.confirm()
      window.location.hash = projectHref(projects[i].slug)
    }
  }

  // keyboard: left/right jump a cabinet, enter opens the active one
  useEffect(() => {
    if (!mode3d || !inView) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && el !== document.body && /^(INPUT|TEXTAREA|SELECT|A|BUTTON)$/.test(el.tagName)) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(stopRef.current + 1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(stopRef.current - 1)
      } else if (e.key === 'Enter') open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode3d, inView])

  const pad = useGamepad(
    {
      left: () => go(stopRef.current - 1),
      right: () => go(stopRef.current + 1),
      a: open,
    },
    mode3d && inView,
  )

  if (!mode3d) {
    return (
      <section id="arcade" className="mx-auto max-w-7xl px-4 pb-8 pt-36 md:px-8">
        <Intro onStart={() => document.getElementById('work')?.scrollIntoView()} />
      </section>
    )
  }

  return (
    <section
      id="arcade"
      ref={scroller}
      className="relative"
      style={{ height: `${S * 100}dvh` }}
      aria-label="Arcade"
    >
      <div ref={host} className="sticky top-0 h-[100dvh] overflow-hidden bg-bg">
        {/* soft edge shading so text stays readable over the street */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_55%,transparent_40%,rgb(5_6_11/0.72)_100%)]" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-bg/70 via-bg/10 to-transparent md:w-3/5" />

        <div className="pointer-events-none absolute inset-0 flex items-end px-4 pb-24 md:items-center md:px-12 md:pb-0">
          <div ref={panel} className="w-full max-w-[34rem]">
            {stop === 0 ? <Intro onStart={() => go(1)} /> : <Info stop={stop} />}
          </div>
        </div>

        {/* stop rail and step buttons */}
        <nav
          aria-label="Cabinets"
          className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2 md:right-6"
        >
          {Array.from({ length: S }, (_, i) => {
            const label = i === 0 ? 'Street' : i - 1 < projects.length ? projects[i - 1].title : site.nextGame.title
            return (
              <button
                key={i}
                type="button"
                aria-label={label}
                aria-current={stop === i}
                onClick={() => go(i)}
                className="group grid h-5 w-7 place-items-center"
              >
                <span
                  className={`block h-[3px] transition-all ${
                    stop === i ? 'w-6 bg-accent' : 'w-3 bg-fg/35 group-hover:w-5 group-hover:bg-fg/70'
                  }`}
                />
              </button>
            )
          })}
        </nav>
        <div className="absolute bottom-6 right-4 flex gap-2 md:right-6">
          <button
            type="button"
            aria-label="Previous cabinet"
            onClick={() => go(stop - 1)}
            disabled={stop === 0}
            className="cut grid size-11 place-items-center bg-surface-2/80 text-fg backdrop-blur transition hover:bg-accent hover:text-accent-ink disabled:opacity-30"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
          <button
            type="button"
            aria-label="Next cabinet"
            onClick={() => go(stop + 1)}
            disabled={stop === S - 1}
            className="cut grid size-11 place-items-center bg-surface-2/80 text-fg backdrop-blur transition hover:bg-accent hover:text-accent-ink disabled:opacity-30"
          >
            <ArrowDown size={18} weight="bold" />
          </button>
        </div>
        <p className="hud pointer-events-none absolute bottom-7 left-4 hidden text-[11px] text-muted md:left-12 md:block">
          {pad ? 'D-pad browse, A open' : 'Arrow keys browse, Enter open'}
        </p>
      </div>
    </section>
  )
}
