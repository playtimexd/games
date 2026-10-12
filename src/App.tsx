import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { parseRoute, useHash } from './lib/route'
import { Nav } from './components/Nav'
import { Cartridges } from './components/Cartridges'
import { Work } from './components/Work'
import { About } from './components/About'
import { Contact } from './components/Contact'
import { ProjectPage } from './components/ProjectPage'

export default function App() {
  const hash = useHash()
  const route = parseRoute(hash)
  const key = route.name === 'project' ? `p:${route.slug}` : `home:${hash}`

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
      // A return from a project restores the spot.
      y = Number(sessionStorage.getItem('homeY') ?? 0)
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
      <Nav />
      {route.name === 'project' ? (
        <ProjectPage slug={route.slug} />
      ) : (
        <main>
          <Cartridges />
          <Work />
          <About />
        </main>
      )}
      <Contact />
    </MotionConfig>
  )
}
