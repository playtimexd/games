import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  ArrowsOut,
  GithubLogo,
  GameController,
  Play,
  Star,
  Storefront,
} from '@phosphor-icons/react'
import type { Launch, Project } from '../data/projects'
import { Cover } from './Cover'

const primary =
  'inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 text-sm font-semibold text-accent-ink transition hover:brightness-105 active:translate-y-px active:scale-[0.98]'
const secondary =
  'inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full border border-line px-5 text-sm font-semibold transition hover:bg-surface-2 active:translate-y-px active:scale-[0.98]'

/** Web game: poster first, iframe only after the visitor asks to play. */
function WebPlayer({ p, url, embed }: { p: Project; url: string; embed: boolean }) {
  const [live, setLive] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  if (!embed) {
    return (
      <div>
        <div className="aspect-video overflow-hidden rounded-2xl ring-1 ring-line">
          <Cover project={p} priority />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className={primary} href={url} target="_blank" rel="noreferrer">
            <GameController size={18} weight="bold" /> Play now
          </a>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        ref={box}
        className="relative aspect-video overflow-hidden rounded-2xl bg-surface ring-1 ring-line"
      >
        {live ? (
          <iframe
            src={url}
            title={`${p.title}, playable`}
            className="size-full bg-black"
            allow="fullscreen; gamepad; autoplay; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms"
          />
        ) : (
          <>
            <Cover project={p} priority />
            <div className="absolute inset-0 grid place-items-center bg-black/35">
              <button type="button" onClick={() => setLive(true)} className={primary}>
                <Play size={18} weight="fill" /> Play in browser
              </button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <a className={secondary} href={url} target="_blank" rel="noreferrer">
          <ArrowSquareOut size={18} /> Open in new tab
        </a>
        {live && (
          <button type="button" className={secondary} onClick={() => box.current?.requestFullscreen?.()}>
            <ArrowsOut size={18} /> Fullscreen
          </button>
        )}
      </div>
    </div>
  )
}

function SteamPanel({ p, appId }: { p: Project; appId: number }) {
  const url = `https://store.steampowered.com/app/${appId}`
  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-2xl ring-1 ring-line">
        <Cover project={p} priority />
      </div>
      <iframe
        src={`https://store.steampowered.com/widget/${appId}/`}
        title={`${p.title} on Steam`}
        loading="lazy"
        className="mt-5 h-[190px] w-full rounded-2xl border border-line bg-surface"
      />
      <div className="mt-4">
        <a className={primary} href={url} target="_blank" rel="noreferrer">
          <Storefront size={18} weight="bold" /> View on Steam
        </a>
      </div>
    </div>
  )
}

interface RepoData {
  description: string | null
  stargazers_count: number
  language: string | null
  pushed_at: string
  html_url: string
}

function GithubPanel({ p, repo }: { p: Project; repo: string }) {
  const [data, setData] = useState<RepoData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    const ctrl = new AbortController()
    setState('loading')
    fetch(`https://api.github.com/repos/${repo}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RepoData) => {
        setData(d)
        setState('ok')
      })
      .catch((e) => {
        if (e?.name !== 'AbortError') setState('error')
      })
    return () => ctrl.abort()
  }, [repo])

  const url = data?.html_url ?? `https://github.com/${repo}`
  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-2xl ring-1 ring-line">
        <Cover project={p} priority />
      </div>
      <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <GithubLogo size={22} />
          <span className="font-mono text-sm">{repo}</span>
        </div>
        {state === 'loading' && (
          <div className="mt-4 space-y-2" aria-hidden="true">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
          </div>
        )}
        {state === 'ok' && data && (
          <>
            {data.description && (
              <p className="mt-3 max-w-[60ch] text-sm text-muted">{data.description}</p>
            )}
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              {data.language && <li>{data.language}</li>}
              <li className="inline-flex items-center gap-1">
                <Star size={14} /> {data.stargazers_count}
              </li>
              <li>
                Updated{' '}
                {new Date(data.pushed_at).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })}
              </li>
            </ul>
          </>
        )}
        {state === 'error' && (
          <p className="mt-3 text-sm text-muted">
            Repo details could not be loaded right now. The link below still works.
          </p>
        )}
      </div>
      <div className="mt-4">
        <a className={primary} href={url} target="_blank" rel="noreferrer">
          <GithubLogo size={18} weight="bold" /> View source
        </a>
      </div>
    </div>
  )
}

function ComingSoon({ p }: { p: Project }) {
  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-2xl ring-1 ring-line">
        <Cover project={p} priority />
      </div>
      <div className="mt-5">
        <span
          aria-disabled="true"
          className="inline-flex h-12 cursor-not-allowed items-center rounded-full border border-line px-6 text-sm font-semibold text-muted"
        >
          Link coming soon
        </span>
      </div>
    </div>
  )
}

export function LaunchPanel({ p }: { p: Project }) {
  const l: Launch | undefined = p.launch
  if (!l) return <ComingSoon p={p} />
  switch (l.type) {
    case 'web':
      return <WebPlayer p={p} url={l.url} embed={!!l.embed} />
    case 'steam':
      return <SteamPanel p={p} appId={l.appId} />
    case 'github':
      return <GithubPanel p={p} repo={l.repo} />
    case 'link':
      return (
        <div>
          <div className="aspect-video overflow-hidden rounded-2xl ring-1 ring-line">
            <Cover project={p} priority />
          </div>
          <div className="mt-5">
            <a className={primary} href={l.url} target="_blank" rel="noreferrer">
              <ArrowSquareOut size={18} weight="bold" /> {l.label ?? 'Open project'}
            </a>
          </div>
        </div>
      )
  }
}
