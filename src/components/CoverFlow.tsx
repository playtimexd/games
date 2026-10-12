import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { createFlow, type Flow, type FlowItem } from '../lib/flow'

export interface FlowHandle {
  prev(): void
  next(): void
  goTo(index: number): void
}

interface Props {
  items: FlowItem[]
  label: string
  initial?: number
  className?: string
  onChange?(index: number): void
  onOpen?(item: FlowItem): void
  /** Called when WebGL cannot start, so the parent can render a static fallback. */
  onUnavailable?(): void
  ref?: Ref<FlowHandle>
}

/** Owns the canvas lifecycle for the Three.js coverflow. Loaded lazily by its parents. */
export function CoverFlow({
  items,
  label,
  initial = 0,
  className = '',
  onChange,
  onOpen,
  onUnavailable,
  ref,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const flow = useRef<Flow | null>(null)
  const cb = useRef({ onChange, onOpen, onUnavailable })
  cb.current = { onChange, onOpen, onUnavailable }
  const key = items.map((i) => i.id).join('|')

  useImperativeHandle(
    ref,
    () => ({
      prev: () => flow.current?.prev(),
      next: () => flow.current?.next(),
      goTo: (i) => flow.current?.goTo(i),
    }),
    [],
  )

  useEffect(() => {
    const el = host.current
    if (!el) return
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 size-full touch-pan-y select-none'
    canvas.setAttribute('aria-hidden', 'true')
    el.appendChild(canvas)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const f = createFlow({
      canvas,
      host: el,
      items,
      initial,
      reduced,
      onChange: (i) => cb.current.onChange?.(i),
      onOpen: (it) => cb.current.onOpen?.(it),
    })
    if (!f) {
      canvas.remove()
      cb.current.onUnavailable?.()
      return
    }
    flow.current = f
    return () => {
      f.dispose()
      flow.current = null
      canvas.remove()
    }
    // `key` stands in for `items`: the effect only needs to rerun when the set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      flow.current?.prev()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      flow.current?.next()
    }
  }

  return (
    <div
      ref={host}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKey}
      className={`relative ${className}`}
    />
  )
}
