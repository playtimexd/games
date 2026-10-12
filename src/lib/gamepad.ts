import { useEffect, useRef, useState } from 'react'

interface Handlers {
  left?: () => void
  right?: () => void
  /** A / Cross */
  a?: () => void
  /** B / Circle */
  b?: () => void
}

/**
 * Standard-mapping gamepad navigation: d-pad or left stick to move, A to confirm, B to go back.
 * Polling only runs while a pad is connected and `enabled` is true.
 * Returns whether a pad is connected, so the UI can swap keyboard hints for pad hints.
 */
export function useGamepad(handlers: Handlers, enabled: boolean): boolean {
  const [connected, setConnected] = useState(false)
  const h = useRef(handlers)
  h.current = handlers

  useEffect(() => {
    const any = () => !!navigator.getGamepads?.().some(Boolean)
    const sync = () => setConnected(any())
    sync()
    window.addEventListener('gamepadconnected', sync)
    window.addEventListener('gamepaddisconnected', sync)
    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !connected) return
    let raf = 0
    let lastMove = 0
    const was = { l: false, r: false, a: false, b: false }
    const loop = (t: number) => {
      const pad = navigator.getGamepads?.().find(Boolean)
      if (pad) {
        const x = pad.axes[0] ?? 0
        const l = !!pad.buttons[14]?.pressed || x < -0.6
        const r = !!pad.buttons[15]?.pressed || x > 0.6
        const a = !!pad.buttons[0]?.pressed
        const b = !!pad.buttons[1]?.pressed
        if (l && (!was.l || t - lastMove > 260)) {
          h.current.left?.()
          lastMove = t
        }
        if (r && (!was.r || t - lastMove > 260)) {
          h.current.right?.()
          lastMove = t
        }
        if (a && !was.a) h.current.a?.()
        if (b && !was.b) h.current.b?.()
        Object.assign(was, { l, r, a, b })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [enabled, connected])

  return connected
}
