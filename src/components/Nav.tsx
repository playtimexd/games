import { List } from '@phosphor-icons/react'
import { site } from '../data/site'

export function Nav({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-8">
        <a href="#/" className="font-display text-lg font-bold uppercase tracking-wide">
          {site.name}
        </a>
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="cut hud inline-flex h-10 items-center gap-2 bg-surface-2/80 px-4 text-[11px] backdrop-blur transition hover:bg-accent hover:text-accent-ink"
        >
          <List size={16} weight="bold" />
          Menu
        </button>
      </div>
    </header>
  )
}
