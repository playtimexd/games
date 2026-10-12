import { useEffect, useMemo, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import {
  ArrowSquareOut,
  ArrowsOutCardinal,
  CaretLeft,
  CaretRight,
  GithubLogo,
  Hexagon,
  Minus,
  Play,
  Plus,
  Storefront,
  ArrowUpRight,
  type Icon,
} from '@phosphor-icons/react'
import { kindLabel, platformOf, projects, type Project } from '../data/projects'
import { site } from '../data/site'
import { buildLayout } from '../lib/layout'
import { projectHref } from '../lib/route'
import { use3d, set3d } from '../lib/prefs'
import { sfx } from '../lib/sfx'
import { useGamepad } from '../lib/gamepad'
import type { World } from '../lib/world'
import { Cover } from './Cover'
import { Frame } from './Frame'
import { Minimap } from './Minimap'

function launchOf(p: Project): { href: string; label: string; icon: Icon } | null {
  const l = p.launch
  if (!l) return null
  if (l.type === 'web') return { href: l.url, label: 'Play', icon: Play }
  if (l.type === 'steam') return { href: `https://store.steampowered.com/app/${l.appId}`, label: 'Store', icon: Storefront }
  if (l.type === 'github') return { href: `https://github.com/${l.repo}`, label: 'Source', icon: GithubLogo }
  return { href: l.url, label: l.label ?? 'Visit', icon: ArrowSquareOut }
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="hud grid size-5 place-items-center border border-line bg-bg/60 text-[10px] text-muted">
      {children}
    </kbd>
  )
}

export function Command() {
  const mode3d = use3d()
  const layout = useMemo(() => buildLayout(site.nextGame.title), [])
  const { spots } = layout
  const section = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const world = useRef<World | null>(null)
  const [sel, setSel] = useState(-1)
  const selRef = useRef(sel)
  selRef.current = sel
  const inView = useInView(section, { amount: 0.4 })

  const projectOf = (i: number): Project | null =>
    i >= 0 && spots[i] && spots[i].kind !== 'next' ? (projects.find((p) => p.slug === spots[i].id) ?? null) : null

  const select = (i: number) => {
    const n = spots.length
    const next = i < 0 ? -1 : ((i % n) + n) % n
    setSel(next)
    world.current?.select(next)
  }
  const openAt = (i: number) => {
    const p = projectOf(i)
    if (!p) return
    sfx.confirm()
    window.location.hash = projectHref(p.slug)
  }

  // engine lifecycle
  useEffect(() => {
    const el = host.current
    if (!mode3d || !el) return
    let cancelled = false
    let dispose: (() => void) | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 size-full touch-pan-y'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)

    import('../lib/world').then(({ createWorld }) => {
      if (cancelled) return
      const w = createWorld({
        canvas,
        host: el,
        layout,
        selected: selRef.current,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        quality: window.innerWidth < 700 ? 'low' : 'high',
        onSelect: (i) => setSel(i),
        onOpen: (i) => openAt(i),
        onHover: (i) => {
          if (i >= 0) sfx.tick()
        },
      })
      if (!w) {
        canvas.remove()
        set3d(false)
        return
      }
      world.current = w
      dispose = () => w.dispose()
    })

    return () => {
      cancelled = true
      dispose?.()
      world.current = null
      canvas.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode3d, layout])

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    sfx.tick()
  }, [sel])

  const current = projectOf(sel)
  const launch = current ? launchOf(current) : null

  // hotkeys, active while the map is on screen
  useEffect(() => {
    if (!inView) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const k = e.key.toLowerCase()
      const s = selRef.current
      if (k === 'arrowleft' || k === 'a') {
        e.preventDefault()
        select(s < 0 ? spots.length - 1 : s - 1)
      } else if (k === 'arrowright' || k === 's') {
        e.preventDefault()
        select(s < 0 ? 0 : s + 1)
      } else if (k === 'q' || (k === 'enter' && !(el && /^(A|BUTTON)$/.test(el.tagName)))) {
        openAt(s)
      } else if (k === 'w') {
        const l = projectOf(s) ? launchOf(projectOf(s)!) : null
        if (l) window.open(l.href, '_blank', 'noreferrer')
      } else if (k === 'e' || k === 'escape') {
        select(-1)
      } else if (/^[1-9]$/.test(k) && Number(k) <= spots.length) {
        select(Number(k) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  const pad = useGamepad(
    {
      left: () => select(selRef.current < 0 ? spots.length - 1 : selRef.current - 1),
      right: () => select(selRef.current < 0 ? 0 : selRef.current + 1),
      a: () => openAt(selRef.current),
      b: () => select(-1),
    },
    inView,
  )

  const counts = useMemo(() => {
    const byKind = new Map<string, number>()
    projects.forEach((p) => byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1))
    return [...byKind.entries()]
  }, [])
  const links = projects.filter((p) => p.launch).length

  const cmd =
    'cut hud relative flex h-14 flex-col items-center justify-center gap-0.5 bg-surface-2 text-[11px] text-fg transition hover:bg-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-surface-2 disabled:hover:text-fg'
  const chip =
    'cut hud grid size-9 place-items-center bg-surface-2/85 text-fg backdrop-blur transition hover:bg-accent hover:text-accent-ink active:scale-[0.96]'

  return (
    <section
      id="command"
      ref={section}
      aria-label="Campaign map"
      className="relative h-[100dvh] min-h-[640px] overflow-hidden bg-bg"
    >
      <div ref={host} className="absolute inset-0">
        {!mode3d && (
          <div
            className="absolute inset-0 grid place-items-center"
            style={{
              backgroundImage:
                'linear-gradient(rgb(79 216 255 / 0.07) 1px, transparent 1px), linear-gradient(90deg, rgb(79 216 255 / 0.07) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          >
            {current && (
              <Frame className="aspect-[16/10] w-[min(60vw,640px)]" inner="crt relative">
                <Cover project={current} priority />
              </Frame>
            )}
          </div>
        )}
      </div>

      {/* top row: resources and camera */}
      <div className="pointer-events-none absolute inset-x-0 top-[4.25rem] flex items-start justify-between gap-3 px-4 md:px-6">
        <ul className="flex flex-wrap gap-2">
          <li className="cut hud bg-surface-2/85 px-3 py-2 text-xs backdrop-blur">
            <span className="text-accent">{projects.length}</span> {projects.length === 1 ? 'Project' : 'Projects'}
          </li>
          {counts.length > 1 &&
            counts.map(([k, n]) => (
              <li key={k} className="cut hud hidden bg-surface-2/85 px-3 py-2 text-xs backdrop-blur sm:block">
                <span className="text-accent">{n}</span> {kindLabel[k as keyof typeof kindLabel]}
              </li>
            ))}
          {links > 0 && (
            <li className="cut hud hidden bg-surface-2/85 px-3 py-2 text-xs backdrop-blur sm:block">
              <span className="text-accent">{links}</span> Live {links === 1 ? 'link' : 'links'}
            </li>
          )}
        </ul>
        {mode3d && (
          <div className="pointer-events-auto flex flex-col gap-2">
            <button type="button" aria-label="Zoom in" className={chip} onClick={() => world.current?.zoom(0.78)}>
              <Plus size={16} weight="bold" />
            </button>
            <button type="button" aria-label="Zoom out" className={chip} onClick={() => world.current?.zoom(1.28)}>
              <Minus size={16} weight="bold" />
            </button>
            <button type="button" aria-label="Back to overview" className={chip} onClick={() => select(-1)}>
              <ArrowsOutCardinal size={16} weight="bold" />
            </button>
          </div>
        )}
      </div>

      {/* roster */}
      <ol className="absolute left-4 top-[8.5rem] hidden flex-col gap-2 md:flex md:left-6">
        {spots.map((s, i) => {
          const p = projectOf(i)
          const on = i === sel
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(i)}
                aria-label={s.title}
                aria-pressed={on}
                className={`group cut relative block h-12 w-[4.5rem] overflow-hidden transition ${
                  on ? 'ring-2 ring-accent' : 'opacity-80 hover:opacity-100'
                } bg-surface-2`}
              >
                {p ? (
                  <Cover project={p} />
                ) : (
                  <span className="hud grid size-full place-items-center text-lg text-accent">?</span>
                )}
                <span className="hud absolute bottom-0 left-0 bg-bg/80 px-1 text-[10px] text-fg">{i + 1}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {/* bottom HUD */}
      <div className="absolute inset-x-0 bottom-0 grid gap-3 bg-gradient-to-t from-bg via-bg/90 to-transparent p-3 pt-10 md:grid-cols-[13rem_1fr_17rem] md:p-5 md:pt-14">
        <div className="hidden md:block">
          <Frame className="h-40">
            <Minimap
              layout={layout}
              selected={sel}
              onSelect={select}
              onPan={(x, z) => world.current?.panTo(x, z)}
            />
          </Frame>
        </div>

        <Frame className="md:h-40">
          <div className="flex h-full gap-4 p-3 md:p-4">
            <div className="hidden w-44 shrink-0 sm:block">
              <div className="frame aspect-[16/10] w-full">
                <div className="frame-in crt relative">
                  {current ? (
                    <Cover project={current} />
                  ) : (
                    <div className="hud grid size-full place-items-center text-4xl text-accent">
                      {sel >= 0 ? '?' : <Hexagon size={44} weight="duotone" />}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {sel < 0 ? (
                <>
                  <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-4xl">
                    {site.headline[0]} <span className="text-accent">{site.headline[1]}</span>
                  </h1>
                  <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">{site.intro}</p>
                  <p className="hud mt-3 hidden text-[11px] text-muted md:block">
                    Drag to orbit, right-drag to pan, ctrl + wheel to zoom
                  </p>
                </>
              ) : current ? (
                <>
                  <ul className="flex flex-wrap gap-2">
                    {[kindLabel[current.kind], String(current.year), current.status].map((t) => (
                      <li key={t} className="cut hud bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <h2 className="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-4xl">
                    {current.title}
                  </h2>
                  <p className="mt-2 line-clamp-2 max-w-[56ch] text-sm leading-relaxed text-muted">
                    {current.tagline}
                  </p>
                  <p className="hud mt-2 hidden text-[11px] text-muted md:block">
                    Opens as {platformOf(current)}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-4xl">
                    {site.nextGame.title}
                  </h2>
                  <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted">{site.nextGame.body}</p>
                </>
              )}
            </div>
          </div>
        </Frame>

        <Frame className="md:h-40">
          <div className="grid h-full grid-cols-3 gap-2 p-2.5">
            <button
              type="button"
              className={cmd}
              disabled={!current}
              onClick={() => openAt(sel)}
            >
              <ArrowUpRight size={18} weight="bold" />
              Open
              <span className="absolute right-1 top-1 hidden md:block"><Key>Q</Key></span>
            </button>
            {launch ? (
              <a className={cmd} href={launch.href} target="_blank" rel="noreferrer">
                <launch.icon size={18} weight="bold" />
                {launch.label}
                <span className="absolute right-1 top-1 hidden md:block"><Key>W</Key></span>
              </a>
            ) : (
              <button type="button" className={cmd} disabled>
                <ArrowSquareOut size={18} weight="bold" />
                Link
                <span className="absolute right-1 top-1 hidden md:block"><Key>W</Key></span>
              </button>
            )}
            <button type="button" className={cmd} onClick={() => select(-1)} disabled={sel < 0}>
              <ArrowsOutCardinal size={18} weight="bold" />
              Overview
              <span className="absolute right-1 top-1 hidden md:block"><Key>E</Key></span>
            </button>
            <button
              type="button"
              className={cmd}
              onClick={() => select(sel < 0 ? spots.length - 1 : sel - 1)}
            >
              <CaretLeft size={18} weight="bold" />
              Previous
              <span className="absolute right-1 top-1 hidden md:block"><Key>A</Key></span>
            </button>
            <button
              type="button"
              className={cmd}
              onClick={() => select(sel < 0 ? 0 : sel + 1)}
            >
              <CaretRight size={18} weight="bold" />
              Next
              <span className="absolute right-1 top-1 hidden md:block"><Key>S</Key></span>
            </button>
            <p className="hud hidden place-items-center text-center text-[10px] leading-tight text-muted md:grid">
              {pad ? 'Pad: d-pad, A, B' : 'Keys 1 to 9 select'}
            </p>
          </div>
        </Frame>
      </div>
    </section>
  )
}
