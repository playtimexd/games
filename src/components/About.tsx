import { site } from '../data/site'

export function About() {
  return (
    <section id="about" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h2 className="text-3xl font-semibold leading-[1.1] tracking-tighter md:text-5xl">
            {site.about.statement}
          </h2>
        </div>
        <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:col-span-6 lg:col-start-7">
          {site.about.responsibilities.map((r) => (
            <div key={r.title}>
              <dt className="text-lg font-semibold tracking-tight">{r.title}</dt>
              <dd className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted">{r.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
