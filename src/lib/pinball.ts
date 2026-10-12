/**
 * Pinball physics. Pure 2D, no rendering, no DOM, so it can be run headless.
 *
 * Coordinates are table meters: x runs left to right, y runs from the flippers (negative)
 * up the table to the arch (positive). The playfield is 1.24 wide and 2.3 long, the ball has
 * radius 0.054 (a real table scaled by 2 so it reads on screen).
 *
 * Movement is integrated in small fixed sub-steps so a fast ball cannot tunnel through a
 * wall or flipper.
 */

export interface Vec {
  x: number
  y: number
}

export interface Circle extends Vec {
  r: number
}

export interface Seg {
  a: Vec
  b: Vec
  /** a horizontal gate the ball can rise through but not fall back through */
  oneWay?: boolean
}

export interface FlipperState {
  pivot: Vec
  length: number
  /** angle of the flipper relative to +x, radians */
  angle: number
  rest: number
  up: number
  /** +1 for a flipper on the right (it points left), -1 for the left one */
  dir: number
  held: boolean
  /** angular velocity this step, used to give the ball a kick */
  omega: number
}

export interface PinballEvents {
  onTarget(index: number): void
  onBumper(index: number): void
  onScoop(): void
  onDrain(): void
  onFlip(): void
  onLaunch(): void
  onWall(speed: number): void
}

export const TABLE = {
  halfWidth: 0.62,
  top: 1.22,
  bottom: -1.2,
  laneX: 0.46,
  /** centre line of the play area, left of the launch lane */
  cx: -0.08,
}

const BALL_R = 0.054
const GRAVITY = 2.9
const STEP = 1 / 480
const MAX_SPEED = 6.2

const norm = (x: number, y: number) => {
  const l = Math.hypot(x, y) || 1
  return { x: x / l, y: y / l }
}

function closestOnSeg(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)))
  return { x: a.x + abx * t, y: a.y + aby * t }
}

export interface Pinball {
  ball: { x: number; y: number; vx: number; vy: number; r: number; inLane: boolean }
  flippers: { left: FlipperState; right: FlipperState }
  bumpers: Circle[]
  targets: Circle[]
  scoop: Circle
  walls: Seg[]
  /** hit flash timers, 0..1, for the renderer */
  flash: { bumpers: number[]; targets: number[]; scoop: number }
  plunger: number
  setLeft(on: boolean): void
  setRight(on: boolean): void
  /** hold to charge, call release to fire */
  charge(dt: number): void
  release(): void
  resetBall(): void
  step(dt: number): void
}

/** Target slots, offsets from the table centre line, in the order projects fill them. */
const SLOTS: [number, number][] = [
  [0, 0.99],
  [-0.2, 0.96],
  [0.2, 0.96],
  [-0.4, 0.42],
  [0.4, 0.42],
  [-0.4, 0.04],
  [0.4, 0.04],
  [-0.38, -0.22],
  [0.38, -0.22],
  [-0.2, -0.05],
]

export const MAX_TARGETS = SLOTS.length

export function createPinball(targetCount: number, events: PinballEvents): Pinball {
  const { halfWidth, laneX, cx } = TABLE
  const walls: Seg[] = []
  const seg = (ax: number, ay: number, bx: number, by: number, oneWay = false) =>
    walls.push({ a: { x: ax, y: ay }, b: { x: bx, y: by }, oneWay })

  // outer walls and the arch
  seg(-halfWidth, -0.5, -halfWidth, 0.6)
  seg(halfWidth, -1.08, halfWidth, 0.6)
  const arcSteps = 28
  let prev: Vec = { x: -halfWidth, y: 0.6 }
  for (let i = 1; i <= arcSteps; i++) {
    const a = Math.PI - (i / arcSteps) * Math.PI
    const p = { x: Math.cos(a) * halfWidth, y: 0.6 + Math.sin(a) * halfWidth }
    seg(prev.x, prev.y, p.x, p.y)
    prev = p
  }
  // launch lane wall and floor
  seg(laneX, -1.08, laneX, 0.8)
  seg(laneX, 0.8, halfWidth, 0.8, true)
  seg(laneX, -1.08, halfWidth, -1.08)
  // inlane guides down to the flipper pivots
  const lp = { x: cx - 0.28, y: -0.92 }
  const rp = { x: cx + 0.28, y: -0.92 }
  seg(-halfWidth, -0.5, lp.x, lp.y)
  seg(laneX, -0.5, rp.x, rp.y)
  // slingshot-ish deflectors above the guides
  seg(-halfWidth + 0.06, -0.3, cx - 0.36, -0.7)
  seg(laneX - 0.06, -0.3, cx + 0.36, -0.7)

  const bumpers: Circle[] = [
    { x: cx - 0.22, y: 0.55, r: 0.085 },
    { x: cx + 0.22, y: 0.55, r: 0.085 },
    { x: cx, y: 0.7, r: 0.085 },
  ]
  const targets: Circle[] = SLOTS.slice(0, Math.min(targetCount, MAX_TARGETS)).map(([dx, y]) => ({
    x: cx + dx,
    y,
    r: 0.075,
  }))
  const scoop: Circle = { x: cx, y: 0.26, r: 0.07 }

  const mkFlip = (pivot: Vec, dir: number): FlipperState => {
    const rest = dir > 0 ? Math.PI + 0.46 : -0.46
    const up = dir > 0 ? Math.PI - 0.5 : 0.5
    return { pivot, length: 0.2, angle: rest, rest, up, dir, held: false, omega: 0 }
  }
  const left = mkFlip(lp, -1)
  const right = mkFlip(rp, 1)

  const ball = { x: 0.54, y: -0.96, vx: 0, vy: 0, r: BALL_R, inLane: true }
  const flash = {
    bumpers: bumpers.map(() => 0),
    targets: targets.map(() => 0),
    scoop: 0,
  }
  let plunger = 0
  let stuck = 0
  let launchedAt = 0
  let time = 0
  let acc = 0

  const resetBall = () => {
    ball.x = 0.54
    ball.y = -0.96
    ball.vx = 0
    ball.vy = 0
    ball.inLane = true
    stuck = 0
  }

  const bounceOff = (n: Vec, restitution: number, kick = 0) => {
    const vn = ball.vx * n.x + ball.vy * n.y
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * n.x
      ball.vy -= (1 + restitution) * vn * n.y
    }
    if (kick > 0) {
      const sp = Math.hypot(ball.vx, ball.vy)
      const want = Math.max(sp, kick)
      const d = norm(ball.vx, ball.vy)
      ball.vx = d.x * want
      ball.vy = d.y * want
    }
  }

  const stepOnce = (dt: number) => {
    time += dt
    // flippers
    for (const f of [left, right]) {
      const target = f.held ? f.up : f.rest
      const speed = f.held ? 22 : 12
      const before = f.angle
      const diff = target - f.angle
      const move = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt)
      f.angle += move
      f.omega = (f.angle - before) / dt
    }

    ball.vy -= GRAVITY * dt
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    // walls
    for (const w of walls) {
      if (w.oneWay && !(ball.vy < 0 && ball.y > w.a.y)) continue
      const c = closestOnSeg(ball, w.a, w.b)
      const dx = ball.x - c.x
      const dy = ball.y - c.y
      const d = Math.hypot(dx, dy)
      if (d < ball.r) {
        const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 }
        ball.x = c.x + n.x * ball.r
        ball.y = c.y + n.y * ball.r
        const sp = Math.abs(ball.vx * n.x + ball.vy * n.y)
        bounceOff(n, 0.45)
        if (sp > 0.8) events.onWall(sp)
      }
    }

    // flippers
    for (const f of [left, right]) {
      const tip = { x: f.pivot.x + Math.cos(f.angle) * f.length, y: f.pivot.y + Math.sin(f.angle) * f.length }
      const c = closestOnSeg(ball, f.pivot, tip)
      const dx = ball.x - c.x
      const dy = ball.y - c.y
      const d = Math.hypot(dx, dy)
      const rad = 0.022
      if (d < ball.r + rad) {
        const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 }
        ball.x = c.x + n.x * (ball.r + rad)
        ball.y = c.y + n.y * (ball.r + rad)
        // surface velocity of the flipper at the contact point
        const rx = c.x - f.pivot.x
        const ry = c.y - f.pivot.y
        const fvx = -f.omega * ry
        const fvy = f.omega * rx
        const rvx = ball.vx - fvx
        const rvy = ball.vy - fvy
        const vn = rvx * n.x + rvy * n.y
        if (vn < 0) {
          ball.vx -= (1 + 0.35) * vn * n.x
          ball.vy -= (1 + 0.35) * vn * n.y
        }
      }
    }

    // bumpers
    bumpers.forEach((b, i) => {
      const dx = ball.x - b.x
      const dy = ball.y - b.y
      const d = Math.hypot(dx, dy)
      if (d < ball.r + b.r) {
        const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 }
        ball.x = b.x + n.x * (ball.r + b.r)
        ball.y = b.y + n.y * (ball.r + b.r)
        bounceOff(n, 0.9, 1.9)
        flash.bumpers[i] = 1
        events.onBumper(i)
      }
    })

    // targets
    targets.forEach((t, i) => {
      const dx = ball.x - t.x
      const dy = ball.y - t.y
      const d = Math.hypot(dx, dy)
      if (d < ball.r + t.r) {
        const n = d > 1e-6 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 }
        ball.x = t.x + n.x * (ball.r + t.r)
        ball.y = t.y + n.y * (ball.r + t.r)
        bounceOff(n, 0.7, 1.2)
        if (flash.targets[i] < 0.6) events.onTarget(i)
        flash.targets[i] = 1
      }
    })

    // scoop: a hole. The ball is swallowed and kicked back out after the event.
    {
      const dx = ball.x - scoop.x
      const dy = ball.y - scoop.y
      if (Math.hypot(dx, dy) < scoop.r && flash.scoop < 0.2) {
        flash.scoop = 1
        events.onScoop()
        ball.x = scoop.x
        ball.y = scoop.y - 0.12
        ball.vx = (Math.random() - 0.5) * 1.2
        ball.vy = -1.2
      }
    }

    // lane state, speed limit
    ball.inLane = ball.x > laneX && ball.y < 0.8
    const sp = Math.hypot(ball.vx, ball.vy)
    if (sp > MAX_SPEED) {
      ball.vx *= MAX_SPEED / sp
      ball.vy *= MAX_SPEED / sp
    }

    // drain
    if (ball.y < TABLE.bottom - 0.1) {
      events.onDrain()
      resetBall()
    }

    // nudge a ball that has come to rest somewhere it cannot leave
    if (!ball.inLane && sp < 0.03) {
      stuck += dt
      if (stuck > 2.5) {
        ball.vx = (Math.random() - 0.5) * 1.5
        ball.vy = 1.2
        stuck = 0
      }
    } else stuck = 0
    launchedAt = Math.max(0, launchedAt - dt)
    void time
  }

  return {
    ball,
    flippers: { left, right },
    bumpers,
    targets,
    scoop,
    walls,
    flash,
    get plunger() {
      return plunger
    },
    set plunger(v: number) {
      plunger = v
    },
    setLeft(on) {
      if (on && !left.held) events.onFlip()
      left.held = on
    },
    setRight(on) {
      if (on && !right.held) events.onFlip()
      right.held = on
    },
    charge(dt) {
      plunger = Math.min(1, plunger + dt * 1.4)
    },
    release() {
      if (ball.inLane && Math.abs(ball.vy) < 0.3) {
        const v = 3.6 + plunger * 2.2
        ball.vy = v
        ball.vx = 0
        events.onLaunch()
      }
      plunger = 0
    },
    resetBall,
    step(dt) {
      acc += Math.min(dt, 0.05)
      let n = 0
      while (acc >= STEP && n < 40) {
        stepOnce(STEP)
        acc -= STEP
        n++
      }
      const decay = Math.min(dt, 0.05) * 2.5
      flash.bumpers = flash.bumpers.map((v) => Math.max(0, v - decay))
      flash.targets = flash.targets.map((v) => Math.max(0, v - decay))
      flash.scoop = Math.max(0, flash.scoop - decay)
    },
  } as Pinball
}
