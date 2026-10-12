import { useEffect } from 'react'
import { MotionConfig } from 'motion/react'
import { parseRoute, useHash } from './lib/route'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Work } from './components/Work'
import { About } from './components/About'
import { Contact } from './components/Contact'
import { ProjectPage } from './components/ProjectPage'

export default function App() {
  const hash = useHash()
  const route = parseRoute(hash)
  const key = route.name === 'project' ? `p:${route.slug}` : `home:${hash}`

  // Scroll: new project page starts at top; home restores the spot you left,
  // or jumps to the section named in the hash.
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
      y = Number(sessionStorage.getItem('homeY') ?? 0)
    } catch {
      /* ignore */
    }
    window.scrollTo(0, y)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      {route.name === 'project' ? (
        <ProjectPage slug={route.slug} />
      ) : (
        <main>
          <Hero />
          <Work />
          <About />
        </main>
      )}
      <Contact />
    </MotionConfig>
  )
}
