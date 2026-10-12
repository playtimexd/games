import { Cube, GameController, GithubLogo, Lock, Storefront, Trophy, type Icon } from '@phosphor-icons/react'
import { projects } from '../data/projects'
import { Frame } from './Frame'

interface Achievement {
  id: string
  title: string
  body: string
  icon: Icon
  have: number
  need: number
}

/**
 * Computed from the project list, so they unlock as links and projects get added.
 * Nothing here is hard-coded as "earned".
 */
function compute(): Achievement[] {
  const ofType = (t: string) => projects.filter((p) => p.launch?.type === t).length
  const kinds = new Set(projects.map((p) => p.kind)).size
  return [
    {
      id: 'library',
      title: 'Three in the library',
      body: 'Three projects on the street.',
      icon: Trophy,
      have: projects.length,
      need: 3,
    },
    {
      id: 'web',
      title: 'Playable online',
      body: 'A project you can open in the browser.',
      icon: GameController,
      have: ofType('web'),
      need: 1,
    },
    {
      id: 'steam',
      title: 'On Steam',
      body: 'A project with a Steam store page.',
      icon: Storefront,
      have: ofType('steam'),
      need: 1,
    },
    {
      id: 'source',
      title: 'Open source',
      body: 'A project with its source on GitHub.',
      icon: GithubLogo,
      have: ofType('github'),
      need: 1,
    },
    {
      id: 'range',
      title: 'Cross-class',
      body: 'Projects in two different categories, such as a game and a tool.',
      icon: Cube,
      have: kinds,
      need: 2,
    },
    {
      id: 'back-catalogue',
      title: 'Back catalogue',
      body: 'Ten projects in the library.',
      icon: Trophy,
      have: projects.length,
      need: 10,
    },
  ]
}

export function Achievements() {
  const list = compute()
  const unlocked = list.filter((a) => a.have >= a.need).length
  return (
    <section id="achievements" className="mx-auto max-w-7xl px-4 py-24 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-4xl font-bold uppercase leading-none tracking-tight md:text-6xl">
          Achievements
        </h2>
        <p className="hud text-sm text-muted">
          {unlocked} of {list.length} unlocked
        </p>
      </div>
      <ul className="mt-12 grid gap-4 md:grid-cols-2">
        {list.map((a) => {
          const done = a.have >= a.need
          const Icon = done ? a.icon : Lock
          return (
            <li key={a.id}>
              <Frame active={done}>
                <div className={`flex items-center gap-5 p-5 ${done ? '' : 'opacity-60'}`}>
                  <span
                    className={`cut grid size-14 shrink-0 place-items-center ${
                      done ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'
                    }`}
                  >
                    <Icon size={26} weight="bold" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold uppercase tracking-tight">
                      {a.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{a.body}</p>
                    {!done && (
                      <p className="hud mt-2 text-[11px] text-muted">
                        {Math.min(a.have, a.need)} of {a.need}
                      </p>
                    )}
                  </div>
                </div>
              </Frame>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
