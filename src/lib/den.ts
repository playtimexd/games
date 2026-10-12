import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPinball, MAX_TARGETS, TABLE, type Pinball } from './pinball'
import { drawGeneratedCover } from './cover'
import { sfx } from './sfx'

/**
 * The den: a small game room at night with a shelf of cartridges, a console and a CRT, and a
 * pinball machine you can actually play.
 *
 * Three stations, with cinematic cuts between them:
 *   room  the whole room
 *   tv    shelf and TV: click a cartridge to select it, click it again to insert it
 *   play  the pinball table: targets are your projects, the scoop opens the selected one
 *
 * Everything is built from the project list, so a new game is a new cartridge and a new target.
 */

export interface DenItem {
  id: string
  title: string
  tagline: string
  src?: string
  hue: number
  /** the always-present empty cartridge for the game that is not here yet */
  next?: boolean
}

export type Station = 'room' | 'tv' | 'play'

export interface DenOptions {
  canvas: HTMLCanvasElement
  host: HTMLElement
  items: DenItem[]
  siteName: string
  reduced: boolean
  quality: 'high' | 'low'
  onStation(s: Station): void
  onSelect(i: number): void
  onOpen(i: number): void
  onScore(n: number): void
}

export interface Den {
  setStation(s: Station): void
  select(i: number): void
  insert(i: number): void
  flipper(side: 'left' | 'right', on: boolean): void
  plunger(on: boolean): void
  dispose(): void
}

const ACCENT = 0xff7a45
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const rnd = (() => {
  let s = 90210
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
})()

// --- procedural textures ----------------------------------------------------------

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const woodTex = () =>
  canvasTex(512, 512, (g) => {
    g.fillStyle = '#2d1c14'
    g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 8; i++) {
      const y = i * 64
      g.fillStyle = `hsl(${22 + rnd() * 8} ${30 + rnd() * 12}% ${13 + rnd() * 7}%)`
      g.fillRect(0, y, 512, 62)
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(0, y + 62, 512, 2)
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(255,220,180,${0.02 + rnd() * 0.04})`
        g.fillRect(rnd() * 512, y + rnd() * 60, 40 + rnd() * 160, 1)
      }
      g.fillStyle = 'rgba(0,0,0,0.5)'
      g.fillRect(((i * 173) % 480) + 10, y, 2, 62)
    }
  })

const wallTex = () =>
  canvasTex(256, 256, (g) => {
    g.fillStyle = '#3a2b46'
    g.fillRect(0, 0, 256, 256)
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = 'rgba(255,255,255,0.025)'
      g.fillRect(x, 0, 16, 256)
    }
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd() * 0.03})`
      g.fillRect(rnd() * 256, rnd() * 256, 1, 1)
    }
  })

const rugTex = () =>
  canvasTex(512, 384, (g) => {
    g.fillStyle = '#2a1830'
    g.fillRect(0, 0, 512, 384)
    for (let y = 0; y < 384; y += 48) {
      for (let x = (y / 48) % 2 ? 0 : 32; x < 512; x += 64) {
        g.fillStyle = (x + y) % 128 ? 'rgba(255,122,69,0.5)' : 'rgba(255,122,69,0.22)'
        g.beginPath()
        g.moveTo(x, y + 24)
        g.lineTo(x + 32, y)
        g.lineTo(x + 64, y + 24)
        g.lineTo(x + 32, y + 48)
        g.closePath()
        g.fill()
      }
    }
    g.strokeStyle = 'rgba(255,226,205,0.4)'
    g.lineWidth = 6
    g.strokeRect(6, 6, 500, 372)
  })

// --- engine -----------------------------------------------------------------------

type Pickable = THREE.Object3D & { userData: { cart?: number; tv?: boolean; pin?: boolean } }

export function createDen(o: DenOptions): Den | null {
  const { canvas, host, items, reduced } = o
  const projectCount = items.filter((i) => !i.next).length
  let quality = o.quality

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1))
  renderer.setClearColor(0x0c0910, 1)
  renderer.shadowMap.enabled = quality === 'high'
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0c0910)
  scene.fog = new THREE.Fog(0x0c0910, 14, 40)
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80)

  const disposables: { dispose(): void }[] = []
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d)

  // reflections for the chrome ball and metal parts
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new RoomEnvironment()
  const envTex = pmrem.fromScene(envScene, 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.45
  track(pmrem)

  // --- lights ----------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0x8a72a8, 0x2a1a14, 1.5))
  const lamp = new THREE.SpotLight(0xffc690, 190, 22, 1.05, 0.6, 2)
  lamp.position.set(1.8, 4.6, 2.8)
  lamp.target.position.set(-0.6, 0.6, -0.4)
  lamp.castShadow = quality === 'high'
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.bias = -0.0004
  scene.add(lamp, lamp.target)
  const tvLight = new THREE.PointLight(0x9bbcff, 4, 6, 2)
  tvLight.position.set(-0.9, 1.15, -1.5)
  scene.add(tvLight)
  const warm = new THREE.PointLight(0xff9a55, 34, 10, 2)
  warm.position.set(-3.6, 2.4, -1.6)
  scene.add(warm)
  const tableLight = new THREE.PointLight(ACCENT, 4, 3.4, 2)
  tableLight.position.set(-1.7, 1.9, 0.3)
  scene.add(tableLight)

  // --- room ------------------------------------------------------------------------
  const mat = (color: number, rough = 0.7, metal = 0.1) =>
    track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }))
  const pickables: THREE.Object3D[] = []

  const floorTex = track(woodTex())
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
  floorTex.repeat.set(3, 3)
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(14, 14)),
    track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62, metalness: 0.05 })),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const wt = track(wallTex())
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping
  wt.repeat.set(5, 2)
  const wallMat = track(new THREE.MeshStandardMaterial({ map: wt, roughness: 0.92 }))
  const back = new THREE.Mesh(track(new THREE.PlaneGeometry(14, 5.2)), wallMat)
  back.position.set(0, 2.6, -3.3)
  back.receiveShadow = true
  scene.add(back)
  const sideWall = new THREE.Mesh(track(new THREE.PlaneGeometry(10, 5.2)), wallMat)
  sideWall.rotation.y = Math.PI / 2
  sideWall.position.set(-5, 2.6, 1.7)
  sideWall.receiveShadow = true
  scene.add(sideWall)

  const addBox = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    shadow = true,
  ) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), m)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadow && quality === 'high'
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  const base = mat(0x120c14, 0.8)
  addBox(scene, 14, 0.14, 0.1, base, 0, 0.07, -3.25, false)
  addBox(scene, 0.1, 0.14, 10, base, -4.95, 0.07, 1.7, false)

  const rugM = track(new THREE.MeshStandardMaterial({ map: track(rugTex()), roughness: 0.95 }))
  const rug = new THREE.Mesh(track(new THREE.PlaneGeometry(4.2, 3.4)), rugM)
  rug.rotation.x = -Math.PI / 2
  rug.position.set(-1.5, 0.012, 0.9)
  rug.receiveShadow = true
  scene.add(rug)

  // --- images shared by cartridges, targets and the TV ---------------------------------
  const loader = new THREE.TextureLoader()
  const images: Promise<{ img: CanvasImageSource & { width: number; height: number } }>[] = items.map(
    (it) =>
      new Promise((resolve) => {
        if (it.next || !it.src) {
          resolve({ img: it.next ? nextArt() : drawGeneratedCover(it.title, it.hue) })
          return
        }
        loader.load(
          it.src,
          (t) => {
            t.dispose()
            resolve({ img: t.image as HTMLImageElement })
          },
          undefined,
          () => resolve({ img: drawGeneratedCover(it.title, it.hue) }),
        )
      }),
  )
  function nextArt() {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const g = c.getContext('2d')!
    g.fillStyle = '#0b0710'
    g.fillRect(0, 0, 640, 480)
    g.strokeStyle = 'rgba(255,122,69,0.5)'
    g.lineWidth = 6
    g.setLineDash([18, 12])
    g.strokeRect(24, 24, 592, 432)
    g.fillStyle = '#ff7a45'
    g.font = '700 220px "Barlow Condensed", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', 320, 250)
    return c
  }

  const textures: THREE.Texture[] = []
  /** a texture that fills in when the item's image is ready, cropped to the aspect of its mesh */
  const coverFor = (i: number, aspect: number, tint = 0x241a2b): THREE.Texture => {
    const t = new THREE.Texture(
      (() => {
        const c = document.createElement('canvas')
        c.width = c.height = 2
        const g = c.getContext('2d')!
        g.fillStyle = '#' + new THREE.Color(tint).getHexString()
        g.fillRect(0, 0, 2, 2)
        return c
      })(),
    )
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    textures.push(t)
    images[i].then(({ img }) => {
      ;(t as unknown as { image: unknown }).image = img
      const ta = img.width / img.height
      if (ta > aspect) t.repeat.set(aspect / ta, 1)
      else t.repeat.set(1, ta / aspect)
      t.offset.set((1 - t.repeat.x) / 2, (1 - t.repeat.y) / 2)
      t.anisotropy = 4
      t.needsUpdate = true
    })
    return t
  }

  // --- TV, console, cabinet --------------------------------------------------------------
  const tvGroup = new THREE.Group()
  tvGroup.userData.tv = true
  scene.add(tvGroup)
  const wood = mat(0x2f1f18, 0.6, 0.05)
  addBox(tvGroup, 2.1, 0.58, 0.75, wood, -0.4, 0.29, -2.75)
  const tvBody = addBox(tvGroup, 1.28, 1.0, 0.82, mat(0x15151a, 0.5, 0.2), -0.9, 1.08, -2.72)

  const screenU = {
    uTex: { value: null as THREE.Texture | null },
    uCover: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uStatic: { value: 0 },
    uOn: { value: 1 },
    uHover: { value: 0 },
  }
  const screenMat = track(
    new THREE.ShaderMaterial({
      uniforms: screenU,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTex; uniform vec2 uCover; uniform float uTime; uniform float uStatic; uniform float uOn; uniform float uHover;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv * 2.0 - 1.0;
          vec2 off = abs(uv.yx) / vec2(6.0, 4.5);
          uv += uv * off * off;
          uv = uv * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
          float roll = step(0.995, fract(sin(floor(uTime * 1.5) * 9.7) * 437.5)) * 0.01;
          vec2 tuv = (uv - 0.5) * uCover + 0.5;
          vec3 col;
          col.r = texture2D(uTex, tuv + vec2(0.002 + roll, 0.0)).r;
          col.g = texture2D(uTex, tuv).g;
          col.b = texture2D(uTex, tuv - vec2(0.002 + roll, 0.0)).b;
          float n = h(floor(uv * vec2(180.0, 120.0)) + floor(uTime * 24.0));
          col = mix(col, vec3(n), uStatic);
          float scan = 0.84 + 0.16 * sin(uv.y * 340.0);
          float vig = smoothstep(1.0, 0.25, length(uv - 0.5) * 1.35);
          col *= scan * vig * (0.97 + 0.03 * sin(uTime * 50.0));
          col *= (1.05 + uHover * 0.15) * uOn;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  )
  const screen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.98, 0.74)), screenMat)
  screen.position.set(-0.9, 1.08, -2.295)
  screen.userData.tv = true
  tvGroup.add(screen)
  pickables.push(tvBody, screen)

  // console with a cartridge slot
  const consoleM = mat(0x8a8794, 0.45, 0.3)
  addBox(tvGroup, 0.62, 0.1, 0.36, consoleM, 0.5, 0.63, -2.68)
  addBox(tvGroup, 0.34, 0.012, 0.05, mat(0x0a0a0c, 0.9), 0.5, 0.685, -2.62, false)
  addBox(tvGroup, 0.2, 0.05, 0.12, mat(0x3b3944, 0.6), 1.0, 0.605, -2.35)

  // --- shelf and cartridges ----------------------------------------------------------------
  const cartMat = mat(0x34323d, 0.55, 0.2)
  const shelfMat = mat(0x3b271c, 0.55)
  interface Cart {
    group: THREE.Group
    label: THREE.Mesh
    home: THREE.Vector3
    lift: number
    sel: number
  }
  const carts: Cart[] = []
  const perShelf = 8
  const shelfXs = 1.6
  items.forEach((it, i) => {
    const row = Math.floor(i / perShelf)
    const col = i % perShelf
    if (row > 3) return
    const y = 1.35 + row * 0.62
    if (col === 0) addBox(scene, 2.5, 0.05, 0.3, shelfMat, shelfXs + 1.1, y, -3.1)
    const g = new THREE.Group()
    g.userData.cart = i
    const body = addBox(g, 0.26, 0.3, 0.05, cartMat, 0, 0, 0)
    addBox(g, 0.2, 0.04, 0.052, mat(0x1c1b22, 0.7), 0, -0.13, 0.002, false)
    const label = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.2, 0.15)),
      track(new THREE.MeshBasicMaterial({ map: coverFor(i, 4 / 3), color: 0x8c8c8c, toneMapped: false })),
    )
    label.position.set(0, 0.035, 0.0265)
    g.add(label)
    const home = new THREE.Vector3(shelfXs + col * 0.31, y + 0.175, -3.02)
    g.position.copy(home)
    g.rotation.y = (rnd() - 0.5) * 0.12
    scene.add(g)
    pickables.push(body, label)
    body.userData.cart = i
    label.userData.cart = i
    carts.push({ group: g, label, home, lift: 0, sel: 0 })
  })

  // --- pinball machine -------------------------------------------------------------------------
  const machine = new THREE.Group()
  machine.position.set(-1.7, 0, 0.55)
  machine.userData.pin = true
  scene.add(machine)
  const top = new THREE.Group()
  top.position.y = 0.95
  top.rotation.x = 0.1
  machine.add(top)

  const legM = mat(0x9b97a4, 0.3, 0.8)
  for (const lx of [-0.62, 0.62])
    for (const lz of [-1.15, 1.15]) {
      const leg = addBox(machine, 0.09, 0.95, 0.09, legM, lx, 0.475, lz)
      pickables.push(leg)
    }
  const cabM = mat(0x241631, 0.45, 0.2)
  const cab = addBox(top, 1.44, 0.24, 2.72, cabM, 0, -0.13, -0.02)
  pickables.push(cab)
  addBox(top, 0.07, 0.16, 2.72, cabM, -0.7, 0.04, -0.02)
  addBox(top, 0.07, 0.16, 2.72, cabM, 0.7, 0.04, -0.02)
  addBox(top, 1.44, 0.18, 0.08, cabM, 0, 0.03, 1.32)

  const cx = TABLE.cx
  const targetCount = Math.min(projectCount, MAX_TARGETS)
  const pb: Pinball = createPinball(targetCount, {
    onTarget: (i) => hitTarget(i),
    onBumper: () => {
      score += 100
      pushScore()
      sfx.bumper()
    },
    onScoop: () => scoopHit(),
    onDrain: () => {
      sfx.drain()
      ballHidden = 0.7
    },
    onFlip: () => sfx.flip(),
    onLaunch: () => sfx.launch(),
    onWall: () => {},
  })

  // playfield art
  const PF = { x0: -0.66, x1: 0.66, y0: -1.25, y1: 1.28 }
  const pfW = PF.x1 - PF.x0
  const pfH = PF.y1 - PF.y0
  const toPx = (x: number, y: number, W: number, H: number) => [((x - PF.x0) / pfW) * W, ((PF.y1 - y) / pfH) * H] as const
  const fieldTex = track(
    canvasTex(660, 1265, (g) => {
      const W = 660
      const H = 1265
      const grad = g.createLinearGradient(0, 0, 0, H)
      grad.addColorStop(0, '#2b1638')
      grad.addColorStop(0.55, '#1b1026')
      grad.addColorStop(1, '#120a1a')
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
      // faint rings around bumpers and the scoop
      g.strokeStyle = 'rgba(255,122,69,0.5)'
      g.lineWidth = 3
      pb.bumpers.forEach((b) => {
        const [px, py] = toPx(b.x, b.y, W, H)
        g.beginPath()
        g.arc(px, py, (b.r + 0.05) * (W / pfW), 0, Math.PI * 2)
        g.stroke()
      })
      const [sx, sy] = toPx(pb.scoop.x, pb.scoop.y, W, H)
      g.setLineDash([10, 8])
      g.beginPath()
      g.arc(sx, sy, (pb.scoop.r + 0.05) * (W / pfW), 0, Math.PI * 2)
      g.stroke()
      g.setLineDash([])
      // lane and arch lines
      g.strokeStyle = 'rgba(255,226,205,0.5)'
      g.lineWidth = 3
      pb.walls.forEach((w) => {
        const a = toPx(w.a.x, w.a.y, W, H)
        const b = toPx(w.b.x, w.b.y, W, H)
        g.beginPath()
        g.moveTo(a[0], a[1])
        g.lineTo(b[0], b[1])
        g.stroke()
      })
      g.fillStyle = 'rgba(255,226,205,0.28)'
      g.font = '700 38px "Barlow Condensed", system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText('OPEN', sx, sy + 78)
      g.fillStyle = 'rgba(255,226,205,0.16)'
      g.font = '700 54px "Barlow Condensed", system-ui, sans-serif'
      const [tx, ty] = toPx(cx, -0.45, W, H)
      g.fillText(o.siteName.toUpperCase(), tx, ty)
    }),
  )
  const field = new THREE.Mesh(
    track(new THREE.PlaneGeometry(pfW, pfH)),
    track(new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.62, metalness: 0.05 })),
  )
  field.rotation.x = -Math.PI / 2
  field.position.set(0, 0, -(PF.y0 + PF.y1) / 2)
  field.receiveShadow = true
  top.add(field)
  pickables.push(field)

  const toLocal = (x: number, y: number, h = 0.03) => new THREE.Vector3(x, h, -y)

  // walls as chrome rails
  const railM = mat(0xc9c5d2, 0.25, 0.9)
  pb.walls.forEach((w) => {
    if (w.oneWay) return
    const dx = w.b.x - w.a.x
    const dy = w.b.y - w.a.y
    const len = Math.hypot(dx, dy)
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(len, 0.07, 0.016)), railM)
    const mid = toLocal((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, 0.035)
    m.position.copy(mid)
    m.rotation.y = Math.atan2(dy, dx)
    top.add(m)
  })

  // pop bumpers
  const bumperMeshes = pb.bumpers.map((b) => {
    const g = new THREE.Group()
    g.position.copy(toLocal(b.x, b.y, 0))
    const stem = new THREE.Mesh(
      track(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.08, 20)),
      track(new THREE.MeshStandardMaterial({ color: 0x2a2336, roughness: 0.3, metalness: 0.6 })),
    )
    stem.position.y = 0.04
    const cap = new THREE.Mesh(
      track(new THREE.CylinderGeometry(b.r * 0.72, b.r * 0.8, 0.05, 20)),
      track(new THREE.MeshStandardMaterial({ color: 0xff7a45, emissive: 0xff5a1f, emissiveIntensity: 0.6, roughness: 0.35 })),
    )
    cap.position.y = 0.1
    g.add(stem, cap)
    top.add(g)
    return cap
  })

  // targets carry the project's cover
  const targetMeshes = pb.targets.map((t, i) => {
    const g = new THREE.Group()
    g.position.copy(toLocal(t.x, t.y, 0))
    const ring = new THREE.Mesh(
      track(new THREE.CylinderGeometry(t.r + 0.014, t.r + 0.014, 0.05, 28)),
      track(new THREE.MeshStandardMaterial({ color: 0x3a2f46, emissive: ACCENT, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.5 })),
    )
    ring.position.y = 0.025
    const disc = new THREE.Mesh(
      track(new THREE.CircleGeometry(t.r, 28)),
      track(new THREE.MeshBasicMaterial({ map: coverFor(i, 1), toneMapped: false, color: 0xe0e0e0 })),
    )
    disc.rotation.x = -Math.PI / 2
    disc.position.y = 0.052
    g.add(ring, disc)
    top.add(g)
    return { ring, disc }
  })

  // scoop
  const scoopRing = new THREE.Mesh(
    track(new THREE.TorusGeometry(pb.scoop.r, 0.012, 8, 28)),
    track(new THREE.MeshBasicMaterial({ color: new THREE.Color(ACCENT).multiplyScalar(1.4), toneMapped: false })),
  )
  scoopRing.rotation.x = Math.PI / 2
  scoopRing.position.copy(toLocal(pb.scoop.x, pb.scoop.y, 0.05))
  top.add(scoopRing)
  const hole = new THREE.Mesh(
    track(new THREE.CircleGeometry(pb.scoop.r, 24)),
    track(new THREE.MeshBasicMaterial({ color: 0x000000 })),
  )
  hole.rotation.x = -Math.PI / 2
  hole.position.copy(toLocal(pb.scoop.x, pb.scoop.y, 0.04))
  top.add(hole)

  // flippers
  const flipM = mat(0xff7a45, 0.35, 0.3)
  const mkFlipper = (f: Pinball['flippers']['left']) => {
    const g = new THREE.Group()
    g.position.copy(toLocal(f.pivot.x, f.pivot.y, 0.06))
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(f.length + 0.04, 0.045, 0.055)), flipM)
    m.position.x = f.length / 2
    m.castShadow = quality === 'high'
    g.add(m)
    top.add(g)
    return g
  }
  const flipL = mkFlipper(pb.flippers.left)
  const flipR = mkFlipper(pb.flippers.right)

  // ball and plunger
  const ballM = track(new THREE.MeshStandardMaterial({ color: 0xe9e6f2, roughness: 0.12, metalness: 1, envMapIntensity: 1.8 }))
  const ball = new THREE.Mesh(track(new THREE.SphereGeometry(pb.ball.r, 20, 14)), ballM)
  ball.castShadow = quality === 'high'
  top.add(ball)
  const plunger = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 10)),
    track(new THREE.MeshStandardMaterial({ color: 0xcfcad8, roughness: 0.3, metalness: 0.9 })),
  )
  plunger.rotation.x = Math.PI / 2
  top.add(plunger)

  // backbox with a live display
  const bbox = addBox(top, 1.5, 1.2, 0.3, cabM, 0, 0.58, -1.46)
  pickables.push(bbox)
  const dispCanvas = document.createElement('canvas')
  dispCanvas.width = 800
  dispCanvas.height = 360
  const dispTex = track(new THREE.CanvasTexture(dispCanvas))
  dispTex.colorSpace = THREE.SRGBColorSpace
  const disp = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.34, 0.6)),
    track(new THREE.MeshBasicMaterial({ map: dispTex, toneMapped: false })),
  )
  disp.position.set(0, 0.72, -1.305)
  top.add(disp)
  addBox(top, 1.34, 0.36, 0.02, mat(0x0a0710, 0.6), 0, 0.28, -1.31, false)

  // --- score and display ----------------------------------------------------------------------
  let score = 0
  let selected = -1
  let ballHidden = 0
  const pushScore = () => {
    o.onScore(score)
    drawDisplay()
  }
  function drawDisplay() {
    const g = dispCanvas.getContext('2d')!
    g.fillStyle = '#07050b'
    g.fillRect(0, 0, 800, 360)
    g.fillStyle = 'rgba(255,122,69,0.12)'
    for (let y = 0; y < 360; y += 4) g.fillRect(0, y, 800, 1)
    g.textAlign = 'center'
    g.fillStyle = '#ff7a45'
    g.font = '700 58px "Barlow Condensed", system-ui, sans-serif'
    g.fillText(o.siteName.toUpperCase(), 400, 78)
    const it = selected >= 0 ? items[selected] : null
    g.fillStyle = '#f6eee8'
    g.font = '700 96px "Barlow Condensed", system-ui, sans-serif'
    let t = it ? it.title.toUpperCase() : 'HIT A TARGET'
    while (g.measureText(t).width > 740 && g.font.indexOf('px') > 0) {
      const size = parseInt(/(\d+)px/.exec(g.font)![1]) - 6
      if (size < 36) break
      g.font = `700 ${size}px "Barlow Condensed", system-ui, sans-serif`
    }
    g.fillText(t, 400, 190)
    g.fillStyle = '#ab9fae'
    g.font = '600 36px "Barlow Condensed", system-ui, sans-serif'
    t = it ? (it.next ? 'COMING SOON' : 'DROP IN THE HOLE TO OPEN') : 'THE HOLE OPENS THE PROJECT'
    g.fillText(t, 400, 250)
    g.fillStyle = '#ff7a45'
    g.font = '700 58px "Barlow Condensed", system-ui, sans-serif'
    g.fillText(String(score).padStart(6, '0'), 400, 326)
    dispTex.needsUpdate = true
  }

  // --- TV content ------------------------------------------------------------------------------
  const tvTex: (THREE.Texture | null)[] = items.map(() => null)
  const tvCover: THREE.Vector2[] = items.map(() => new THREE.Vector2(1, 1))
  items.forEach((_, i) => {
    images[i].then(({ img }) => {
      const t = new THREE.Texture(img as unknown as HTMLImageElement)
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
      textures.push(t)
      tvTex[i] = t
      const ta = img.width / img.height
      const pa = 0.98 / 0.74
      tvCover[i].set(ta > pa ? pa / ta : 1, ta > pa ? 1 : ta / pa)
      if (shown === i) applyTv(i)
    })
  })
  let shown = -1
  let staticT = 0
  const applyTv = (i: number) => {
    const t = tvTex[i]
    if (!t) return
    screenU.uTex.value = t
    screenU.uCover.value.copy(tvCover[i])
  }
  const showOnTv = (i: number) => {
    if (i === shown) return
    shown = i
    staticT = 1
    applyTv(i)
  }
  let attract = 0
  let attractT = 0

  // --- selection, stations, opening ----------------------------------------------------------------
  const selectInternal = (i: number, notify: boolean) => {
    if (i === selected) return
    selected = i
    if (i >= 0) showOnTv(i)
    drawDisplay()
    if (notify) o.onSelect(i)
  }
  const hitTarget = (ti: number) => {
    score += 500
    pushScore()
    sfx.ping()
    // targets are the first projects, in order
    selectInternal(ti, true)
  }
  const scoopHit = () => {
    score += 1000
    pushScore()
    sfx.confirm()
    if (selected >= 0 && !items[selected].next) openSelected(selected)
  }

  let station: Station = 'room'
  const STATIONS: Record<Station | 'insert', { p: THREE.Vector3; l: THREE.Vector3; fov: number }> = {
    room: { p: new THREE.Vector3(2.7, 2.0, 4.0), l: new THREE.Vector3(-0.6, 1.1, -0.9), fov: 48 },
    tv: { p: new THREE.Vector3(1.5, 2.0, 3.0), l: new THREE.Vector3(0.75, 1.35, -2.8), fov: 42 },
    play: { p: new THREE.Vector3(-1.7, 4.2, 3.2), l: new THREE.Vector3(-1.7, 0.75, 0.0), fov: 42 },
    insert: { p: new THREE.Vector3(0.0, 1.2, -1.3), l: new THREE.Vector3(-0.35, 1.1, -2.7), fov: 28 },
  }
  let target: keyof typeof STATIONS = 'room'
  let kick = 0
  const setStationInternal = (s: Station, notify = true) => {
    if (s === station && target === s) return
    station = s
    target = s
    kick = 1
    if (notify) o.onStation(s)
    sfx.tick()
  }

  // cartridge insert cinematic
  let inserting: { i: number; t: number } | null = null
  const openSelected = (i: number) => {
    if (inserting) return
    selectInternal(i, true)
    inserting = { i, t: 0 }
    target = 'insert'
    kick = 1
    sfx.confirm()
  }

  // --- post -----------------------------------------------------------------------------------------
  let composer: EffectComposer | null = null
  if (quality === 'high') {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.5, 0.9))
    composer.addPass(new OutputPass())
  }

  let width = 1
  let height = 1
  const resize = () => {
    width = Math.max(host.clientWidth, 1)
    height = Math.max(host.clientHeight, 1)
    renderer.setSize(width, height, false)
    composer?.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  // --- input ----------------------------------------------------------------------------------------
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let hasPointer = false
  const lean = new THREE.Vector2()
  let hoverCart = -1
  let hoverTv = false
  let hoverPin = false
  let downX = 0
  let downY = 0

  const pick = () => {
    if (!hasPointer) return null
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(pickables, false)[0]
    if (!hit) return null
    let n: THREE.Object3D | null = hit.object
    while (n) {
      const u = n.userData as Pickable['userData']
      if (u.cart !== undefined) return { cart: u.cart }
      if (u.tv) return { tv: true }
      if (u.pin) return { pin: true }
      n = n.parent
    }
    return null
  }
  const setNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    hasPointer = true
  }
  const onDown = (e: PointerEvent) => {
    downX = e.clientX
    downY = e.clientY
    setNdc(e)
  }
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8 || inserting) return
    setNdc(e)
    const h = pick()
    if (!h) return
    if ('cart' in h && h.cart !== undefined) {
      if (station === 'room') setStationInternal('tv')
      else if (selected === h.cart && !items[h.cart].next) openSelected(h.cart)
      else {
        selectInternal(h.cart, true)
        sfx.tick()
      }
    } else if ('tv' in h) {
      if (station !== 'tv') setStationInternal('tv')
      else if (selected >= 0 && !items[selected].next) openSelected(selected)
    } else if ('pin' in h) {
      if (station !== 'play') setStationInternal('play')
    }
  }
  const onMove = (e: PointerEvent) => setNdc(e)
  const onLeave = () => {
    hasPointer = false
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  // --- frame ---------------------------------------------------------------------------------------
  let time = 0
  let last = performance.now()
  let raf = 0
  let visible = true
  let disposed = false
  let plungerHeld = false
  let manual = false
  let frames = 0
  let frameSum = 0
  const camPos = STATIONS.room.p.clone().add(new THREE.Vector3(2, 2.5, 4))
  const camLook = STATIONS.room.l.clone()
  let camFov = 60
  if (reduced) {
    camPos.copy(STATIONS.room.p)
    camFov = STATIONS.room.fov
  }
  const tmp = new THREE.Vector3()

  const tick = (now: number) => {
    raf = 0
    if (disposed) return
    const rawDt = Math.max((now - last) / 1000, 0)
    const dt = Math.min(rawDt, 0.05)
    last = now
    time += dt

    if (quality === 'high' && frames < 100 && time > 1) {
      frames++
      frameSum += rawDt
      if (frames === 100 && frameSum / frames > 0.034) {
        quality = 'low'
        composer = null
        renderer.shadowMap.enabled = false
        lamp.castShadow = false
        renderer.setPixelRatio(1)
        resize()
      }
    }

    // physics only runs on the table, but keep it alive when you are looking at it
    if (plungerHeld) pb.charge(dt)
    if (station === 'play' || target === 'play') pb.step(dt)
    else pb.step(0)

    // camera
    // portrait screens get a farther, higher shot so the whole table (flippers included) fits
    const portrait = camera.aspect < 0.9
    const base = STATIONS[target]
    const st = portrait
      ? target === 'play'
        ? { p: new THREE.Vector3(-1.7, 5.1, 3.3), l: new THREE.Vector3(-1.7, 0.8, -0.2), fov: 46 }
        : { p: base.p.clone().add(new THREE.Vector3(0, 0.4, 1.6)), l: base.l, fov: base.fov + 14 }
      : base
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.6)
    camPos.lerp(st.p, k)
    camLook.lerp(st.l, k)
    camFov += (st.fov - camFov) * k
    kick *= Math.exp(-dt * 3)
    const lx = hasPointer && !reduced ? ndc.x : 0
    const ly = hasPointer && !reduced ? ndc.y : 0
    lean.x += (lx - lean.x) * (1 - Math.exp(-dt * 3))
    lean.y += (ly - lean.y) * (1 - Math.exp(-dt * 3))
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    camera.translateX(lean.x * 0.25)
    camera.translateY(lean.y * 0.12)
    if (!reduced) camera.rotateZ(kick * 0.02)
    const fov = camFov + kick * 7
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    // hover
    const h = inserting ? null : pick()
    hoverCart = h && 'cart' in h && h.cart !== undefined ? h.cart : -1
    hoverTv = !!(h && 'tv' in h)
    hoverPin = !!(h && 'pin' in h)
    canvas.style.cursor = h ? 'pointer' : 'default'

    // cartridges
    for (let i = 0; i < carts.length; i++) {
      const c = carts[i]
      const isSel = i === selected
      const lift = isSel ? 0.16 : i === hoverCart ? 0.06 : 0
      c.lift += (lift - c.lift) * (reduced ? 1 : 1 - Math.exp(-dt * 10))
      c.sel += ((isSel ? 1 : i === hoverCart ? 0.5 : 0) - c.sel) * (1 - Math.exp(-dt * 10))
      if (inserting && inserting.i === i) continue
      c.group.position.set(c.home.x, c.home.y + c.sel * 0.02, c.home.z + c.lift)
      ;(c.label.material as THREE.MeshBasicMaterial).color.setScalar(0.55 + c.sel * 0.45)
    }

    // insert animation, then open
    if (inserting) {
      inserting.t += dt
      const c = carts[inserting.i]
      if (c) {
        const p = clamp(inserting.t / 0.9, 0, 1)
        const e = p * p * (3 - 2 * p)
        const start = c.home.clone().add(new THREE.Vector3(0, 0.02, 0.16))
        const end = new THREE.Vector3(0.5, 0.72, -2.58)
        tmp.lerpVectors(start, end, e)
        tmp.y += Math.sin(e * Math.PI) * 0.7
        tmp.z += Math.sin(e * Math.PI) * 1.0
        c.group.position.copy(tmp)
        c.group.rotation.x = -e * 1.2
        c.group.rotation.y = e * 0.2
      }
      if (inserting.t > 0.95 && staticT < 0.5) staticT = 1
      if (inserting.t > 1.55) {
        const i = inserting.i
        inserting = null
        o.onOpen(i)
      }
    }

    // TV: attract loop when nothing is selected
    if (selected < 0 && projectCount > 0) {
      attractT += dt
      if (attractT > 4.5) {
        attractT = 0
        attract = (attract + 1) % projectCount
        showOnTv(attract)
      } else if (shown < 0) showOnTv(0)
    }
    staticT = Math.max(0, staticT - dt * 3.2)
    screenU.uTime.value = time
    screenU.uStatic.value = staticT
    screenU.uHover.value += ((hoverTv ? 1 : 0) - screenU.uHover.value) * (1 - Math.exp(-dt * 8))
    tvLight.intensity = 3.2 + Math.sin(time * 40) * 0.15 + staticT * 3

    // pinball render
    const b = pb.ball
    if (ballHidden > 0) {
      ballHidden -= dt
      ball.visible = false
    } else {
      ball.visible = true
      ball.position.copy(toLocal(b.x, b.y, 0.06 + b.r * 0.6))
    }
    const lf = pb.flippers.left
    const rf = pb.flippers.right
    flipL.rotation.y = lf.angle
    flipR.rotation.y = rf.angle
    plunger.position.copy(toLocal(0.54, -1.08 - 0.12 - pb.plunger * 0.1, 0.06))
    pb.bumpers.forEach((_, i) => {
      const m = bumperMeshes[i].material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.5 + pb.flash.bumpers[i] * 3
      bumperMeshes[i].position.y = 0.1 + pb.flash.bumpers[i] * 0.025
    })
    targetMeshes.forEach((t, i) => {
      const m = t.ring.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 0.35 + (i === selected ? 1.3 : 0) + pb.flash.targets[i] * 3
      ;(t.disc.material as THREE.MeshBasicMaterial).color.setScalar(i === selected ? 1 : 0.82)
    })
    ;(scoopRing.material as THREE.MeshBasicMaterial).color
      .set(ACCENT)
      .multiplyScalar(1.2 + pb.flash.scoop * 3)
    tableLight.intensity = station === 'play' ? 2.4 : 1.2
    void hoverPin

    if (composer) composer.render()
    else renderer.render(scene, camera)
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
  drawDisplay()
  document.fonts
    ?.load('700 40px "Barlow Condensed"')
    .then(drawDisplay)
    .catch(() => undefined)
  start()

  const api: Den = {
    setStation(s) {
      setStationInternal(s, false)
    },
    select(i) {
      selectInternal(i, false)
    },
    insert(i) {
      openSelected(i)
    },
    flipper(side, on) {
      if (side === 'left') pb.setLeft(on)
      else pb.setRight(on)
    },
    plunger(on) {
      if (on) plungerHeld = true
      else {
        plungerHeld = false
        pb.release()
      }
    },
    dispose() {
      disposed = true
      stop()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      disposables.forEach((d) => d.dispose())
      textures.forEach((t) => t.dispose())
      envTex.dispose()
      composer?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }

  // dev only: step the simulation by hand, for tests that run without animation frames
  if (import.meta.env.DEV) {
    ;(window as unknown as { __DEN__: unknown }).__DEN__ = {
      ...api,
      sim: (sec: number) => {
        for (let t = 0; t < sec; t += 1 / 60) pb.step(1 / 60)
      },
      /** run whole frames (physics, camera, insert cinematic) without waiting for rAF */
      advance: (sec: number) => {
        manual = true
        stop()
        for (let t = 0; t < sec; t += 1 / 60) tick(last + 1000 / 60)
        manual = false
        start()
      },
      ball: () => ({ ...pb.ball }),
    }
  }
  return api
}
