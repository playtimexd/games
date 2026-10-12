import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { drawGeneratedCover } from './cover'

/**
 * A row of game cartridges floating in the dark. That is the whole interaction:
 *  - move the mouse and the row drifts, the cartridge under the cursor lifts and tilts to it
 *  - click it and the camera moves into its label, then the project opens
 *
 * One cartridge per project, plus a blank one at the end for the next game.
 */

export interface CartItem {
  id: string
  title: string
  src?: string
  hue: number
  next?: boolean
}

export interface CartOptions {
  canvas: HTMLCanvasElement
  host: HTMLElement
  items: CartItem[]
  reduced: boolean
  onHover(index: number): void
  onOpening(index: number): void
  onOpen(index: number): void
}

export interface Carts {
  focus(index: number): void
  open(index: number): void
  dispose(): void
}

const W = 1.0
const H = 1.16
const GAP = 1.42
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function cartShape(): THREE.Shape {
  const r = 0.08
  const hw = W / 2
  const hh = H / 2
  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.quadraticCurveTo(hw, -hh, hw, -hh + r)
  s.lineTo(hw, hh - 0.2)
  s.lineTo(hw - 0.2, hh)
  s.lineTo(-hw + r, hh)
  s.quadraticCurveTo(-hw, hh, -hw, hh - r)
  s.lineTo(-hw, -hh + r)
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return s
}

function blankArt(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 480
  const g = c.getContext('2d')!
  g.fillStyle = '#0d0912'
  g.fillRect(0, 0, 640, 480)
  g.strokeStyle = 'rgba(255,122,69,0.55)'
  g.lineWidth = 6
  g.setLineDash([18, 12])
  g.strokeRect(24, 24, 592, 432)
  g.fillStyle = '#ff7a45'
  g.font = '700 230px "Barlow Condensed", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('?', 320, 252)
  return c
}

export function createCartridges(o: CartOptions): Carts | null {
  const { canvas, host, items, reduced } = o
  const N = items.length
  if (N === 0) return null

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60)
  const disposables: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d)

  // soft reflections on the plastic
  const pmrem = track(new THREE.PMREMGenerator(renderer))
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  scene.environmentIntensity = 0.7

  scene.add(new THREE.HemisphereLight(0xffe2cc, 0x241430, 0.55))
  const key = new THREE.DirectionalLight(0xffd2a8, 2.6)
  key.position.set(-3, 4, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9ab8ff, 2.2)
  rim.position.set(4, 2, -4)
  scene.add(rim)

  // --- cartridges --------------------------------------------------------------------
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const bodyGeo = (() => {
    const g = new THREE.ExtrudeGeometry(cartShape(), {
      depth: 0.13,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 4,
      curveSegments: 10,
    })
    g.translate(0, 0, -0.065)
    return track(g)
  })()
  const frameGeo = track(new THREE.BoxGeometry(0.86, 0.66, 0.012))
  const labelGeo = track(new THREE.PlaneGeometry(0.8, 0.6))
  const ridgeGeo = track(new THREE.BoxGeometry(0.66, 0.022, 0.02))
  const pinsGeo = track(new THREE.BoxGeometry(0.72, 0.09, 0.05))
  const frameMat = track(new THREE.MeshStandardMaterial({ color: 0x120e18, roughness: 0.6 }))
  const pinsMat = track(new THREE.MeshStandardMaterial({ color: 0xcfcbd8, roughness: 0.28, metalness: 0.9 }))
  const shadowTex = track(
    (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const g = c.getContext('2d')!
      const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62)
      gr.addColorStop(0, 'rgba(0,0,0,0.75)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 128, 128)
      return new THREE.CanvasTexture(c)
    })(),
  )

  interface Cart {
    group: THREE.Group
    shadow: THREE.Mesh
    lift: number
    tx: number
    ty: number
    homeX: number
  }
  const row = new THREE.Group()
  scene.add(row)
  const carts: Cart[] = items.map((it, i) => {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      bodyGeo,
      track(
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color().setHSL(it.hue / 360, 0.3, 0.13),
          roughness: 0.42,
          metalness: 0.05,
          clearcoat: 0.8,
          clearcoatRoughness: 0.22,
        }),
      ),
    )
    group.add(body)
    body.userData.i = i

    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.position.set(0, -0.1, 0.09)
    group.add(frame)

    const tex = new THREE.Texture()
    tex.colorSpace = THREE.SRGBColorSpace
    textures.push(tex)
    const labelMat = track(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 }))
    const label = new THREE.Mesh(labelGeo, labelMat)
    label.position.set(0, -0.1, 0.1)
    group.add(label)
    label.userData.i = i

    const fill = (img: CanvasImageSource & { width: number; height: number }) => {
      ;(tex as unknown as { image: unknown }).image = img
      const ta = img.width / img.height
      const pa = 0.8 / 0.6
      if (ta > pa) tex.repeat.set(pa / ta, 1)
      else tex.repeat.set(1, ta / pa)
      tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2)
      tex.anisotropy = 4
      tex.needsUpdate = true
    }
    if (it.next) fill(blankArt())
    else if (it.src) {
      loader.load(
        it.src,
        (t) => {
          fill(t.image as HTMLImageElement)
          t.dispose()
        },
        undefined,
        () => fill(drawGeneratedCover(it.title, it.hue)),
      )
    } else fill(drawGeneratedCover(it.title, it.hue))

    for (let k = 0; k < 5; k++) {
      const ridge = new THREE.Mesh(ridgeGeo, frameMat)
      ridge.position.set(0, 0.34 + k * 0.045, 0.09)
      group.add(ridge)
    }
    const pins = new THREE.Mesh(pinsGeo, pinsMat)
    pins.position.set(0, -H / 2 - 0.01, 0)
    group.add(pins)

    const homeX = (i - (N - 1) / 2) * GAP
    group.position.set(homeX, 0, 0)
    row.add(group)

    const shadow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.5, 0.55)),
      track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(homeX, -0.92, 0)
    row.add(shadow)
    return { group, shadow, lift: 0, tx: 0, ty: 0, homeX }
  })

  // floating dust
  const dustGeo = track(new THREE.BufferGeometry())
  const dp = new Float32Array(120 * 3)
  for (let i = 0; i < 120; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 18
    dp[i * 3 + 1] = (Math.random() - 0.5) * 6
    dp[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3))
  const dust = new THREE.Points(
    dustGeo,
    track(new THREE.PointsMaterial({ color: 0xffd9bf, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false })),
  )
  scene.add(dust)

  // --- size and framing ----------------------------------------------------------------
  const rowWidth = (N - 1) * GAP + W
  let width = 1
  let height = 1
  let visW = 6
  let maxShift = 0
  let camZ = 6
  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    const aspect = width / height
    camera.aspect = aspect
    camera.fov = aspect < 0.8 ? 46 : 36
    // wide screens show the whole row when it fits, narrow screens show about two and a half
    visW = aspect < 0.8 ? 3.6 : aspect < 1.2 ? 5.0 : clamp(rowWidth + 1.1, 5.4, 8.6)
    camZ = visW / (2 * Math.tan((camera.fov * Math.PI) / 360) * aspect)
    maxShift = Math.max(0, rowWidth / 2 + 0.7 - visW / 2)
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  // --- input -----------------------------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hasPointer = false
  let hover = -1
  let focusIdx = -1
  let shift = 0
  let shiftTarget = 0
  let drag: { x: number; start: number; moved: number } | null = null
  let downX = 0
  let downY = 0
  let opening: { i: number; t: number } | null = null
  const bodies = carts.flatMap((c) => c.group.children.filter((m) => m.userData.i !== undefined))

  const pick = () => {
    if (!hasPointer) return -1
    ray.setFromCamera(ndc, camera)
    const h = ray.intersectObjects(bodies, false)[0]
    return h ? (h.object.userData.i as number) : -1
  }
  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    hasPointer = true
  }
  const onDown = (e: PointerEvent) => {
    setNdc(e)
    downX = e.clientX
    downY = e.clientY
    drag = { x: e.clientX, start: shiftTarget, moved: 0 }
    if (e.pointerType === 'touch') canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    setNdc(e)
    if (e.pointerType === 'mouse' && !drag) {
      // the mouse position pans the row when it is wider than the screen
      shiftTarget = clamp(-ndc.x * maxShift, -maxShift, maxShift)
    }
    if (drag && e.pointerType === 'touch') {
      const dx = e.clientX - drag.x
      drag.moved = Math.max(drag.moved, Math.abs(dx))
      shiftTarget = clamp(drag.start + (dx / width) * visW, -maxShift, maxShift)
    }
  }
  const onUp = (e: PointerEvent) => {
    const d = drag
    drag = null
    if (opening) return
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return
    setNdc(e)
    const i = pick()
    if (i < 0) return
    if (e.pointerType === 'touch' && focusIdx !== i) {
      // on touch the first tap shows which one it is, the second opens it
      focusIdx = i
      o.onHover(i)
      return
    }
    if (!items[i].next) startOpen(i)
    void d
  }
  const onLeave = () => {
    hasPointer = false
    hover = -1
    if (!drag) shiftTarget *= 1
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointerleave', onLeave)

  const startOpen = (i: number) => {
    if (opening) return
    opening = { i, t: 0 }
    o.onOpening(i)
  }

  // --- frame -------------------------------------------------------------------------------
  let time = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let disposed = false
  let manual = false
  const camPos = new THREE.Vector3(0, 0.2, camZ * 1.5)
  const tmp = new THREE.Vector3()
  const startFov = camera.fov

  const tick = (now: number) => {
    raf = 0
    if (disposed) return
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05)
    last = now
    time += dt
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6)

    shift += (shiftTarget - shift) * (reduced ? 1 : 1 - Math.exp(-dt * 4))
    row.position.x = shift

    if (!opening) {
      const h = pick()
      if (h !== hover) {
        hover = h
        if (h >= 0) {
          focusIdx = h
          o.onHover(h)
        }
      }
      canvas.style.cursor = hover >= 0 && !items[hover].next ? 'pointer' : 'default'
    }

    for (let i = 0; i < N; i++) {
      const c = carts[i]
      const on = i === (opening ? opening.i : hover)
      const want = on ? 1 : 0
      c.lift += (want - c.lift) * k
      // tilt toward the pointer, measured from the cartridge's own screen position
      tmp.set(c.homeX + shift, 0, 0).project(camera)
      const tx = on && hasPointer && !opening ? clamp((ndc.y - tmp.y) * 0.5, -0.4, 0.4) : 0
      const ty = on && hasPointer && !opening ? clamp((ndc.x - tmp.x) * 0.9, -0.55, 0.55) : 0
      c.tx += (tx - c.tx) * k
      c.ty += (ty - c.ty) * k
      const fl = reduced ? 0 : Math.sin(time * 0.8 + i * 1.3) * 0.035
      const away = opening && opening.i !== i ? Math.min(opening.t / 0.7, 1) : 0
      c.group.position.set(c.homeX, fl + c.lift * 0.16 - away * 0.4, c.lift * 0.75 - away * 1.2)
      c.group.rotation.set(-c.tx, c.ty - (c.homeX + shift) * 0.035, 0)
      c.group.scale.setScalar(1 + c.lift * 0.05 - away * 0.12)
      c.shadow.position.set(c.homeX, -0.92 - 0.05 * c.lift, c.lift * 0.4)
      ;(c.shadow.material as THREE.MeshBasicMaterial).opacity = 1 - c.lift * 0.35 - away * 0.7
    }

    // camera: drifts a little with the pointer, or dives into a label when opening
    const lx = hasPointer && !reduced && !opening ? ndc.x : 0
    const ly = hasPointer && !reduced && !opening ? ndc.y : 0
    if (opening) {
      opening.t += dt
      const c = carts[opening.i]
      const p = smooth(0, 0.8, opening.t)
      tmp.set(c.homeX + shift, 0.05, 0.75)
      camPos.lerp(new THREE.Vector3(tmp.x, tmp.y - 0.1, 1.9), 1 - Math.exp(-dt * 6))
      camera.position.copy(camPos)
      camera.lookAt(tmp.x, -0.1, 0.5)
      camera.fov = startFov - p * 6
      camera.updateProjectionMatrix()
      if (opening.t > 0.85) {
        const i = opening.i
        opening = null
        o.onOpen(i)
      }
    } else {
      camPos.x += (lx * 0.45 - camPos.x) * (1 - Math.exp(-dt * 3))
      camPos.y += (0.15 + ly * 0.25 - camPos.y) * (1 - Math.exp(-dt * 3))
      camPos.z += (camZ - camPos.z) * (reduced ? 1 : 1 - Math.exp(-dt * 2.4))
      camera.position.copy(camPos)
      camera.lookAt(camPos.x * 0.3, -0.05, 0)
      if (Math.abs(camera.fov - startFov) > 0.01) {
        camera.fov = startFov
        camera.updateProjectionMatrix()
      }
    }
    dust.rotation.y = reduced ? 0 : time * 0.01
    dust.position.y = reduced ? 0 : Math.sin(time * 0.2) * 0.15

    renderer.render(scene, camera)
    if (!manual && visible && !document.hidden) raf = requestAnimationFrame(tick)
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
  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else stop()
    },
    { threshold: 0.01 },
  )
  io.observe(host)
  const onVis = () => (document.hidden ? stop() : visible && start())
  document.addEventListener('visibilitychange', onVis)
  if (reduced) camPos.set(0, 0.15, camZ)
  start()

  const api: Carts = {
    focus(i) {
      hover = i
      focusIdx = i
    },
    open(i) {
      if (!items[i]?.next) startOpen(i)
    },
    dispose() {
      disposed = true
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      disposables.forEach((d) => d.dispose())
      textures.forEach((t) => t.dispose())
      env.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }

  // dev only: run frames without waiting for animation frames, for tests in a hidden tab
  if (import.meta.env.DEV) {
    ;(window as unknown as { __CARTS__: unknown }).__CARTS__ = {
      ...api,
      advance: (sec: number) => {
        manual = true
        stop()
        for (let t = 0; t < sec; t += 1 / 60) tick(last + 1000 / 60)
        manual = false
        start()
      },
    }
  }
  return api
}
