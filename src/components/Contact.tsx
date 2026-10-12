import { ArrowUpRight } from '@phosphor-icons/react'
import { site } from '../data/site'

export function Contact() {
  return (
    <footer id="contact" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-24 md:px-8">
        <a
          href={`mailto:${site.email}`}
          className="group inline-flex flex-wrap items-center gap-x-4 text-3xl font-semibold tracking-tighter sm:text-5xl md:text-7xl"
        >
          <span className="break-all underline decoration-line decoration-2 underline-offset-[0.18em] transition-colors group-hover:decoration-accent">
            {site.email}
          </span>
          <ArrowUpRight
            weight="bold"
            className="size-[0.8em] shrink-0 text-accent-text transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
          />
        </a>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <p>
            {new Date().getFullYear()} {site.name}
          </p>
          <ul className="flex gap-5">
            {site.links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-fg"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
