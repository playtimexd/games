import { useSyncExternalStore } from 'react'

// Two layers only: the home page and one page per project.
export type Route = { name: 'home' } | { name: 'project'; slug: string }

export const parseRoute = (hash: string): Route => {
  const m = /^#\/p\/([a-z0-9-]+)/i.exec(hash)
  return m ? { name: 'project', slug: m[1] } : { name: 'home' }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const useHash = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  )

export const projectHref = (slug: string) => `#/p/${slug}`

/** Resolves a /public path against the Vite base. */
export const asset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
