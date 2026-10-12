import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { hueOf, projects } from '../data/projects'
import { site } from '../data/site'
import { asset, projectHref } from '../lib/route'
import { set3d, use3d } from '../lib/prefs'
import type { Carts, CartItem } from '../lib/cartridges'

/**
 * The home screen: one row of cartridges, nothing else. The label under the row follows
 * whichever cartridge you point at, and it is also a real link, so it works from the keyboard.
 */
export function Cartridges() {
  const mode3d = use3d()
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<Carts | null>(null)
  const [focus, setFocus] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const focusRef = useRef(0)
  focusRef.current = focus

  const items = useMemo<CartItem[]>(
    () => [
      ...projects.map((p) => ({
        id: p.slug,
        title: p.title,
        src: p.cover ? asset(p.cover) : undefined,
        hue: hueOf(p),
      })),
      { id: 'next', title: site.nextGame.title, hue: 24, next: true },
    ],
    [],
  )
  const total = items.length

  useEffect(() => {
    const el = host.current
    if (!mode3d || !el) return
    let cancelled = false
    let dispose: (() => void) | undefined
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 size-full touch-pan-y'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)

    import('../lib/cartridges').then(({ createCartridges }) => {
      if (cancelled) return
      const c = createCartridges({
        canvas,
        host: el,
        items,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onHover: (i) => setFocus(i),
        onOpening: () => setLeaving(true),
        onOpen: (i) => {
          window.location.hash = projectHref(projects[i].slug)
        },
      })
      if (!c) {
        canvas.remove()
        set3d(false)
        return
      }
      api.current = c
      dispose = () => c.dispose()
    })
    return () => {
      cancelled = true
      dispose?.()
      api.current = null
      canvas.remove()
    }
  }, [mode3d, items])

  // arrow keys move the label, Enter opens, so the keyboard can reach everything too
  useEffect(() => {
    if (!mode3d) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = document.activeElement
      if (el && /^(INPUT|TEXTAREA|SELECT|A|BUTTON)$/.test(el.tagName)) return
      if (e.key === 'ArrowRight') setFocus((f) => (f + 1) % total)
      else if (e.key === 'ArrowLeft') setFocus((f) => (f - 1 + total) % total)
      else if (e.key === 'Enter' && focusRef.current < projects.length) {
        api.current?.open(focusRef.current)
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode3d, total])

  useEffect(() => {
    api.current?.focus(focus)
  }, [focus])

  const current = focus < projects.length ? projects[focus] : null

  const heading = (
    <h1 className="font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight sm:text-6xl md:text-7xl">
      {site.headline[0]}
      {site.headline[1] && <span className="block text-accent">{site.headline[1]}</span>}
    </h1>
  )

  if (!mode3d) {
    return (
      <section id="shelf" className="mx-auto max-w-7xl px-4 pb-8 pt-36 md:px-8">
        {heading}
        <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-fg/80">{site.intro}</p>
      </section>
    )
  }

  return (
    <section
      id="shelf"
      aria-label="Games"
      className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-bg"
    >
      <div
        ref={host}
        className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_58%,#2a1a33_0%,#150e1c_55%,#0c0910_100%)]"
      />

      <div
        className={`pointer-events-none absolute left-4 top-24 max-w-[30rem] transition-opacity duration-500 md:left-12 md:top-28 ${
          leaving ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {heading}
        <p className="mt-4 max-w-[34ch] text-base leading-relaxed text-fg/75">{site.intro}</p>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center px-4 text-center transition-opacity duration-300 md:bottom-14 ${
          leaving ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <p className="font-display text-4xl font-bold uppercase leading-none tracking-tight md:text-5xl">
          {current ? current.title : site.nextGame.title}
        </p>
        <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted md:text-base">
          {current ? current.tagline : site.nextGame.body}
        </p>
        {current && (
          <a
            href={projectHref(current.slug)}
            className="hud pointer-events-auto mt-4 inline-flex items-center gap-1.5 text-xs text-accent transition-opacity hover:opacity-80"
          >
            Open <ArrowUpRight size={14} weight="bold" />
          </a>
        )}
      </div>
    </section>
  )
}
