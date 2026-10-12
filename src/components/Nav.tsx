import { SpeakerHigh, SpeakerSlash, MapTrifold } from '@phosphor-icons/react'
import { site } from '../data/site'
import { sfx, useSfx } from '../lib/sfx'
import { set3d, supports3d, use3d } from '../lib/prefs'

const links = [
  { href: '#work', label: 'Work' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
]

const toggle =
  'cut hud inline-flex h-9 items-center gap-1.5 bg-surface-2/80 px-3 text-[11px] backdrop-blur transition hover:bg-accent hover:text-accent-ink aria-pressed:text-accent aria-pressed:hover:text-accent-ink'

export function Nav({ home }: { home: boolean }) {
  const sound = useSfx()
  const on3d = use3d()
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-bg/85 to-transparent">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
        <a href="#/" className="font-display text-lg font-bold uppercase tracking-wide">
          {site.name}
        </a>
        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <span className="hidden items-center sm:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="hud px-3 py-2 text-[11px] text-muted transition-colors hover:text-fg"
              >
                {l.label}
              </a>
            ))}
          </span>
          {home && supports3d && (
            <button
              type="button"
              aria-pressed={on3d}
              onClick={() => set3d(!on3d)}
              className={toggle}
            >
              <MapTrifold size={15} weight="bold" /> Map {on3d ? '3D' : '2D'}
            </button>
          )}
          <button
            type="button"
            aria-pressed={sound}
            onClick={() => sfx.set(!sound)}
            className={toggle}
          >
            {sound ? <SpeakerHigh size={15} weight="bold" /> : <SpeakerSlash size={15} weight="bold" />}
            Sound {sound ? 'on' : 'off'}
          </button>
        </nav>
      </div>
    </header>
  )
}
