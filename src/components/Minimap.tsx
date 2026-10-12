import { useEffect, useRef } from 'react'
import type { MapLayout } from '../lib/layout'

/** 2D radar view of the same layout the 3D map uses. Click a base to select it, or anywhere to pan. */
export function Minimap({
  layout,
  selected,
  onSelect,
  onPan,
}: {
  layout: MapLayout
  selected: number
  onSelect(i: number): void
  onPan?(x: number, z: number): void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { spots, bounds } = layout

  const toPx = (x: number, z: number, w: number, h: number) => ({
    px: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * w,
    py: ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * h,
  })

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = c.clientWidth
    const h = c.clientHeight
    c.width = w * dpr
    c.height = h * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, w, h)

    // explored area
    g.fillStyle = 'rgba(79,216,255,0.08)'
    spots.forEach((s) => {
      const { px, py } = toPx(s.x, s.z, w, h)
      g.beginPath()
      g.arc(px, py, (w / (bounds.maxX - bounds.minX)) * 8, 0, Math.PI * 2)
      g.fill()
    })

    // supply line
    g.strokeStyle = 'rgba(79,216,255,0.5)'
    g.lineWidth = 1.5
    g.beginPath()
    spots.forEach((s, i) => {
      const { px, py } = toPx(s.x, s.z, w, h)
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    })
    g.stroke()

    spots.forEach((s, i) => {
      const { px, py } = toPx(s.x, s.z, w, h)
      const on = i === selected
      g.fillStyle = on ? '#4fd8ff' : s.kind === 'next' ? 'rgba(79,216,255,0)' : '#cfeaf5'
      g.strokeStyle = on ? '#ffffff' : '#4fd8ff'
      g.lineWidth = on ? 2 : 1.5
      g.beginPath()
      if (s.kind === 'app') g.rect(px - 4, py - 4, 8, 8)
      else if (s.kind === 'tool') {
        g.moveTo(px, py - 5)
        g.lineTo(px + 5, py)
        g.lineTo(px, py + 5)
        g.lineTo(px - 5, py)
        g.closePath()
      } else g.arc(px, py, s.kind === 'next' ? 4.5 : 4, 0, Math.PI * 2)
      if (s.kind === 'next') g.setLineDash([2, 2])
      g.fill()
      g.stroke()
      g.setLineDash([])
      if (on) {
        g.beginPath()
        g.arc(px, py, 9, 0, Math.PI * 2)
        g.strokeStyle = 'rgba(79,216,255,0.6)'
        g.stroke()
      }
    })
  }, [spots, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    let best = -1
    let bd = 16
    spots.forEach((s, i) => {
      const { px, py } = toPx(s.x, s.z, r.width, r.height)
      const d = Math.hypot(px - mx, py - my)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    if (best >= 0) onSelect(best)
    else if (onPan) {
      onPan(
        bounds.minX + (mx / r.width) * (bounds.maxX - bounds.minX),
        bounds.minZ + (my / r.height) * (bounds.maxZ - bounds.minZ),
      )
    }
  }

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      role="img"
      aria-label="Map overview"
      className="block size-full cursor-crosshair"
    />
  )
}
