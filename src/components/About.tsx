import { Flask, RocketLaunch, Target, Wrench } from '@phosphor-icons/react'
import { site } from '../data/site'
import { Frame } from './Frame'

// One icon per responsibility, in the order they appear in site.about.responsibilities.
const icons = [Target, Wrench, Flask, RocketLaunch]

export function About() {
  return (
    <section id="about" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-24 md:px-8">
      <h2 className="max-w-[24ch] font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight md:text-5xl">
        {site.about.statement}
      </h2>
      <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {site.about.responsibilities.map((r, i) => {
          const Icon = icons[i % icons.length]
          return (
            <li key={r.title} className="group">
              <Frame className="h-full">
                <div className="flex h-full flex-col p-6">
                  <span className="cut grid size-12 place-items-center bg-surface-2 text-accent">
                    <Icon size={24} weight="bold" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-bold uppercase tracking-tight">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
                </div>
              </Frame>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
