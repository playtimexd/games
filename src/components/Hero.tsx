import { motion } from 'motion/react'
import { ArrowDown } from '@phosphor-icons/react'
import { site } from '../data/site'
import { HeroVisual } from './HeroVisual'

const ease = [0.16, 1, 0.3, 1] as const

export function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-16 pt-10 md:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-12 lg:gap-6 lg:pt-16">
      <div className="lg:col-span-5">
        <h1 className="text-5xl font-semibold leading-[0.98] tracking-tighter md:text-6xl xl:text-7xl">
          {site.headline.map((line, i) => (
            <span key={line} className="block overflow-hidden pb-1">
              <motion.span
                className="block"
                initial={{ y: '105%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease, delay: 0.05 + i * 0.1 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p
          className="mt-6 max-w-[40ch] text-lg leading-relaxed text-muted"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.3 }}
        >
          {site.intro}
        </motion.p>
        <motion.div
          className="mt-8 flex flex-wrap items-center gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease, delay: 0.4 }}
        >
          <a
            href="#work"
            className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 text-sm font-semibold text-accent-ink transition active:translate-y-px active:scale-[0.98] hover:brightness-105"
          >
            See the work
            <ArrowDown size={16} weight="bold" />
          </a>
          <a
            href="#contact"
            className="inline-flex h-12 items-center whitespace-nowrap rounded-full border border-line px-6 text-sm font-semibold transition hover:bg-surface-2 active:translate-y-px active:scale-[0.98]"
          >
            Contact
          </a>
        </motion.div>
      </div>

      <motion.div
        className="lg:col-span-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.15 }}
      >
        <HeroVisual />
      </motion.div>
    </section>
  )
}
