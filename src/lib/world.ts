import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { drawGeneratedCover } from './cover'
import type { MapLayout, Spot } from './layout'

/**
 * Campaign map. A hex-tile battlefield with one base per project.
 *
 *  - tiles near a base or the supply line are "explored" and lit; everything else sinks
 *    into fog of war, so the map visibly continues past the last project
 *  - a base is a plinth whose shape says what it is (tower, block, prism, core) with a
 *    floating holo screen of the project and a beam linking the two
 *  - a pulse ring leaves the selected base across the tiles; the hovered tile lights up
 *
 * Camera: drag to orbit, right-drag or shift-drag to pan, ctrl+wheel or pinch to zoom.
 * Plain wheel is left alone so the page still scrolls. Click a base to select it, click
 * the selected base to open it.
 */

export interface WorldOptions {
  canvas: HTMLCanvasElement
  host: HTMLElement
  layout: MapLayout
  selected: number
  reduced: boolean
  quality: 'high' | 'low'
  onSelect(index: number): void
  onOpen(index: number): void
  onHover(index: number): void
  onQualityDrop?(): void
}

export interface World {
  select(index: number): void
  overview(): void
  zoom(factor: number): void
  panTo(x: number, z: number): void
  dispose(): void
}

const R = 1.0
const STEP_X = 1.5 * R
const STEP_Z = Math.sqrt(3) * R
const ACCENT = 0x4fd8ff
const BG = 0x05080b

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const fract = (x: number) => x - Math.floor(x)
const hash2 = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453)
const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax
  const abz = bz - az
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1), 0, 1)
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

// --- shaders -------------------------------------------------------------------

const tileVert = /* glsl */ `
  attribute vec2 aLocal;
  attribute vec2 aCenter;
  attribute vec3 aInfo; // known, road, seed
  attribute float aSide;
  varying vec2 vLocal;
  varying vec2 vCenter;
  varying vec3 vInfo;
  varying float vSide;
  varying vec3 vW;
  void main() {
    vLocal = aLocal;
    vCenter = aCenter;
    vInfo = aInfo;
    vSide = aSide;
    vW = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const tileFrag = /* glsl */ `
  precision highp float;
  varying vec2 vLocal;
  varying vec2 vCenter;
  varying vec3 vInfo;
  varying float vSide;
  varying vec3 vW;
  uniform float uTime;
  uniform vec3 uAccent;
  uniform vec3 uFog;
  uniform vec2 uHover;
  uniform float uHoverOn;
  uniform vec2 uSel;
  uniform float uSelOn;
  uniform float uPulse;

  void main() {
    float known = vInfo.x;
    float road = vInfo.y;
    float seed = vInfo.z;

    float d = max(max(abs(vLocal.y), abs(dot(vLocal, vec2(0.8660254, 0.5)))), abs(dot(vLocal, vec2(-0.8660254, 0.5))));
    float edge = smoothstep(0.76, 0.84, d);

    vec3 base = mix(vec3(0.020, 0.032, 0.044), vec3(0.050, 0.084, 0.110), known) + seed * 0.012;
    vec3 col = base;
    col += uAccent * edge * mix(0.09, 0.26, known);

    // supply line: dashes travelling toward the unexplored edge
    float flow = 0.5 + 0.5 * sin(vCenter.x * 0.9 - uTime * 2.2);
    col += uAccent * road * (0.3 + 0.32 * flow) * (0.45 + edge);

    // fog of war shimmer
    col += uAccent * (1.0 - known) * 0.012 * (0.5 + 0.5 * sin(uTime * 1.3 + seed * 40.0));

    float rr = distance(vCenter, uSel);
    float ring = smoothstep(0.9, 0.0, abs(rr - uPulse * 16.0)) * (1.0 - uPulse) * uSelOn;
    col += uAccent * ring * (0.35 + edge * 0.6);
    col += uAccent * (1.0 - smoothstep(0.0, 3.4, rr)) * 0.09 * uSelOn * known;

    float hv = (1.0 - smoothstep(0.0, 0.08, distance(vCenter, uHover))) * uHoverOn;
    col += uAccent * hv * (0.22 + edge * 0.6);

    col = mix(col, base * 0.6, smoothstep(0.8, 6.0, vW.y) * (1.0 - edge));
    col += uAccent * 0.05 * smoothstep(1.0, 7.0, vW.y) * edge * 4.0;
    if (vSide > 0.5) {
      float t = smoothstep(-1.4, 7.0, vW.y);
      col = base * 0.12 + uAccent * (0.008 + 0.05 * t * t);
    }

    float dist = distance(vW, cameraPosition);
    col = mix(col, uFog, smoothstep(32.0, 130.0, dist) * 0.92);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const holoVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const holoFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform float uHasTex;
  uniform vec3 uTint;
  uniform vec3 uAccent;
  uniform vec2 uCover;
  uniform float uSel;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;

  void main() {
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    float jitter = step(0.994, fract(sin(floor(uTime * 3.0) * 78.233 + uSeed) * 43758.5453)) * 0.012;
    vec3 col = uTint;
    if (uHasTex > 0.5) {
      col.r = texture2D(uTex, uv + vec2(jitter + 0.0015, 0.0)).r;
      col.g = texture2D(uTex, uv).g;
      col.b = texture2D(uTex, uv - vec2(jitter + 0.0015, 0.0)).b;
    }
    float scan = 0.82 + 0.18 * sin(vUv.y * 260.0 - uTime * 2.0);
    col *= scan;
    col = mix(col * 0.7, col * 1.15, uSel);
    col = mix(col, col * 0.4 + uAccent * 0.25, 0.18);

    // corner brackets in place of a solid border
    vec2 e = min(vUv, 1.0 - vUv);
    float bx = step(e.x, 0.012) * step(e.y, 0.14);
    float by = step(e.y, 0.02) * step(e.x, 0.1);
    float br = max(bx, by);
    col = mix(col, uAccent * 1.4, br);

    float fade = smoothstep(0.0, 0.05, e.x) * smoothstep(0.0, 0.05, e.y);
    float a = max(fade, br) * uOpacity;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    gl_FragColor.rgb *= a;
    gl_FragColor.a = a;
  }
`

// --- label / next textures -------------------------------------------------------

function labelCanvas(title: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const g = c.getContext('2d')!
  let size = 54
  const font = (s: number) => `700 ${s}px "Barlow Condensed", "Geist Variable", system-ui, sans-serif`
  g.font = font(size)
  const text = title.toUpperCase()
  while (g.measureText(text).width > 480 && size > 24) {
    size -= 4
    g.font = font(size)
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#eaf6fb'
  g.fillText(text, 256, 52)
  return c
}

function nextCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 400
  const g = c.getContext('2d')!
  g.fillStyle = '#04080c'
  g.fillRect(0, 0, 640, 400)
  g.strokeStyle = 'rgba(79,216,255,0.35)'
  g.lineWidth = 2
  for (let x = 0; x <= 640; x += 40) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 400)
    g.stroke()
  }
  for (let y = 0; y <= 400; y += 40) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(640, y)
    g.stroke()
  }
  g.fillStyle = '#4fd8ff'
  g.font = '700 190px "Barlow Condensed", system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('?', 320, 210)
  return c
}

// --- engine ----------------------------------------------------------------------

interface BaseObj {
  spot: Spot
  group: THREE.Group
  screenGroup: THREE.Group
  label: THREE.Mesh
  ring: THREE.Mesh
  beam: THREE.Mesh
  u: Record<string, THREE.IUniform>
  sel: number
  picks: THREE.Object3D[]
}

export function createWorld(o: WorldOptions): World | null {
  const { canvas, host, layout, reduced } = o
  const { spots, bounds } = layout
  const N = spots.length
  let quality = o.quality

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1))
  renderer.setClearColor(BG, 1)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  const BASE_FOV = 52
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 260)

  const disposables: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d)
  const accent = new THREE.Color(ACCENT)
  const fogCol = new THREE.Color(BG)

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1218, 1.2))
  const sun = new THREE.DirectionalLight(0xcfeeff, 1.5)
  sun.position.set(-8, 14, 6)
  scene.add(sun)

  // --- terrain ---------------------------------------------------------------------
  const route: { x: number; z: number }[] = spots.map((s) => ({ x: s.x, z: s.z }))
  const lastX = spots[N - 1].x
  const corridor = [
    { x: spots[0].x - 60, z: spots[0].z },
    ...route,
    { x: lastX + 60, z: spots[N - 1].z },
  ]
  const stats = { sel: new THREE.Vector2(), hover: new THREE.Vector2() }

  const pos: number[] = []
  const local: number[] = []
  const center: number[] = []
  const info: number[] = []
  const side: number[] = []
  const tiles: { x: number; z: number }[] = []

  const q0 = Math.floor(bounds.minX / STEP_X)
  const q1 = Math.ceil(bounds.maxX / STEP_X)
  for (let q = q0; q <= q1; q++) {
    const cx = q * STEP_X
    const zOff = q & 1 ? STEP_Z / 2 : 0
    const r0 = Math.floor((bounds.minZ - zOff) / STEP_Z)
    const r1 = Math.ceil((bounds.maxZ - zOff) / STEP_Z)
    for (let r = r0; r <= r1; r++) {
      const cz = r * STEP_Z + zOff
      let dBase = 99
      for (const s of spots) dBase = Math.min(dBase, Math.hypot(cx - s.x, cz - s.z))
      let dRoad = 99
      for (let i = 0; i < route.length - 1; i++) {
        dRoad = Math.min(dRoad, distToSegment(cx, cz, route[i].x, route[i].z, route[i + 1].x, route[i + 1].z))
      }
      // the corridor runs on past both ends so the canyon walls frame the camera too
      let dCorr = 99
      for (let i = 0; i < corridor.length - 1; i++) {
        dCorr = Math.min(dCorr, distToSegment(cx, cz, corridor[i].x, corridor[i].z, corridor[i + 1].x, corridor[i + 1].z))
      }
      const known = 1 - smooth(4.5, 10.5, Math.min(dBase * 0.95, dRoad * 1.35))
      const road = 1 - smooth(0.5, 1.1, dRoad)
      const seed = hash2(q, r)
      const ahead = smooth(lastX + 2, lastX + 18, cx)
      const wall = smooth(4.4, 15, dCorr)
      const relief = 0.8 + vnoise(cx * 0.24 + 3, cz * 0.24) * 7.5 + hash2(q + 7, r + 3) * 1.2
      let h = 0.06 + (vnoise(cx * 0.32, cz * 0.32) - 0.5) * 0.2 + wall * relief * (1 - ahead * 0.88) - ahead * 0.45
      if (dBase < 1.3) h = 0.34
      tiles.push({ x: cx, z: cz })

      const corners: [number, number][] = []
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3
        corners.push([Math.cos(a), Math.sin(a)])
      }
      const push = (x: number, y: number, z: number, lx: number, lz: number, s: number) => {
        pos.push(x, y, z)
        local.push(lx, lz)
        center.push(cx, cz)
        info.push(known, road, seed)
        side.push(s)
      }
      const W = 0.965
      for (let k = 0; k < 6; k++) {
        const a = corners[k]
        const b = corners[(k + 1) % 6]
        // top
        push(cx, h, cz, 0, 0, 0)
        push(cx + a[0] * R * W, h, cz + a[1] * R * W, a[0] * W, a[1] * W, 0)
        push(cx + b[0] * R * W, h, cz + b[1] * R * W, b[0] * W, b[1] * W, 0)
        // side
        const y0 = -1.4
        const ax = cx + a[0] * R * W
        const az = cz + a[1] * R * W
        const bx = cx + b[0] * R * W
        const bz = cz + b[1] * R * W
        push(ax, h, az, a[0], a[1], 1)
        push(ax, y0, az, a[0], a[1], 1)
        push(bx, h, bz, b[0], b[1], 1)
        push(bx, h, bz, b[0], b[1], 1)
        push(ax, y0, az, a[0], a[1], 1)
        push(bx, y0, bz, b[0], b[1], 1)
      }
    }
  }

  const tileGeo = track(new THREE.BufferGeometry())
  tileGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  tileGeo.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2))
  tileGeo.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 2))
  tileGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3))
  tileGeo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
  const tileU = {
    uTime: { value: 0 },
    uAccent: { value: accent },
    uFog: { value: fogCol },
    uHover: { value: stats.hover },
    uHoverOn: { value: 0 },
    uSel: { value: stats.sel },
    uSelOn: { value: 0 },
    uPulse: { value: 1 },
  }
  const terrain = new THREE.Mesh(
    tileGeo,
    track(new THREE.ShaderMaterial({ uniforms: tileU, vertexShader: tileVert, fragmentShader: tileFrag })),
  )
  terrain.frustumCulled = false
  scene.add(terrain)

  // --- bases -----------------------------------------------------------------------
  const loader = new THREE.TextureLoader()
  const textures: THREE.Texture[] = []
  const plinthMat = track(new THREE.MeshStandardMaterial({ color: 0x1b2833, roughness: 0.5, metalness: 0.5 }))
  const glowMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.5), toneMapped: false }))
  const beamMat = track(
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  const wireMat = track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }))
  const screenGeo = track(new THREE.PlaneGeometry(4.6, 2.875))
  const labelGeo = track(new THREE.PlaneGeometry(4.2, 0.79))
  const ringGeo = track(new THREE.TorusGeometry(1.0, 0.025, 6, 48))
  const beamGeo = track(new THREE.CylinderGeometry(0.05, 0.05, 7, 6, 1, true))

  const plinthGeo = (kind: Spot['kind']): THREE.BufferGeometry => {
    switch (kind) {
      case 'game':
        return track(new THREE.CylinderGeometry(0.5, 0.78, 0.9, 6))
      case 'app':
        return track(new THREE.BoxGeometry(1.0, 0.9, 1.0))
      case 'tool':
        return track(new THREE.OctahedronGeometry(0.72))
      case 'agent':
        return track(new THREE.IcosahedronGeometry(0.62, 0))
      default:
        return track(new THREE.CylinderGeometry(0.55, 0.78, 0.9, 6))
    }
  }

  const bases: BaseObj[] = spots.map((s, i) => {
    const group = new THREE.Group()
    group.position.set(s.x, 0.34, s.z)
    const picks: THREE.Object3D[] = []

    const isNext = s.kind === 'next'
    const pg = plinthGeo(s.kind)
    const plinth = new THREE.Mesh(pg, isNext ? track(new THREE.MeshBasicMaterial({ visible: false })) : plinthMat)
    plinth.position.y = s.kind === 'tool' || s.kind === 'agent' ? 0.85 : 0.45
    group.add(plinth)
    picks.push(plinth)
    if (isNext) {
      const edges = new THREE.LineSegments(track(new THREE.EdgesGeometry(pg)), wireMat)
      edges.position.copy(plinth.position)
      group.add(edges)
    } else {
      const e = new THREE.LineSegments(
        track(new THREE.EdgesGeometry(pg)),
        track(new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.8 })),
      )
      e.position.copy(plinth.position)
      group.add(e)
    }

    if (!isNext) {
      const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.2, 6.2, 6)), plinthMat)
      mast.position.y = 3.3
      group.add(mast)
      ;[1.8, 3.6, 5.4].forEach((y) => {
        const band = new THREE.Mesh(track(new THREE.TorusGeometry(0.3 - y * 0.012, 0.03, 6, 20)), glowMat)
        band.rotation.x = Math.PI / 2
        band.position.y = y
        group.add(band)
      })
    }

    const ring = new THREE.Mesh(ringGeo, glowMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.04
    ring.scale.setScalar(1.15)
    group.add(ring)

    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.position.y = 3.6
    group.add(beam)

    // holo screen + label
    const screenGroup = new THREE.Group()
    screenGroup.position.y = 6.9
    group.add(screenGroup)

    const u: Record<string, THREE.IUniform> = {
      uTex: { value: null },
      uHasTex: { value: 0 },
      uTint: { value: new THREE.Color().setHSL(s.hue / 360, 0.3, 0.1) },
      uAccent: { value: accent },
      uCover: { value: new THREE.Vector2(1, 1) },
      uSel: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: i * 5.17 },
      uOpacity: { value: 1 },
    }
    const screen = new THREE.Mesh(
      screenGeo,
      track(
        new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: holoVert,
          fragmentShader: holoFrag,
          transparent: true,
          depthWrite: false,
          premultipliedAlpha: true,
        }),
      ),
    )
    screenGroup.add(screen)
    picks.push(screen)

    const setTex = (tex: THREE.Texture, w: number, h: number) => {
      tex.colorSpace = THREE.SRGBColorSpace
      textures.push(tex)
      const ta = w / h
      const pa = 4.6 / 2.875
      ;(u.uCover.value as THREE.Vector2).set(ta > pa ? pa / ta : 1, ta > pa ? 1 : ta / pa)
      u.uTex.value = tex
      u.uHasTex.value = 1
    }
    if (isNext) {
      const c = nextCanvas()
      setTex(new THREE.CanvasTexture(c), c.width, c.height)
    } else if (s.src) {
      loader.load(s.src, (tex) => {
        const img = tex.image as { width: number; height: number }
        setTex(tex, img.width, img.height)
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      })
    } else {
      const c = drawGeneratedCover(s.title, s.hue)
      setTex(new THREE.CanvasTexture(c), c.width, c.height)
    }

    const lc = labelCanvas(s.title)
    const ltex = track(new THREE.CanvasTexture(lc))
    ltex.colorSpace = THREE.SRGBColorSpace
    const label = new THREE.Mesh(
      labelGeo,
      track(new THREE.MeshBasicMaterial({ map: ltex, transparent: true, depthWrite: false, toneMapped: false })),
    )
    label.position.y = -2.0
    screenGroup.add(label)

    // generous invisible pick volume around the whole base
    const pickVol = new THREE.Mesh(
      track(new THREE.CylinderGeometry(2.4, 2.4, 10, 8)),
      track(new THREE.MeshBasicMaterial({ visible: false })),
    )
    pickVol.position.y = 5
    group.add(pickVol)
    picks.push(pickVol)
    picks.forEach((p) => (p.userData.base = i))

    scene.add(group)
    return { spot: s, group, screenGroup, label, ring, beam, u, sel: 0, picks }
  })
  const pickMeshes = bases.flatMap((b) => b.picks)

  // marquee font for the labels loads after first paint, then textures refresh
  document.fonts
    ?.load('700 40px "Barlow Condensed"')
    .then(() => {
      bases.forEach((b) => {
        const m = (b.label.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture
        const c = m.image as HTMLCanvasElement
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
        c.getContext('2d')!.drawImage(labelCanvas(b.spot.title), 0, 0)
        m.needsUpdate = true
      })
    })
    .catch(() => undefined)

  // --- dust ------------------------------------------------------------------------
  let dust: THREE.Points | null = null
  if (quality === 'high') {
    // a volume that travels with the camera, so there is always depth in the foreground
    const n = 340
    const p = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      p[i * 3] = -14 + Math.random() * 62
      p[i * 3 + 1] = 0.3 + Math.random() * 11
      p[i * 3 + 2] = -20 + Math.random() * 40
    }
    const g = track(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    dust = new THREE.Points(
      g,
      track(
        new THREE.PointsMaterial({
          color: ACCENT,
          size: 0.1,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      ),
    )
    scene.add(dust)
  }

  // --- post ------------------------------------------------------------------------
  let composer: EffectComposer | null = null
  if (quality === 'high') {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.55, 0.78))
    composer.addPass(new OutputPass())
  }

  // --- camera ----------------------------------------------------------------------
  // Cinematic framing: a low camera on the supply line, bases standing in depth ahead of it.
  const cam = {
    target: new THREE.Vector3(spots[0].x + 6, 2, 0),
    yaw: 0.5,
    pitch: 1.1,
    dist: 110,
  }
  const des = { target: new THREE.Vector3(), yaw: -1.4, pitch: 0.2, dist: 30 }
  let kick = 0
  let rollDir = 1
  let selected = clamp(o.selected, -1, N - 1)
  let width = 1
  let height = 1

  const overviewDist = () => clamp(17 + N * 1.7, 22, 46) * (width / height < 0.9 ? 1.25 : 1)
  const impact = () => {
    kick = 1
    rollDir = -rollDir
  }
  const goOverview = () => {
    if (selected !== -1) impact()
    selected = -1
    des.target.set(spots[0].x + 5, 3, spots[0].z * 0.3)
    des.yaw = -1.4
    des.pitch = 0.2
    des.dist = overviewDist()
  }
  const goSelect = (i: number) => {
    if (selected !== i) impact()
    selected = i
    const s = spots[i]
    des.target.set(s.x, 5.6, s.z)
    des.yaw = i % 2 === 0 ? -1.15 : -1.75
    des.pitch = -0.15
    des.dist = width / height < 0.9 ? 16 : 11.5
  }

  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    composer?.setSize(width, height)
    camera.aspect = width / height
    // leave room for the bottom HUD: push the scene up a little
    camera.setViewOffset(width, height, 0, height * 0.085, width, height)
    camera.updateProjectionMatrix()
    if (selected < 0) des.dist = overviewDist()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()
  if (selected >= 0) goSelect(selected)
  else goOverview()
  if (reduced) {
    cam.target.copy(des.target)
    cam.yaw = des.yaw
    cam.pitch = des.pitch
    cam.dist = des.dist
  }

  // --- input -----------------------------------------------------------------------
  const ndc = new THREE.Vector2()
  let hasPointer = false
  const ray = new THREE.Raycaster()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1)
  const hit = new THREE.Vector3()
  let hoverBase = -1
  const lean = new THREE.Vector2()
  let drag: { x: number; y: number; moved: number; pan: boolean } | null = null
  const hexKey = new Map<string, { x: number; z: number }>()
  tiles.forEach((t) => hexKey.set(`${Math.round(t.x / STEP_X)},${Math.round((t.z - ((Math.round(t.x / STEP_X) & 1) ? STEP_Z / 2 : 0)) / STEP_Z)}`, t))

  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    hasPointer = true
  }
  const onDown = (e: PointerEvent) => {
    setNdc(e)
    drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey }
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    setNdc(e)
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    drag.moved += Math.abs(dx) + Math.abs(dy)
    if (drag.moved < 6) return
    if (drag.pan) {
      const k = des.dist * 0.0016
      const sy = Math.sin(cam.yaw)
      const cy = Math.cos(cam.yaw)
      des.target.x += (-dx * cy + -dy * sy) * k
      des.target.z += (dx * sy - dy * cy) * k
      des.target.x = clamp(des.target.x, bounds.minX, bounds.maxX)
      des.target.z = clamp(des.target.z, bounds.minZ, bounds.maxZ)
    } else {
      des.yaw -= dx * 0.0052
      des.pitch = clamp(des.pitch + dy * 0.0042, -0.12, 1.25)
    }
    if (reduced) {
      cam.yaw = des.yaw
      cam.pitch = des.pitch
      cam.target.copy(des.target)
    }
  }
  const onUp = (e: PointerEvent) => {
    if (!drag) return
    const wasClick = drag.moved < 6
    drag = null
    try {
      canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (!wasClick) return
    setNdc(e)
    const i = pickBase()
    if (i < 0) return
    if (i === selected) {
      if (spots[i].kind !== 'next') o.onOpen(i)
    } else {
      goSelect(i)
      pulse = 0
      o.onSelect(i)
    }
  }
  const onLeave = () => {
    hasPointer = false
    hoverBase = -1
  }
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    des.dist = clamp(des.dist * Math.exp(e.deltaY * 0.0022), 7, 95)
  }
  const onCtx = (e: Event) => e.preventDefault()
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onCtx)

  const pickBase = () => {
    if (!hasPointer) return -1
    ray.setFromCamera(ndc, camera)
    const h = ray.intersectObjects(pickMeshes, false)[0]
    return h ? (h.object.userData.base as number) : -1
  }

  // --- frame -----------------------------------------------------------------------
  let time = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let disposed = false
  let pulse = 1
  let frames = 0
  let frameSum = 0
  let lastHover = -2

  const dropQuality = () => {
    if (quality === 'low') return
    quality = 'low'
    composer = null
    if (dust) dust.visible = false
    renderer.setPixelRatio(1)
    resize()
    o.onQualityDrop?.()
  }

  const tick = (now: number) => {
    raf = 0
    if (disposed) return
    const rawDt = Math.max((now - last) / 1000, 0)
    const dt = Math.min(rawDt, 0.05)
    last = now
    time += dt

    if (quality === 'high' && frames < 100 && time > 0.8) {
      frames++
      frameSum += rawDt
      if (frames === 100 && frameSum / frames > 0.034) dropQuality()
    }

    const k = reduced ? 1 : 1 - Math.exp(-dt * 4.2)
    cam.target.lerp(des.target, k)
    cam.yaw += (des.yaw - cam.yaw) * k
    cam.pitch += (des.pitch - cam.pitch) * k
    cam.dist += (des.dist - cam.dist) * k
    const cp = Math.cos(cam.pitch)
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
      cam.target.y + Math.sin(cam.pitch) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * cp * cam.dist,
    )
    camera.lookAt(cam.target)
    // pointer parallax: shift the camera sideways without changing where it looks
    if (!reduced) {
      const lx = hasPointer && !drag ? ndc.x : 0
      const ly = hasPointer && !drag ? ndc.y : 0
      lean.x += (lx - lean.x) * (1 - Math.exp(-dt * 3))
      lean.y += (ly - lean.y) * (1 - Math.exp(-dt * 3))
      camera.translateX(lean.x * 1.4)
      camera.translateY(lean.y * 0.7)
      kick *= Math.exp(-dt * 2.6)
      camera.rotateZ(kick * 0.045 * rollDir)
      const fov = BASE_FOV + kick * 15 + (camera.aspect < 0.9 ? 12 : 0)
      if (Math.abs(fov - camera.fov) > 0.01) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    }

    // hover: base first, otherwise the hex tile under the cursor
    let hb = -1
    let tileOn = 0
    if (!drag || drag.moved < 6) {
      hb = pickBase()
      if (hb < 0 && hasPointer) {
        ray.setFromCamera(ndc, camera)
        if (ray.ray.intersectPlane(groundPlane, hit)) {
          const q = Math.round(hit.x / STEP_X)
          let best = 99
          for (let dq = -1; dq <= 1; dq++) {
            const qq = q + dq
            const zOff = qq & 1 ? STEP_Z / 2 : 0
            const r = Math.round((hit.z - zOff) / STEP_Z)
            for (let dr = -1; dr <= 1; dr++) {
              const cxx = qq * STEP_X
              const czz = (r + dr) * STEP_Z + zOff
              const d = Math.hypot(hit.x - cxx, hit.z - czz)
              if (d < best) {
                best = d
                stats.hover.set(cxx, czz)
              }
            }
          }
          tileOn = best < 1 ? 1 : 0
        }
      }
    }
    hoverBase = hb
    if (hoverBase !== lastHover) {
      lastHover = hoverBase
      o.onHover(hoverBase)
    }
    canvas.style.cursor = drag ? 'grabbing' : hoverBase >= 0 ? 'pointer' : 'grab'
    tileU.uHoverOn.value += (tileOn - tileU.uHoverOn.value) * (1 - Math.exp(-dt * 14))

    if (pulse < 1) pulse = Math.min(1, pulse + dt * 0.75)
    tileU.uPulse.value = pulse
    tileU.uTime.value = reduced ? 0 : time
    tileU.uSelOn.value = selected >= 0 ? 1 : 0
    if (selected >= 0) stats.sel.set(spots[selected].x, spots[selected].z)

    for (let i = 0; i < N; i++) {
      const b = bases[i]
      const want = i === selected ? 1 : i === hoverBase ? 0.55 : 0
      b.sel += (want - b.sel) * (reduced ? 1 : 1 - Math.exp(-dt * 8))
      const bob = reduced ? 0 : Math.sin(time * 1.1 + i * 1.7) * 0.06
      const sc = 0.82 + b.sel * 0.34
      b.screenGroup.scale.setScalar(sc)
      b.screenGroup.position.y = 6.9 + b.sel * 0.5 + bob
      b.screenGroup.rotation.y = Math.atan2(camera.position.x - b.group.position.x, camera.position.z - b.group.position.z)
      b.label.position.y = -2.0 - b.sel * 0.1
      b.ring.scale.setScalar(1.2 + b.sel * 0.6 + (reduced ? 0 : Math.sin(time * 2 + i) * 0.04))
      b.u.uSel.value = b.sel
      b.u.uTime.value = time
      b.u.uOpacity.value = 0.78 + b.sel * 0.22
    }
    if (dust) dust.position.set(camera.position.x, reduced ? 0 : Math.sin(time * 0.3) * 0.3, 0)

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
  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }
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
    select(i) {
      if (i < 0) goOverview()
      else {
        goSelect(clamp(i, 0, N - 1))
        pulse = 0
      }
    },
    overview() {
      goOverview()
    },
    zoom(f) {
      des.dist = clamp(des.dist * f, 7, 95)
    },
    panTo(x, z) {
      des.target.set(clamp(x, bounds.minX, bounds.maxX), 0, clamp(z, bounds.minZ, bounds.maxZ))
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
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onCtx)
      disposables.forEach((d) => d.dispose())
      textures.forEach((t) => t.dispose())
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
