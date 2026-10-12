/** Canvas version of the generated cover, used as a WebGL texture when a project has no image. */
export function drawGeneratedCover(title: string, hue: number): HTMLCanvasElement {
  const w = 1280
  const h = 800
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = `hsl(${hue} 30% 10%)`
  g.fillRect(0, 0, w, h)

  const a = g.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, w * 0.75)
  a.addColorStop(0, `hsl(${hue} 70% 42%)`)
  a.addColorStop(1, `hsla(${hue} 70% 42% / 0)`)
  g.fillStyle = a
  g.fillRect(0, 0, w, h)

  const h2 = (hue + 40) % 360
  const b = g.createRadialGradient(w * 0.9, h, 0, w * 0.9, h, w * 0.7)
  b.addColorStop(0, `hsl(${h2} 60% 32%)`)
  b.addColorStop(1, `hsla(${h2} 60% 32% / 0)`)
  g.fillStyle = b
  g.fillRect(0, 0, w, h)

  g.fillStyle = '#f2f2f4'
  g.textBaseline = 'alphabetic'
  let size = 116
  g.font = `600 ${size}px "Geist Variable", system-ui, sans-serif`
  while (g.measureText(title).width > w - 140 && size > 40) {
    size -= 6
    g.font = `600 ${size}px "Geist Variable", system-ui, sans-serif`
  }
  g.fillText(title, 70, h - 80)
  return c
}
