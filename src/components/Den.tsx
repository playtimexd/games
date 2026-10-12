import { useEffect, useMemo, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import {
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  GameController,
  GithubLogo,
  Play,
  Storefront,
  ArrowSquareOut,
  Books,
  House,
  type Icon,
} from '@phosphor-icons/react'
import { asset, projectHref } from '../lib/route'
import { hueOf, kindLabel, platformOf, projects, type Project } from '../data/projects'
import { site } from '../data/site'
import { use3d, set3d } from '../lib/prefs'
import { sfx } from '../lib/sfx'
import { useGamepad } from '../lib/gamepad'
import { btnPrimary, btnSecondary } from '../lib/ui'
import { MAX_TARGETS } from '../lib/pinball'
import type { Den as DenHandle, DenItem, Station } from '../lib/den'
import { Frame } from './Frame'

function launchOf(p: Project): { href: string; label: string; icon: Icon } | null {
  const l = p.launch
  if (!l) return null
  if (l.type === 'web') return { href: l.url, label: 'Play', icon: Play }
  if (l.type === 'steam') return { href: `https://store.steampowered.com/app/${l.appId}`, label: 'Store', icon: Storefront }
  if (l.type === 'github') return { href: `https://github.com/${l.repo}`, label: 'Source', icon: GithubLogo }
  return { href: l.url, label: l.label ?? 'Visit', icon: ArrowSquareOut }
}

const TABS: { id: Station; label: string; key: string; icon: Icon }[] = [
  { id: 'room', label: 'Room', key: '1', icon: House },
  { id: 'tv', label: 'Browse', key: '2', icon: Books },
  { id: 'play', label: 'Play', key: '3', icon: GameController },
]

export function Den() {
  const mode3d = use3d()
  const section = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const den = useRef<DenHandle | null>(null)
  const [station, setStation] = useState<Station>('room')
  const [sel, setSel] = useState(-1)
  const [score, setScore] = useState(0)
  const [opening, setOpening] = useState(false)
  const selRef = useRef(sel)
  selRef.current = sel
  const stationRef = useRef(station)
  stationRef.current = station
  const inView = useInView(section, { amount: 0.4 })

  const items = useMemo<DenItem[]>(
    () => [
      ...projects.map((p) => ({
        id: p.slug,
        title: p.title,
        tagline: p.tagline,
        src: p.cover ? asset(p.cover) : undefined,
        hue: hueOf(p),
      })),
      { id: 'next', title: site.nextGame.title, tagline: site.nextGame.body, hue: 24, next: true },
    ],
    [],
  )
  const N = items.length
  const current = sel >= 0 && sel < projects.length ? projects[sel] : null
  const isNext = sel === N - 1
  const launch = current ? launchOf(current) : null

  const go = (s: Station) => {
    // a focused tab button would otherwise swallow Space as a click
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    releaseAllRef.current()
    setStation(s)
    den.current?.setStation(s)
  }
  const releaseAllRef = useRef(() => {})
  const pickIndex = (i: number) => {
    const n = ((i % N) + N) % N
    setSel(n)
    den.current?.select(n)
    sfx.tick()
  }
  const open = () => {
    const i = selRef.current
    if (i < 0 || i >= projects.length) return
    setOpening(true)
    den.current?.insert(i)
  }

  // engine lifecycle
  useEffect(() => {
    const el = host.current
    if (!mode3d || !el) return
    let cancelled = false
    let dispose: (() => void) | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 size-full'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)

    import('../lib/den').then(({ createDen }) => {
      if (cancelled) return
      const d = createDen({
        canvas,
        host: el,
        items,
        siteName: site.name,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        quality: window.innerWidth < 760 ? 'low' : 'high',
        onStation: (s) => setStation(s),
        onSelect: (i) => setSel(i),
        onOpen: (i) => {
          window.location.hash = projectHref(projects[i].slug)
        },
        onScore: (n) => setScore(n),
      })
      if (!d) {
        canvas.remove()
        set3d(false)
        return
      }
      den.current = d
      dispose = () => d.dispose()
    })

    return () => {
      cancelled = true
      dispose?.()
      den.current = null
      canvas.remove()
    }
  }, [mode3d, items])

  // keyboard
  const flipKeys: Record<string, 'left' | 'right'> = {
    z: 'left',
    arrowleft: 'left',
    '/': 'right',
    m: 'right',
    arrowright: 'right',
  }
  const releaseAll = () => {
    den.current?.flipper('left', false)
    den.current?.flipper('right', false)
    den.current?.plunger(false)
  }
  releaseAllRef.current = releaseAll

  // Releases are always listened for, even if the page has scrolled the table out of view,
  // otherwise a held plunger or flipper could get stuck.
  useEffect(() => {
    if (!mode3d) return
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (flipKeys[k]) den.current?.flipper(flipKeys[k], false)
      else if (k === ' ') den.current?.plunger(false)
    }
    window.addEventListener('keyup', up)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', releaseAll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode3d])

  useEffect(() => {
    if (!mode3d || !inView) return
    const typing = () => {
      const el = document.activeElement
      return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
    }
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing()) return
      const k = e.key.toLowerCase()
      const st = stationRef.current
      if (st === 'play' && (k === ' ' || flipKeys[k])) {
        // always swallow these, including key repeats, so holding Space never scrolls the page
        e.preventDefault()
        if (e.repeat) return
        if (k === ' ') den.current?.plunger(true)
        else den.current?.flipper(flipKeys[k], true)
        return
      }
      if (k === '1') go('room')
      else if (k === '2') go('tv')
      else if (k === '3') go('play')
      else if (k === 'escape') go('room')
      else if (st === 'tv') {
        if (k === 'arrowleft') {
          e.preventDefault()
          pickIndex(selRef.current < 0 ? N - 1 : selRef.current - 1)
        } else if (k === 'arrowright') {
          e.preventDefault()
          pickIndex(selRef.current < 0 ? 0 : selRef.current + 1)
        } else if (k === 'enter') open()
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode3d, inView])

  const pad = useGamepad(
    {
      left: () => (stationRef.current === 'tv' ? pickIndex(selRef.current < 0 ? N - 1 : selRef.current - 1) : undefined),
      right: () => (stationRef.current === 'tv' ? pickIndex(selRef.current < 0 ? 0 : selRef.current + 1) : undefined),
      a: () => (stationRef.current === 'play' ? den.current?.plunger(false) : open()),
      b: () => go('room'),
    },
    mode3d && inView,
  )

  const hold = (side: 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault()
      den.current?.flipper(side, true)
    },
    onPointerUp: () => den.current?.flipper(side, false),
    onPointerLeave: () => den.current?.flipper(side, false),
    onPointerCancel: () => den.current?.flipper(side, false),
  })

  const chip =
    'cut hud inline-flex h-11 items-center gap-2 px-4 text-xs transition active:scale-[0.97]'

  if (!mode3d) {
    return (
      <section id="den" className="mx-auto max-w-7xl px-4 pb-8 pt-36 md:px-8">
        <h1 className="font-display text-6xl font-bold uppercase leading-[0.92] tracking-tight sm:text-7xl md:text-8xl">
          <span className="block">{site.headline[0]}</span>
          <span className="block text-accent">{site.headline[1]}</span>
        </h1>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-fg/80">{site.intro}</p>
      </section>
    )
  }

  return (
    <section
      id="den"
      ref={section}
      aria-label="Game room"
      className="relative h-[100dvh] min-h-[640px] overflow-hidden bg-bg"
    >
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-bg/90 to-transparent" />
      {station === 'room' && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-bg/70 via-bg/20 to-transparent md:w-1/2" />
      )}

      {/* room: headline */}
      {station === 'room' && (
        <div className="pointer-events-none absolute left-4 top-24 max-w-[34rem] md:left-12 md:top-1/3 md:-translate-y-1/2">
          <h1 className="font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight sm:text-6xl md:text-7xl">
            <span className="block">{site.headline[0]}</span>
            <span className="block text-accent">{site.headline[1]}</span>
          </h1>
          <p className="mt-5 max-w-[40ch] text-base leading-relaxed text-fg/80 md:text-lg">{site.intro}</p>
        </div>
      )}

      {/* play: score and hints */}
      {station === 'play' && (
        <div className="pointer-events-none absolute left-4 top-20 md:left-8">
          <p className="hud text-[11px] text-muted">Score</p>
          <p className="font-display text-4xl font-bold tabular-nums text-accent">
            {String(score).padStart(6, '0')}
          </p>
          <p className="hud mt-3 hidden text-[11px] text-muted md:block">
            Hold Space to charge and release to launch. Z and / flip.
          </p>
          {projects.length > MAX_TARGETS && (
            <p className="hud mt-1 hidden text-[11px] text-muted md:block">
              The table has {MAX_TARGETS} targets. Browse shows the rest.
            </p>
          )}
        </div>
      )}

      {/* selected project card */}
      {sel >= 0 && (station === 'tv' || station === 'play') && (
        <div className="pointer-events-none absolute bottom-24 right-4 w-[min(22rem,calc(100%-2rem))] md:bottom-8 md:right-8">
          <div className="pointer-events-auto">
            <Frame>
              <div className="p-5">
                {current ? (
                  <>
                    <ul className="flex flex-wrap gap-2">
                      {[kindLabel[current.kind], String(current.year), current.status].map((t) => (
                        <li key={t} className="cut hud bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                          {t}
                        </li>
                      ))}
                    </ul>
                    <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-none tracking-tight">
                      {current.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{current.tagline}</p>
                    <p className="hud mt-3 text-[11px] text-muted">Opens as {platformOf(current)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={`${btnPrimary} !h-11 !px-5`} onClick={open} disabled={opening}>
                        Open <ArrowUpRight size={16} weight="bold" />
                      </button>
                      {launch && (
                        <a
                          className={`${btnSecondary} !h-11 !px-5`}
                          href={launch.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <launch.icon size={16} weight="bold" />
                          {launch.label}
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
                      {site.nextGame.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{site.nextGame.body}</p>
                    <a href="#contact" className={`${btnSecondary} mt-4 !h-11 !px-5`}>
                      Contact
                    </a>
                  </>
                )}
              </div>
            </Frame>
          </div>
        </div>
      )}

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-3 px-4">
        {station === 'play' && (
          <div className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3">
            <button type="button" className={`${chip} bg-surface-2 text-fg`} {...hold('left')}>
              Left
            </button>
            <button
              type="button"
              className={`${chip} bg-accent text-accent-ink`}
              onPointerDown={(e) => {
                e.preventDefault()
                den.current?.plunger(true)
              }}
              onPointerUp={() => den.current?.plunger(false)}
              onPointerLeave={() => den.current?.plunger(false)}
            >
              Launch
            </button>
            <button type="button" className={`${chip} bg-surface-2 text-fg`} {...hold('right')}>
              Right
            </button>
          </div>
        )}
        {station === 'room' && (
          <p className="hud pointer-events-none text-[11px] text-muted">
            Click the pinball machine to play, the shelf to browse
          </p>
        )}
        {station === 'tv' && (
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous cartridge"
              className={`${chip} bg-surface-2 text-fg`}
              onClick={() => pickIndex(sel < 0 ? N - 1 : sel - 1)}
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <span className="hud px-2 text-[11px] text-muted">
              {sel >= 0 ? items[sel].title : 'Pick a cartridge'}
            </span>
            <button
              type="button"
              aria-label="Next cartridge"
              className={`${chip} bg-surface-2 text-fg`}
              onClick={() => pickIndex(sel < 0 ? 0 : sel + 1)}
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        )}
        <div className="pointer-events-auto flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={station === t.id}
              onClick={() => go(t.id)}
              className={`${chip} ${
                station === t.id ? 'bg-accent text-accent-ink' : 'bg-surface-2/90 text-fg hover:bg-surface-2'
              }`}
            >
              <t.icon size={16} weight="bold" />
              {t.label}
              <span className="hidden opacity-60 md:inline">{t.key}</span>
            </button>
          ))}
        </div>
        {pad && (
          <p className="hud text-[10px] text-muted">Pad: d-pad browse, A open, B back</p>
        )}
      </div>
    </section>
  )
}
