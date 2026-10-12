import type { ReactNode } from 'react'

/** A 1px bordered cut-corner panel. Put sizing classes (aspect, width) on `className`. */
export function Frame({
  children,
  className = '',
  inner = '',
  active,
}: {
  children: ReactNode
  className?: string
  inner?: string
  active?: boolean
}) {
  return (
    <div className={`frame ${className}`} data-active={active}>
      <div className={`frame-in ${inner}`}>{children}</div>
    </div>
  )
}
