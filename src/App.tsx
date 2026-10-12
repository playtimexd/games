import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { parseRoute, useHash } from './lib/route'
import { Nav } from './components/Nav'
import { Cartridges } from './components/Cartridges'
import { ProjectPage } from './components/ProjectPage'
import { Sidebar } from './components/Sidebar'

export default function App() {
  const hash = useHash()
  const route = parseRoute(hash)
  const [menu, setMenu] = useState(false)

  // A project page starts at the top, and the menu closes whenever you land somewhere.
  useEffect(() => {
    window.scrollTo(0, 0)
    setMenu(false)
  }, [hash])

  return (
    <MotionConfig reducedMotion="user">
      <Nav onMenu={() => setMenu(true)} />
      {route.name === 'project' ? (
        <ProjectPage slug={route.slug} />
      ) : (
        <main>
          <Cartridges />
        </main>
      )}
      <Sidebar open={menu} onClose={() => setMenu(false)} />
    </MotionConfig>
  )
}
