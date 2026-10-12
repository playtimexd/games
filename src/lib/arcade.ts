import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { drawGeneratedCover } from './cover'

/**
 * Arcade street. A night street lined with towers, one arcade cabinet per project.
 * Page scroll drives a camera dolly: stop 0 is the street, stop k is cabinet k.
 *
 *  - every cabinet's CRT shows that project's screenshot (attract-mode drift when idle,
 *    full brightness plus a ripple under the cursor when it is the active stop)
 *  - the last cabinet is always a "next game" cabinet, so the street never looks finished
 *  - click the active cabinet to open the project, click another to travel to it
 *
 * Scroll position is read in the render loop; there is no scroll listener and no React
 * state in the per-frame path.
 */

export interface ArcadeItem {
  id: string
  title: string
  src?: string
  hue: number
  /** The always-present final cabinet that stands for the next game. */
  next?: boolean
}

export interface ArcadeOptions {
  canvas: HTMLCanvasElement
  /** The sticky viewport-sized container the canvas lives in. */
  host: HTMLElement
  /** The tall element whose scroll range drives the camera. */
  scroller: HTMLElement
  items: ArcadeItem[]
  reduced: boolean
  quality: 'high' | 'low'
  nextScreen: string[]
  onActive(stop: number): void
  onFrame(t: number): void
  onOpen(itemIndex: number): void
  onQualityDrop?(): void
}

export interface Arcade {
  goTo(stop: number): void
  dispose(): void
}

const SPACING = 7.5
const AMBER = 0xffab2e
const CYAN = 0x2ee6ff
const MAGENTA = 0xff3d9a
const NAVY = 0x05060b

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const rand = (() => {
  let s = 1337
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
})()

// --- procedural textures ------------------------------------------------------

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#080b16'
  g.fillRect(0, 0, 128, 256)
  for (let y = 6; y < 250; y += 12) {
    for (let x = 6; x < 122; x += 10) {
      const r = rand()
      if (r < 0.34) {
        g.fillStyle = r < 0.1 ? '#ffd28a' : r < 0.2 ? '#7fe9ff' : '#ffb06a'
        g.globalAlpha = 0.55 + rand() * 0.45
        g.fillRect(x, y, 6, 7)
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,171,46,0.9)')
  gr.addColorStop(0.4, 'rgba(255,140,30,0.28)')
  gr.addColorStop(1, 'rgba(255,120,20,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function marqueeCanvas(title: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 224
  const g = c.getContext('2d')!
  g.fillStyle = '#0a0a0f'
  g.fillRect(0, 0, 1024, 224)
  const grad = g.createLinearGradient(0, 0, 0, 224)
  grad.addColorStop(0, 'rgba(255,171,46,0.0)')
  grad.addColorStop(1, 'rgba(255,171,46,0.22)')
  g.fillStyle = grad
  g.fillRect(0, 0, 1024, 224)
  let size = 118
  g.font = `italic 700 ${size}px "Chakra Petch", "Geist Variable", system-ui, sans-serif`
  const text = title.toUpperCase()
  while (g.measureText(text).width > 940 && size > 40) {
    size -= 6
    g.font = `italic 700 ${size}px "Chakra Petch", "Geist Variable", system-ui, sans-serif`
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = '#ffab2e'
  g.shadowBlur = 28
  g.fillStyle = '#ffd9a0'
  g.fillText(text, 512, 116)
  g.shadowBlur = 0
  g.fillStyle = '#fff3dc'
  g.fillText(text, 512, 116)
  return c
}

function nextCanvas(lines: string[]): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 420
  const g = c.getContext('2d')!
  g.fillStyle = '#05070c'
  g.fillRect(0, 0, 640, 420)
  g.textBaseline = 'middle'
  g.fillStyle = '#ffab2e'
  g.font = '700 54px "Chakra Petch", system-ui, sans-serif'
  g.fillText(lines[0] ?? 'NEXT GAME', 56, 150)
  g.fillStyle = '#7fe9ff'
  g.font = '500 30px "Chakra Petch", system-ui, sans-serif'
  g.fillText(lines[1] ?? 'IN PROGRESS', 56, 224)
  g.fillStyle = '#ffab2e'
  g.fillRect(56, 268, 26, 40)
  return c
}

// --- shaders ------------------------------------------------------------------

const screenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const screenFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform float uHasTex;
  uniform vec3 uTint;
  uniform vec2 uCover;
  uniform vec2 uMouse;
  uniform float uHover;
  uniform float uActive;
  uniform float uTime;
  uniform float uSeed;

  vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 off = abs(uv.yx) / vec2(7.0, 5.0);
    uv += uv * off * off;
    return uv * 0.5 + 0.5;
  }

  void main() {
    vec2 uv = curve(vUv);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      #include <colorspace_fragment>
      return;
    }

    vec2 drift = vec2(sin(uTime * 0.21 + uSeed) * 0.012, cos(uTime * 0.17 + uSeed) * 0.009) * (1.0 - uActive);
    vec2 tuv = (uv - 0.5) * uCover + 0.5 + drift;

    vec2 dv = uv - uMouse;
    float r = length(dv * vec2(1.5, 1.0));
    float wave = sin(r * 36.0 - uTime * 4.0) * exp(-r * 7.0) * uHover;
    vec2 dir = dv / (length(dv) + 1e-4);
    tuv += dir * wave * 0.012;

    float glitch = step(0.992, fract(sin(floor(uTime * 2.0) * 12.9898 + uSeed) * 43758.5453));
    float split = 0.0016 + glitch * 0.01 + uHover * 0.004;

    vec3 col = uTint;
    if (uHasTex > 0.5) {
      col.r = texture2D(uTex, tuv + vec2(split, 0.0)).r;
      col.g = texture2D(uTex, tuv).g;
      col.b = texture2D(uTex, tuv - vec2(split, 0.0)).b;
    }

    float scan = 0.86 + 0.14 * sin(uv.y * 380.0);
    float mask = 0.94 + 0.06 * sin(uv.x * 900.0);
    float vig = smoothstep(1.0, 0.28, length(uv - 0.5) * 1.3);
    float flick = 0.965 + 0.035 * sin(uTime * 55.0 + uSeed);
    col *= scan * mask * vig * flick;
    col *= mix(0.5, 1.05, uActive);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const floorFrag = /* glsl */ `
  precision highp float;
  varying vec3 vW;
  uniform float uTime;
  uniform vec3 uA;
  uniform vec3 uB;
  void main() {
    vec2 g = vW.xz * 0.9;
    vec2 gr = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
    float line = 1.0 - min(min(gr.x, gr.y), 1.0);
    float d = distance(vW, cameraPosition);
    float fade = 1.0 - smoothstep(4.0, 34.0, d);
    float lane = smoothstep(0.06, 0.0, abs(abs(vW.x) - 2.6)) * 0.7;
    vec3 col = mix(uA, uB, smoothstep(-4.0, 4.0, vW.x));
    float alpha = (line * 0.5 + lane) * fade;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= alpha;
    gl_FragColor.a = alpha;
  }
`

const floorVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const rainVert = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  varying float vA;
  void main() {
    vec3 p = position;
    float fall = mod(p.y - uTime * (9.0 + aSeed * 5.0), 14.0);
    p.y = fall - 1.0 - (position.y - floor(position.y));
    vA = 0.18 + aSeed * 0.3;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const rainFrag = /* glsl */ `
  precision highp float;
  varying float vA;
  void main() {
    gl_FragColor = vec4(0.5, 0.9, 1.0, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= vA;
    gl_FragColor.a = vA;
  }
`

// --- engine -------------------------------------------------------------------

interface Cab {
  group: THREE.Group
  screenU: Record<string, THREE.IUniform>
  screen: THREE.Mesh
  hover: number
  mouse: THREE.Vector2
  x: number
  z: number
}

export function createArcade(o: ArcadeOptions): Arcade | null {
  const { canvas, host, scroller, items } = o
  const M = items.length
  if (M === 0) return null
  const S = M + 1
  let quality = o.quality
  const reduced = o.reduced

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  const dprCap = quality === 'high' ? 1.5 : 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap))
  renderer.setClearColor(NAVY, 1)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(NAVY)
  scene.fog = new THREE.FogExp2(NAVY, 0.032)
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 140)

  const disposables: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d)

  // lights: ambient + two colored fills riding with the camera
  scene.add(new THREE.HemisphereLight(0x6f8fff, 0x120a1c, 0.9))
  const fillA = new THREE.PointLight(AMBER, 14, 12, 1.6)
  const fillB = new THREE.PointLight(CYAN, 9, 14, 1.6)
  scene.add(fillA, fillB)

  // --- buildings ---------------------------------------------------------------
  const winTex = track(windowTexture())
  const lastZ = -(M * SPACING) - 46
  const neonColors = [CYAN, MAGENTA, AMBER]
  for (const side of [-1, 1]) {
    let z = 18
    while (z > lastZ) {
      const w = 5 + rand() * 4
      const h = 9 + rand() * 20
      const d = 6 + rand() * 4
      const x = side * (6.2 + rand() * 2.6 + w / 2)
      const geo = new THREE.BoxGeometry(w, h, d)
      const uv = geo.attributes.uv as THREE.BufferAttribute
      const rx = Math.max(1, Math.round(w * 0.55))
      const ry = Math.max(2, Math.round(h * 0.5))
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry)
      const mat = new THREE.MeshBasicMaterial({
        map: winTex,
        color: new THREE.Color().setHSL(0.6 + rand() * 0.1, 0.35, 0.34 + rand() * 0.2),
      })
      const b = new THREE.Mesh(geo, track(mat))
      track(geo)
      b.position.set(x, h / 2 - 0.1, z)
      scene.add(b)

      // a vertical neon trim on the street-facing edge
      if (rand() < 0.7) {
        const c = neonColors[Math.floor(rand() * 3)]
        const trimGeo = new THREE.BoxGeometry(0.12, h * (0.55 + rand() * 0.4), 0.12)
        const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.6), toneMapped: false })
        const trim = new THREE.Mesh(trimGeo, track(trimMat))
        track(trimGeo)
        trim.position.set(x - side * (w / 2 + 0.06), h * 0.45, z + d / 2 - 0.2)
        scene.add(trim)
      }
      // a wide sign bar
      if (rand() < 0.45) {
        const c = neonColors[Math.floor(rand() * 3)]
        const sw = 1.6 + rand() * 2.4
        const signGeo = new THREE.BoxGeometry(0.12, 0.5 + rand() * 0.6, sw)
        const signMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.5), toneMapped: false })
        const sign = new THREE.Mesh(signGeo, track(signMat))
        track(signGeo)
        sign.position.set(x - side * (w / 2 + 0.1), 3 + rand() * 6, z - 1)
        scene.add(sign)
      }
      z -= d + 0.4
    }
  }

  // --- floor -------------------------------------------------------------------
  const floorGeo = track(new THREE.PlaneGeometry(40, -lastZ + 60))
  floorGeo.rotateX(-Math.PI / 2)
  const floorMat = track(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uA: { value: new THREE.Color(CYAN) },
        uB: { value: new THREE.Color(MAGENTA) },
      },
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    }),
  )
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.position.set(0, 0, (lastZ - 18) / 2 + 12)
  scene.add(floor)
  // dark road surface under the grid
  const roadGeo = track(new THREE.PlaneGeometry(40, -lastZ + 60))
  roadGeo.rotateX(-Math.PI / 2)
  const road = new THREE.Mesh(roadGeo, track(new THREE.MeshBasicMaterial({ color: 0x03040a })))
  road.position.set(0, -0.02, floor.position.z)
  scene.add(road)

  // --- rain --------------------------------------------------------------------
  let rain: THREE.LineSegments | null = null
  const rainMat = track(
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: rainVert,
      fragmentShader: rainFrag,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    }),
  )
  if (quality === 'high') {
    const R = 420
    const p = new Float32Array(R * 6)
    const s = new Float32Array(R * 2)
    for (let i = 0; i < R; i++) {
      const x = (rand() - 0.5) * 22
      const y = rand() * 14
      const z = -rand() * 26
      p.set([x, y, z, x, y + 0.45, z], i * 6)
      s[i * 2] = s[i * 2 + 1] = rand()
    }
    const g = track(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1))
    rain = new THREE.LineSegments(g, rainMat)
    rain.frustumCulled = false
    scene.add(rain)
  }

  // --- cabinets ----------------------------------------------------------------
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.5, metalness: 0.35 }))
  const darkMat = track(new THREE.MeshStandardMaterial({ color: 0x0a0c13, roughness: 0.7, metalness: 0.2 }))
  const neonMat = track(
    new THREE.MeshBasicMaterial({ color: new THREE.Color(AMBER).multiplyScalar(1.7), toneMapped: false }),
  )
  const glowTex = track(glowTexture())
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const marquees: { tex: THREE.CanvasTexture; title: string }[] = []
  const box = (w: number, h: number, d: number) => track(new THREE.BoxGeometry(w, h, d))

  const cabs: Cab[] = items.map((item, i) => {
    const group = new THREE.Group()
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.rotation.x = rx
      m.userData.cab = i
      group.add(m)
      return m
    }
    const W = 1.0
    const D = 0.9
    add(box(W, 0.95, D), bodyMat, 0, 0.475, 0)
    add(box(W, 0.1, 0.5), darkMat, 0, 1.0, D / 2 + 0.04, 0.22)
    add(box(W, 0.98, 0.64), bodyMat, 0, 1.5, -0.13)
    add(box(W + 0.04, 0.05, 0.72), darkMat, 0, 2.33, -0.1)
    add(box(W, 0.28, 0.66), darkMat, 0, 2.17, -0.1)

    // screen
    const tint = new THREE.Color().setHSL(item.hue / 360, 0.35, 0.12)
    const u: Record<string, THREE.IUniform> = {
      uTex: { value: null },
      uHasTex: { value: 0 },
      uTint: { value: tint },
      uCover: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHover: { value: 0 },
      uActive: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: i * 7.31 },
    }
    const screenMat = track(
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: screenVert, fragmentShader: screenFrag }),
    )
    const screen = add(track(new THREE.PlaneGeometry(0.86, 0.62, 1, 1)), screenMat, 0, 1.52, 0.26, -0.12)

    // glowing frame around the screen
    const t = 0.028
    add(box(0.92, t, t), neonMat, 0, 1.52 + 0.33, 0.275, -0.12)
    add(box(0.92, t, t), neonMat, 0, 1.52 - 0.33, 0.275, -0.12)
    add(box(t, 0.68, t), neonMat, 0.46, 1.52, 0.275, -0.12)
    add(box(t, 0.68, t), neonMat, -0.46, 1.52, 0.275, -0.12)

    // front corner tubes
    add(box(0.03, 0.95, 0.03), neonMat, W / 2, 0.475, D / 2)
    add(box(0.03, 0.95, 0.03), neonMat, -W / 2, 0.475, D / 2)
    add(box(W, 0.03, 0.03), neonMat, 0, 0.03, D / 2)

    // marquee
    const mc = marqueeCanvas(item.next ? 'NEXT GAME' : item.title)
    const mtex = track(new THREE.CanvasTexture(mc))
    mtex.colorSpace = THREE.SRGBColorSpace
    marquees.push({ tex: mtex, title: item.next ? 'NEXT GAME' : item.title })
    const mm = new THREE.Mesh(
      track(new THREE.PlaneGeometry(W - 0.06, 0.24)),
      track(new THREE.MeshBasicMaterial({ map: mtex, toneMapped: false })),
    )
    mm.position.set(0, 2.17, 0.24)
    mm.userData.cab = i
    group.add(mm)

    // controls
    const stick = add(track(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8)), darkMat, -0.2, 1.12, D / 2 + 0.02)
    stick.rotation.x = 0.1
    add(track(new THREE.SphereGeometry(0.04, 12, 10)), track(new THREE.MeshStandardMaterial({ color: 0xff3d3d, roughness: 0.4 })), -0.2, 1.2, D / 2 + 0.01)
    const btn = [AMBER, CYAN, MAGENTA]
    btn.forEach((c, k) => {
      const m = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.4), toneMapped: false }))
      const b = add(track(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 14)), m, 0.02 + k * 0.13, 1.065, D / 2 + 0.06, 0.22)
      b.userData.cab = i
    })

    // light pool
    const pool = new THREE.Mesh(
      track(new THREE.PlaneGeometry(3.4, 3.4)),
      track(
        new THREE.MeshBasicMaterial({
          map: glowTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0.32,
          toneMapped: false,
        }),
      ),
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(0, 0.015, 0.7)
    group.add(pool)

    const x = (i % 2 === 0 ? 1 : -1) * 1.5
    const z = -(i + 1) * SPACING
    group.position.set(x, 0, z)
    group.rotation.y = (i % 2 === 0 ? -1 : 1) * 0.22
    scene.add(group)

    // screen content
    const setTex = (tex: THREE.Texture, w: number, h: number) => {
      tex.colorSpace = THREE.SRGBColorSpace
      textures.push(tex)
      const ta = w / h
      const pa = 0.86 / 0.62
      ;(u.uCover.value as THREE.Vector2).set(ta > pa ? pa / ta : 1, ta > pa ? 1 : ta / pa)
      u.uTex.value = tex
      u.uHasTex.value = 1
    }
    if (item.next) {
      const c = nextCanvas(o.nextScreen)
      setTex(new THREE.CanvasTexture(c), c.width, c.height)
    } else if (item.src) {
      loader.load(item.src, (tex) => {
        const img = tex.image as { width: number; height: number }
        setTex(tex, img.width, img.height)
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      })
    } else {
      const c = drawGeneratedCover(item.title, item.hue)
      setTex(new THREE.CanvasTexture(c), c.width, c.height)
    }

    return { group, screenU: u, screen, hover: 0, mouse: new THREE.Vector2(0.5, 0.5), x, z }
  })

  // marquees use the display face; redraw once it has loaded
  document.fonts
    ?.load('italic 700 60px "Chakra Petch"')
    .then(() => {
      marquees.forEach((m) => {
        const c = m.tex.image as HTMLCanvasElement
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
        c.getContext('2d')!.drawImage(marqueeCanvas(m.title), 0, 0)
        m.tex.needsUpdate = true
      })
    })
    .catch(() => undefined)

  // --- camera stops ------------------------------------------------------------
  const stops: { pos: THREE.Vector3; look: THREE.Vector3 }[] = [
    { pos: new THREE.Vector3(0, 1.75, 7.5), look: new THREE.Vector3(0, 1.6, -14) },
    ...cabs.map((c) => ({
      pos: new THREE.Vector3(c.x - 0.5, 1.55, c.z + 3.7),
      look: new THREE.Vector3(c.x + 0.2, 1.45, c.z),
    })),
  ]

  // --- post --------------------------------------------------------------------
  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null = null
  const setupComposer = () => {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.5, 0.9)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }
  if (quality === 'high') setupComposer()

  // --- size --------------------------------------------------------------------
  let width = 1
  let height = 1
  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    composer?.setSize(width, height)
    camera.aspect = width / height
    camera.fov = camera.aspect < 0.8 ? 72 : camera.aspect < 1.3 ? 58 : 46
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  // --- state & input -----------------------------------------------------------
  let t = 0
  let time = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let disposed = false
  let activeStop = -1
  const ndc = new THREE.Vector2()
  let hasPointer = false
  const lean = new THREE.Vector2()
  const leanTarget = new THREE.Vector2()
  const ray = new THREE.Raycaster()
  let frames = 0
  let frameSum = 0

  const scrollMax = () => Math.max(scroller.offsetHeight - window.innerHeight, 1)
  const goTo = (stop: number) => {
    const top = scroller.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: top + (clamp(stop, 0, S - 1) / (S - 1)) * scrollMax(),
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    hasPointer = true
    leanTarget.set(ndc.x, ndc.y)
  }
  const cabAt = () => {
    if (!hasPointer) return null
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(
      cabs.map((c) => c.group),
      true,
    )[0]
    if (!hit) return null
    return { idx: hit.object.userData.cab as number, uv: hit.uv, object: hit.object }
  }
  let downX = 0
  let downY = 0
  const onDown = (e: PointerEvent) => {
    downX = e.clientX
    downY = e.clientY
    setNdc(e)
  }
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return
    setNdc(e)
    const hit = cabAt()
    if (!hit || hit.idx === undefined) return
    if (hit.idx + 1 === activeStop) {
      if (!items[hit.idx].next) o.onOpen(hit.idx)
    } else goTo(hit.idx + 1)
  }
  const onMove = (e: PointerEvent) => setNdc(e)
  const onLeave = () => {
    hasPointer = false
    leanTarget.set(0, 0)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  const dropQuality = () => {
    if (quality === 'low') return
    quality = 'low'
    composer = null
    bloom = null
    if (rain) rain.visible = false
    renderer.setPixelRatio(1)
    resize()
    o.onQualityDrop?.()
  }

  // --- frame -------------------------------------------------------------------
  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()

  const tick = (now: number) => {
    raf = 0
    if (disposed) return
    const rawDt = Math.max((now - last) / 1000, 0)
    const dt = Math.min(rawDt, 0.05)
    last = now
    time += dt

    // auto quality: a slow machine drops bloom and rain after the first second or so
    if (quality === 'high' && frames < 100 && time > 0.8) {
      frames++
      frameSum += rawDt
      if (frames === 100 && frameSum / frames > 0.032) dropQuality()
    }

    const r = scroller.getBoundingClientRect()
    const p = clamp(-r.top / scrollMax(), 0, 1)
    const tTarget = p * (S - 1)
    t += (tTarget - t) * (reduced ? 1 : 1 - Math.exp(-dt * 5.5))
    t = clamp(t, 0, S - 1)

    const k = clamp(Math.floor(t), 0, S - 2)
    const f = t - k
    const e = smooth(0.12, 0.88, f)
    camPos.lerpVectors(stops[k].pos, stops[k + 1].pos, e)
    camLook.lerpVectors(stops[k].look, stops[k + 1].look, e)
    lean.lerp(leanTarget, reduced ? 0 : 1 - Math.exp(-dt * 4))
    const sway = reduced ? 0 : Math.sin(time * 0.6) * 0.018
    camera.position.set(camPos.x + lean.x * 0.22, camPos.y + sway + lean.y * 0.1, camPos.z)
    camera.lookAt(camLook.x + lean.x * 0.14, camLook.y + lean.y * 0.07, camLook.z)

    fillA.position.set(camera.position.x + 1.2, 2.2, camera.position.z - 2)
    fillB.position.set(camera.position.x - 2.4, 1.2, camera.position.z - 5)
    if (rain) rain.position.set(camera.position.x, 0, camera.position.z + 4)
    ;(rainMat.uniforms.uTime as THREE.IUniform).value = reduced ? 0 : time
    ;(floorMat.uniforms.uTime as THREE.IUniform).value = time

    const stop = Math.round(t)
    if (stop !== activeStop) {
      activeStop = stop
      o.onActive(stop)
    }
    o.onFrame(t)

    // cursor ripple only on the active cabinet
    const hit = cabAt()
    for (let i = 0; i < M; i++) {
      const c = cabs[i]
      const active = clamp(1 - Math.abs(t - (i + 1)) * 1.3, 0, 1)
      const over = hit && hit.idx === i && hit.object === c.screen && !reduced
      c.hover += ((over ? 1 : 0) - c.hover) * (1 - Math.exp(-dt * 9))
      if (over && hit?.uv) c.mouse.lerp(hit.uv, 1 - Math.exp(-dt * 14))
      c.screenU.uActive.value = active
      c.screenU.uHover.value = c.hover * active
      c.screenU.uTime.value = time
      ;(c.screenU.uMouse.value as THREE.Vector2).copy(c.mouse)
    }
    canvas.style.cursor = hit && hit.idx + 1 === activeStop && !items[hit.idx].next ? 'pointer' : 'default'

    if (composer) composer.render()
    else renderer.render(scene, camera)
    if (visible && !document.hidden) raf = requestAnimationFrame(tick)
  }
  const start = () => {
    if (!raf && !disposed) {
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }
  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stopLoop()
    },
    { threshold: 0.01 },
  )
  io.observe(host)
  const onVis = () => (document.hidden ? stopLoop() : visible && start())
  document.addEventListener('visibilitychange', onVis)
  start()

  return {
    goTo,
    dispose() {
      disposed = true
      stopLoop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      disposables.forEach((d) => d.dispose())
      textures.forEach((x) => x.dispose())
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
