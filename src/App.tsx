import { useEffect, useState } from 'react'
import { AnimatePresence, MotionConfig } from 'motion/react'
import { parseRoute, useHash } from './lib/route'
import { Nav } from './components/Nav'
import { Arcade } from './components/Arcade'
import { Work } from './components/Work'
import { About } from './components/About'
import { Achievements } from './components/Achievements'
import { Contact } from './components/Contact'
import { ProjectPage } from './components/ProjectPage'
import { Boot, BOOT_KEY } from './components/Boot'

/** Boot shows once per session, and only when the visitor lands on the home page. */
const shouldBoot = () => {
  try {
    if (sessionStorage.getItem(BOOT_KEY)) return false
  } catch {
    /* ignore */
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  return parseRoute(window.location.hash).name === 'home' && !window.location.hash
}

export default function App() {
  const hash = useHash()
  const route = parseRoute(hash)
  const key = route.name === 'project' ? `p:${route.slug}` : `home:${hash}`
  const [booting, setBooting] = useState(shouldBoot)

  // Scroll: a project page starts at the top; home jumps to the named section or restores the spot.
  useEffect(() => {
    if (route.name === 'project') {
      window.scrollTo(0, 0)
      return
    }
    const id = hash.replace(/^#/, '')
    const target = id && !id.startsWith('/') ? document.getElementById(id) : null
    if (target) {
      target.scrollIntoView()
      return
    }
    let y = 0
    try {
      // A fresh visit starts at the street entrance, a return from a project restores the spot.
      if (sessionStorage.getItem(BOOT_KEY)) y = Number(sessionStorage.getItem('homeY') ?? 0)
    } catch {
      /* ignore */
    }
    window.scrollTo(0, y)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remember where on home the visitor left from, when they open a project.
  useEffect(() => {
    if (route.name !== 'home') return
    return () => {
      try {
        sessionStorage.setItem('homeY', String(window.scrollY))
      } catch {
        /* ignore */
      }
    }
  }, [route.name])

  return (
    <MotionConfig reducedMotion="user">
      <Nav home={route.name === 'home'} />
      {route.name === 'project' ? (
        <ProjectPage slug={route.slug} />
      ) : (
        <main>
          <Arcade />
          <Work />
          <About />
          <Achievements />
        </main>
      )}
      <Contact />
      <AnimatePresence>{booting && <Boot onDone={() => setBooting(false)} />}</AnimatePresence>
    </MotionConfig>
  )
}
