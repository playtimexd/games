import { site } from '../data/site'

const links = [
  { href: '#work', label: 'Work' },
  { href: '#about', label: 'About' },
  { href: '#contact', label: 'Contact' },
]

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-gradient-to-b from-bg/85 to-transparent">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
        <a href="#/" className="font-display text-lg font-bold uppercase tracking-wide">
          {site.name}
        </a>
        <nav aria-label="Primary" className="flex items-center">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="hud px-3 py-2 text-[11px] text-muted transition-colors hover:text-fg"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
