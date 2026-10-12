import * as THREE from 'three'
import { drawGeneratedCover } from './cover'

/**
 * 3D coverflow. One transparent WebGL canvas, one textured plane per item.
 *
 * Interactions (each one says something about the content):
 *  - drag / swipe / arrow keys / side click: move through projects
 *  - hover: the cover under the pointer ripples and splits RGB around the cursor
 *  - click the front plane: open that project
 *  - pointer position: the whole stage leans toward the cursor (parallax depth)
 *
 * Pointer state lives in plain variables and is read in the render loop,
 * never in React state, so nothing re-renders per mouse move.
 */

export interface FlowItem {
  id: string
  title: string
  src?: string
  hue: number
}

export interface FlowOptions {
  canvas: HTMLCanvasElement
  host: HTMLElement
  items: FlowItem[]
  initial: number
  reduced: boolean
  onChange(index: number): void
  onOpen?(item: FlowItem): void
}

export interface Flow {
  dispose(): void
  prev(): void
  next(): void
  goTo(index: number): void
}

const PW = 1.6
const PH = 1.0
const mod = (n: number, m: number) => ((n % m) + m) % m
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  uniform float uHover;
  uniform vec2 uMouse;
  void main() {
    vUv = uv;
    vec3 p = position;
    float d = distance(uv, uMouse);
    p.z += uHover * 0.07 * smoothstep(0.55, 0.0, d);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform float uHasTex;
  uniform vec3 uTint;
  uniform vec2 uCover;
  uniform vec2 uMouse;
  uniform float uHover;
  uniform float uTime;
  uniform float uOpacity;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    vec2 m = (uMouse - 0.5) * uCover + 0.5;
    vec2 dv = uv - m;
    float r = length(dv * vec2(1.6, 1.0));
    float wave = sin(r * 34.0 - uTime * 3.5) * exp(-r * 6.0) * uHover;
    vec2 dir = dv / (length(dv) + 1e-4);
    vec2 off = dir * wave * 0.012;
    float split = uHover * 0.004 * smoothstep(0.6, 0.0, r);

    vec3 col = uTint;
    if (uHasTex > 0.5) {
      col.r = texture2D(uTex, uv + off + dir * split).r;
      col.g = texture2D(uTex, uv + off).g;
      col.b = texture2D(uTex, uv + off - dir * split).b;
    }
    col *= 1.0 + uHover * 0.07 * smoothstep(0.7, 0.0, r);

    vec2 p = (vUv - 0.5) * vec2(1.6, 1.0);
    float sd = sdRoundBox(p, vec2(0.8, 0.5), 0.045);
    float aa = max(fwidth(sd), 1e-4);
    float alpha = 1.0 - smoothstep(-aa, aa, sd);
    float edge = 1.0 - smoothstep(0.0, 0.006, abs(sd + 0.003));
    col = mix(col, vec3(1.0), edge * 0.14);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= alpha * uOpacity;
    gl_FragColor.a = alpha * uOpacity;
  }
`

interface Plane {
  item: FlowItem
  mesh: THREE.Mesh
  uniforms: Record<string, THREE.IUniform>
  hover: number
  mouse: THREE.Vector2
  opacity: number
}

export function createFlow(o: FlowOptions): Flow | null {
  const { canvas, host, items, reduced } = o
  const N = items.length
  if (N === 0) return null

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60)
  const geometry = new THREE.PlaneGeometry(PW, PH, 24, 15)
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const wrap = N >= 3

  const planes: Plane[] = items.map((item) => {
    const uniforms: Record<string, THREE.IUniform> = {
      uTex: { value: null },
      uHasTex: { value: 0 },
      uTint: { value: new THREE.Color().setHSL(item.hue / 360, 0.35, 0.16) },
      uCover: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHover: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    }
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    if (item.src) {
      loader.load(item.src, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        textures.push(tex)
        const img = tex.image as { width: number; height: number }
        const ta = img.width / img.height
        const pa = PW / PH
        ;(uniforms.uCover.value as THREE.Vector2).set(ta > pa ? pa / ta : 1, ta > pa ? 1 : ta / pa)
        uniforms.uTex.value = tex
        uniforms.uHasTex.value = 1
      })
    } else {
      const tex = new THREE.CanvasTexture(drawGeneratedCover(item.title, item.hue))
      tex.colorSpace = THREE.SRGBColorSpace
      textures.push(tex)
      uniforms.uTex.value = tex
      uniforms.uHasTex.value = 1
    }
    return { item, mesh, uniforms, hover: 0, mouse: new THREE.Vector2(0.5, 0.5), opacity: 0 }
  })

  // --- layout ---------------------------------------------------------------
  let width = 1
  let height = 1
  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const t = 2 * Math.tan((camera.fov * Math.PI) / 360)
    // Front plane takes 62% of the width (74% on narrow screens, where the
    // side planes mostly sit off canvas) and at most 78% of the height.
    const frac = camera.aspect < 1.5 ? 0.74 : 0.62
    const dist = Math.max(PW / frac / (t * camera.aspect), PH / 0.78 / t)
    camera.position.z = dist
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  // --- state ----------------------------------------------------------------
  let target = clamp(o.initial, 0, N - 1)
  let cur = target
  let lastFront = -1
  let time = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let disposed = false

  const ndc = new THREE.Vector2()
  let hasPointer = false
  const lean = new THREE.Vector2()
  const leanTarget = new THREE.Vector2()
  const ray = new THREE.Raycaster()

  const front = () => mod(Math.round(target), N)
  const bound = (v: number) => (wrap ? v : clamp(v, 0, N - 1))
  const goTo = (i: number) => {
    const f = mod(i, N)
    if (wrap) {
      const delta = mod(f - mod(Math.round(target), N) + N / 2, N) - N / 2
      target = Math.round(target) + delta
    } else target = f
    if (reduced) cur = target
  }

  const pick = () => {
    if (!hasPointer) return null
    ray.setFromCamera(ndc, camera)
    const meshes = planes.filter((p) => p.mesh.visible && p.opacity > 0.25).map((p) => p.mesh)
    return ray.intersectObjects(meshes, false)[0] ?? null
  }

  // --- input ----------------------------------------------------------------
  let dragging = false
  let startX = 0
  let startTarget = 0
  let moved = 0

  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    hasPointer = true
    leanTarget.set(ndc.x, ndc.y)
  }
  const onDown = (e: PointerEvent) => {
    setNdc(e)
    dragging = true
    startX = e.clientX
    startTarget = target
    moved = 0
    canvas.setPointerCapture(e.pointerId)
    canvas.style.cursor = 'grabbing'
  }
  const onMove = (e: PointerEvent) => {
    setNdc(e)
    if (!dragging) return
    const dx = e.clientX - startX
    moved = Math.max(moved, Math.abs(dx))
    target = bound(startTarget - dx / (width * 0.3))
    if (reduced) cur = target
  }
  const onUp = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer already released */
    }
    if (moved < 6) {
      setNdc(e)
      const hit = pick()
      if (hit) {
        const idx = planes.findIndex((p) => p.mesh === hit.object)
        if (idx === front()) o.onOpen?.(items[idx])
        else goTo(idx)
      }
    } else target = bound(Math.round(target))
    if (reduced) cur = target
  }
  const onLeave = () => {
    if (dragging) return
    hasPointer = false
    leanTarget.set(0, 0)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)

  // --- frame ----------------------------------------------------------------
  const tick = (now: number) => {
    raf = 0
    if (disposed) return
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    time += dt

    cur += (target - cur) * (reduced ? 1 : 1 - Math.exp(-dt * 8))
    lean.lerp(leanTarget, reduced ? 0 : 1 - Math.exp(-dt * 4))
    camera.position.x = lean.x * 0.22
    camera.position.y = lean.y * 0.12
    camera.lookAt(0, 0, 0)

    const f = front()
    if (f !== lastFront) {
      lastFront = f
      o.onChange(f)
    }

    for (let i = 0; i < N; i++) {
      const p = planes[i]
      let off = i - cur
      if (wrap) off = mod(off + N / 2, N) - N / 2
      const a = Math.abs(off)
      const side = Math.sign(off)
      const t = Math.min(a, 1)

      const intro = reduced ? 1 : easeOut(clamp((time - 0.05 - i * 0.07) / 0.9, 0, 1))
      const float = reduced ? 0 : Math.sin(time * 0.8 + i * 1.7) * 0.018 * (1 - t)

      p.mesh.position.set(
        side * (t * 0.98 + Math.max(a - 1, 0) * 0.6),
        float,
        -Math.min(a, 3) * 0.5 - (1 - intro) * 2.4,
      )
      p.mesh.rotation.y = -side * t * 0.6
      p.opacity = clamp(1 - a * 0.26, 0, 1) * intro * (a > 2.7 ? 0 : 1)
      p.mesh.visible = p.opacity > 0.01
      p.mesh.renderOrder = -Math.round(a * 10)
      p.uniforms.uOpacity.value = p.opacity
      p.uniforms.uTime.value = time
    }
    scene.updateMatrixWorld(true)

    // hover: only the plane under the pointer reacts
    const hit = dragging ? null : pick()
    const hitIdx = hit ? planes.findIndex((p) => p.mesh === hit.object) : -1
    for (let i = 0; i < N; i++) {
      const p = planes[i]
      const want = i === hitIdx && !reduced ? 1 : 0
      p.hover += (want - p.hover) * (1 - Math.exp(-dt * 10))
      if (i === hitIdx && hit?.uv) p.mouse.lerp(hit.uv, 1 - Math.exp(-dt * 14))
      p.uniforms.uHover.value = p.hover
      ;(p.uniforms.uMouse.value as THREE.Vector2).copy(p.mouse)
    }
    if (!dragging) canvas.style.cursor = hitIdx >= 0 ? 'pointer' : 'grab'

    renderer.render(scene, camera)
    if (visible && !document.hidden) raf = requestAnimationFrame(tick)
  }
  const start = () => {
    if (!raf && !disposed) {
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }
  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  // Do no work while the stage is off screen or the tab is hidden.
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    },
    { threshold: 0.01 },
  )
  io.observe(host)
  const onVis = () => (document.hidden ? stop() : visible && start())
  document.addEventListener('visibilitychange', onVis)
  start()

  return {
    prev: () => goTo(Math.round(target) - 1),
    next: () => goTo(Math.round(target) + 1),
    goTo,
    dispose() {
      disposed = true
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      geometry.dispose()
      planes.forEach((p) => (p.mesh.material as THREE.Material).dispose())
      textures.forEach((t) => t.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
