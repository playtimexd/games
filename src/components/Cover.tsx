import { asset } from '../lib/route'
import { hueOf, type Project } from '../data/projects'

/** A project's image, or a generated cover when it has none yet. */
export function Cover({
  project,
  className = '',
  priority = false,
  src,
}: {
  project: Project
  className?: string
  priority?: boolean
  /** Override with a specific shot. */
  src?: string
}) {
  const path = src ?? project.cover
  if (path) {
    return (
      <img
        src={asset(path)}
        alt={`${project.title} gameplay`}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={`size-full object-cover ${className}`}
      />
    )
  }
  const h = hueOf(project)
  return (
    <div
      role="img"
      aria-label={`${project.title} cover`}
      className={`relative size-full overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 20% 10%, hsl(${h} 70% 42%), transparent 60%), radial-gradient(90% 80% at 90% 100%, hsl(${(h + 40) % 360} 60% 32%), transparent 65%), hsl(${h} 30% 10%)`,
      }}
    >
      <span className="absolute bottom-[8%] left-[5%] right-[5%] text-[clamp(1.5rem,4vw,3rem)] font-semibold leading-none tracking-tighter text-[#f2f2f4]">
        {project.title}
      </span>
    </div>
  )
}
