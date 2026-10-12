import { useSyncExternalStore } from 'react'

/** Whether the visitor wants the 3D arcade. Falls back to a flat layout without WebGL or with reduced motion. */

const KEY = '3d'
const listeners = new Set<() => void>()

const webglOk = (() => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
})()

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let on = (() => {
  if (!webglOk) return false
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored === 'on'
  } catch {
    /* ignore */
  }
  return !reducedMotion()
})()

export const supports3d = webglOk

export const set3d = (v: boolean) => {
  on = v && webglOk
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export const use3d = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => on,
    () => false,
  )
