import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { projects } from '../data/projects'
import { site } from '../data/site'
import { asset } from '../lib/route'
import { sfx } from '../lib/sfx'
import { use3d } from '../lib/prefs'
import { btnPrimary, btnSecondary } from '../lib/ui'

export const BOOT_KEY = 'booted'

/**
 * Boot screen. The progress bar is real: it counts the cover images, the display
 * font and the three.js chunk actually loading behind it. It is also the user
 * gesture that lets sound start.
 */
export function Boot({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0)
  const want3d = use3d()
  const started = useRef(false)

  useEffect(() => {
    const tasks: Promise<unknown>[] = []
    if (want3d) tasks.push(import('../lib/arcade'))
    if (document.fonts?.ready) tasks.push(document.fonts.ready)
    projects.forEach((p) => {
      if (!p.cover) return
      tasks.push(
        new Promise((res) => {
          const img = new Image()
          img.onload = img.onerror = () => res(null)
          img.src = asset(p.cover!)
        }),
      )
    })
    let done = 0
    const total = tasks.length + 1
    const tick = () => setProgress(++done / total)
    tasks.forEach((t) => Promise.resolve(t).catch(() => null).then(tick))
    // short minimum so the screen is readable rather than a flash
    new Promise((r) => setTimeout(r, 700)).then(tick)
  }, [want3d])

  const ready = progress >= 1

  const start = (withSound: boolean) => {
    if (started.current) return
    started.current = true
    sfx.set(withSound)
    if (withSound) sfx.boot()
    try {
      sessionStorage.setItem(BOOT_KEY, '1')
    } catch {
      /* ignore */
    }
    onDone()
  }

  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        start(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col justify-center bg-bg px-6 md:px-16"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      role="dialog"
      aria-label="Loading"
    >
      <div className="mx-auto w-full max-w-5xl">
        <p className="hud text-sm text-muted">{site.role}</p>
        <h1 className="mt-3 font-display text-6xl font-bold uppercase italic leading-[0.92] tracking-tight sm:text-7xl md:text-9xl">
          {site.name}
        </h1>

        <div className="mt-12 max-w-md">
          <div className="frame h-3">
            <div className="frame-in bg-surface">
              <motion.div
                className="h-full origin-left bg-accent"
                animate={{ scaleX: progress }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </div>
          </div>

          <div className="mt-8 flex min-h-12 flex-wrap items-center gap-3">
            {ready ? (
              <>
                <button type="button" onClick={() => start(true)} className={btnPrimary}>
                  Press start
                </button>
                <button type="button" onClick={() => start(false)} className={btnSecondary}>
                  Muted
                </button>
              </>
            ) : (
              <p className="hud prompt text-sm text-muted">Loading</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
