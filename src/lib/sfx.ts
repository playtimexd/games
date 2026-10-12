import { useSyncExternalStore } from 'react'

/**
 * Tiny synthesized UI sounds (no audio files). Off until the visitor opts in on
 * the boot screen or the nav toggle, which is also the user gesture browsers need.
 */

const KEY = 'sfx'
let ctx: AudioContext | null = null
let enabled = false
const listeners = new Set<() => void>()

try {
  enabled = localStorage.getItem(KEY) === 'on'
} catch {
  /* storage unavailable */
}

const emit = () => listeners.forEach((l) => l())

function audio(): AudioContext | null {
  if (!enabled) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function beep(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, at = 0) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + at
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

export const sfx = {
  get enabled() {
    return enabled
  },
  set(on: boolean) {
    enabled = on
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      /* ignore */
    }
    emit()
    if (on) this.confirm()
  },
  tick: () => beep(1180, 0.045, 'square', 0.035, 760),
  confirm() {
    beep(520, 0.09, 'square', 0.05)
    beep(780, 0.14, 'square', 0.05, undefined, 0.07)
  },
  back: () => beep(420, 0.12, 'square', 0.045, 260),
  boot() {
    beep(180, 0.5, 'sawtooth', 0.04, 720)
  },
}

export const useSfx = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => enabled,
    () => false,
  )
