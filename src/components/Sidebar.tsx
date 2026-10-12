import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, X } from '@phosphor-icons/react'
import { kindLabel, projects } from '../data/projects'
import { site } from '../data/site'
import { projectHref } from '../lib/route'
import { Cover } from './Cover'

/**
 * The hidden sidebar: everything that is not a cartridge. Games, a short about, contact.
 * It is a drawer over the page, not another page, so the site stays two layers deep.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(26rem,100%)] flex-col overflow-y-auto border-l border-line bg-surface"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between px-6 pb-4 pt-5">
              <div>
                <p className="font-display text-xl font-bold uppercase tracking-wide">{site.name}</p>
                <p className="hud mt-0.5 text-[11px] text-muted">{site.role}</p>
              </div>
              <button
                ref={closeBtn}
                type="button"
                onClick={onClose}
                aria-label="Close menu"
                className="cut grid size-10 place-items-center bg-surface-2 text-fg transition hover:bg-accent hover:text-accent-ink"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <nav aria-label="Games" className="px-6 pt-4">
              <h2 className="hud text-[11px] text-muted">Games</h2>
              <ul className="mt-3 space-y-2">
                {projects.map((p) => (
                  <li key={p.slug}>
                    <a
                      href={projectHref(p.slug)}
                      onClick={onClose}
                      className="group flex items-center gap-4 rounded-none p-1 transition-colors hover:bg-surface-2"
                    >
                      <span className="cut block h-12 w-[4.5rem] shrink-0 overflow-hidden bg-surface-2">
                        <Cover project={p} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-xl font-bold uppercase leading-none tracking-tight">
                          {p.title}
                        </span>
                        <span className="hud mt-1 block text-[10px] text-muted">
                          {kindLabel[p.kind]}, {p.year}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={18}
                        weight="bold"
                        className="shrink-0 text-muted transition-colors group-hover:text-accent"
                      />
                    </a>
                  </li>
                ))}
                <li className="flex items-center gap-4 p-1 opacity-60">
                  <span className="cut hud grid h-12 w-[4.5rem] shrink-0 place-items-center bg-surface-2 text-2xl text-accent">
                    ?
                  </span>
                  <span className="font-display text-xl font-bold uppercase leading-none tracking-tight">
                    {site.nextGame.title}
                  </span>
                </li>
              </ul>
            </nav>

            <section className="mt-10 px-6">
              <h2 className="hud text-[11px] text-muted">About</h2>
              <p className="mt-3 text-base leading-relaxed text-fg/90">{site.about.statement}</p>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                {site.about.responsibilities.map((r) => (
                  <li key={r.title}>
                    <span className="text-fg">{r.title}.</span> {r.body}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-10 px-6 pb-10">
              <h2 className="hud text-[11px] text-muted">Contact</h2>
              <a
                href={`mailto:${site.email}`}
                className="mt-3 block break-all font-display text-2xl font-bold uppercase leading-tight tracking-tight transition-colors hover:text-accent"
              >
                {site.email}
              </a>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {site.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
